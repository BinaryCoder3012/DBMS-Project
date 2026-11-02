/**
 * UniGrant — Express + MySQL2 REST API
 * ──────────────────────────────────────
 * Runs on port 3001 (Vite proxies /api → here).
 *
 * Start:  npm start        Dev: npm run dev        Tests: npm test
 *
 * Configuration comes from server/.env (see .env.example):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME, PORT, AUTH_SECRET
 *
 * Business rules live in MySQL. This layer authenticates the caller, applies
 * the role guard and row filters, runs multi-statement transactions, and turns
 * database errors into HTTP responses.
 */

require("dotenv").config({ quiet: true });

const crypto  = require("crypto");
const express = require("express");
const cors    = require("cors");
const mysql   = require("mysql2/promise");
const QUERIES = require("./queries.js");

const app = express();
app.use(cors());
app.use(express.json());

// ── Database connection pool ──────────────────────────────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST || "localhost",
  port:               Number(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER || "root",
  password:           process.env.DB_PASS || "",
  database:           process.env.DB_NAME || "unigrant",
  waitForConnections: true,
  connectionLimit:    10,
  enableKeepAlive:    true,
  decimalNumbers:     true,   // DECIMAL arrives as a number, not a string
  dateStrings:        true,   // DATE arrives as 'YYYY-MM-DD', free of timezone shifts
});

app.locals.pool = pool; // lets the tests close it

// ── Errors ────────────────────────────────────────────────────────────────────
// Maps a mysql2 error to an HTTP response. Rule violations signalled by the
// database become 4xx with the database's own message, so the UI can show why.
function httpError(status, message) {
  const err = new Error(message);
  err.httpStatus = status;
  return err;
}

function sendError(res, err) {
  if (err.httpStatus) return res.status(err.httpStatus).json({ error: err.message });
  if (err.sqlState === "45000")                      return res.status(422).json({ error: err.sqlMessage, code: "BUSINESS_RULE" });
  if (err.code === "ER_CHECK_CONSTRAINT_VIOLATED")   return res.status(422).json({ error: err.sqlMessage, code: "CHECK_CONSTRAINT" });
  if (err.code === "ER_DUP_ENTRY")                   return res.status(409).json({ error: err.sqlMessage, code: "DUPLICATE" });
  if (err.code === "ER_NO_REFERENCED_ROW_2")         return res.status(400).json({ error: "A referenced row does not exist.", code: "FOREIGN_KEY" });
  if (err.code === "ER_ROW_IS_REFERENCED_2")         return res.status(409).json({ error: "Other rows still depend on this one.", code: "FOREIGN_KEY" });
  if (err.code === "ER_BAD_NULL_ERROR")              return res.status(400).json({ error: err.sqlMessage, code: "NOT_NULL" });
  console.error(err);
  res.status(500).json({ error: "Database error" });
}

// Wraps a handler so a thrown or rejected error reaches sendError.
const route = fn => (req, res) => Promise.resolve(fn(req, res)).catch(err => sendError(res, err));

// Runs fn inside one transaction: commit on success, rollback on any error.
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Sessions and the role guard ───────────────────────────────────────────────
// A session token is the user's id and role plus an expiry, signed with HMAC-SHA256.
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_HOURS = 8;

const sign = payload => crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

function issueToken(user) {
  const payload = Buffer.from(JSON.stringify({
    user_id: user.user_id,
    role: user.role,
    exp: Date.now() + TOKEN_HOURS * 3600 * 1000,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  return claims.exp > Date.now() ? claims : null;
}

function auth(req, res, next) {
  const claims = readToken((req.headers.authorization || "").replace(/^Bearer /, ""));
  if (!claims) return res.status(401).json({ error: "Sign in to continue." });
  req.user = claims;
  next();
}

// Mirrors the GRANTs in schema/04_rbac.sql for requests through the API.
const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : res.status(403).json({ error: `The ${req.user.role} role cannot do this.` });

const OFFICE = ["Admin", "Grant_Officer"];
const STAFF  = ["Admin", "Grant_Officer", "PI"];

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await pool.execute("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// ── Authentication ────────────────────────────────────────────────────────────
// POST /api/auth/login   Body: { email, password }   →   user row + session token
app.post("/api/auth/login", route(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw httpError(400, "email and password required");
  const [rows] = await pool.execute(
    `SELECT user_id, first_name, last_name, email, role,
            dept_id, specialization, phone, hire_date
     FROM User
     WHERE email = ? AND password_hash = SHA2(?, 256)`,
    [email, password]
  );
  if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ ...rows[0], token: issueToken(rows[0]) });
}));

// ── Reads ─────────────────────────────────────────────────────────────────────
// Every read below needs a session. Rows are narrowed to what the role may see.

// GET /api/users — names for everyone, contact details for staff only
app.get("/api/users", auth, route(async (req, res) => {
  const staff = req.user.role !== "Student";
  const [rows] = await pool.execute(staff
    ? `SELECT user_id, first_name, last_name, email, role,
              dept_id, specialization, phone, hire_date
       FROM User`
    : `SELECT user_id, first_name, last_name, role, dept_id FROM User`);
  res.json(rows);
}));

// GET /api/departments
app.get("/api/departments", auth, route(async (_req, res) => {
  const [rows] = await pool.execute("SELECT * FROM Department");
  res.json(rows);
}));

// GET /api/proposals — a PI sees their own; the research office sees all
app.get("/api/proposals", auth, allow(...STAFF), route(async (req, res) => {
  const [rows] = req.user.role === "PI"
    ? await pool.execute("SELECT * FROM Proposal WHERE pi_id = ?", [req.user.user_id])
    : await pool.execute("SELECT * FROM Proposal");
  res.json(rows.map(r => ({ ...r, eligibility_check_passed: !!r.eligibility_check_passed })));
}));

// GET /api/grants
app.get("/api/grants", auth, allow(...STAFF), route(async (_req, res) => {
  const [rows] = await pool.execute("SELECT * FROM Grant_");
  res.json(rows);
}));

// GET /api/projects — students read Student_Project_View, which has no money columns
app.get("/api/projects", auth, route(async (req, res) => {
  let rows;
  if (req.user.role === "Student") {
    [rows] = await pool.execute("SELECT * FROM Student_Project_View WHERE student_id = ?", [req.user.user_id]);
  } else if (req.user.role === "PI") {
    [rows] = await pool.execute("SELECT * FROM Project WHERE pi_id = ?", [req.user.user_id]);
  } else {
    [rows] = await pool.execute("SELECT * FROM Project");
  }
  res.json(rows);
}));

// GET /api/budget-heads
app.get("/api/budget-heads", auth, allow(...STAFF), route(async (req, res) => {
  const [rows] = req.user.role === "PI"
    ? await pool.execute(
        `SELECT bh.* FROM BudgetHead bh
         JOIN Project p ON bh.project_id = p.project_id
         WHERE p.pi_id = ?`, [req.user.user_id])
    : await pool.execute("SELECT * FROM BudgetHead");
  res.json(rows);
}));

// GET /api/expenses
app.get("/api/expenses", auth, allow(...STAFF), route(async (req, res) => {
  const [rows] = req.user.role === "PI"
    ? await pool.execute(
        `SELECT e.* FROM Expense e
         JOIN Project p ON e.project_id = p.project_id
         WHERE p.pi_id = ?`, [req.user.user_id])
    : await pool.execute("SELECT * FROM Expense");
  res.json(rows);
}));

// GET /api/milestones
app.get("/api/milestones", auth, route(async (_req, res) => {
  const [rows] = await pool.execute("SELECT * FROM Milestone");
  res.json(rows.map(r => ({ ...r, report_submitted: !!r.report_submitted })));
}));

// GET /api/research-outputs
app.get("/api/research-outputs", auth, route(async (_req, res) => {
  const [rows] = await pool.execute("SELECT * FROM ResearchOutput");
  res.json(rows);
}));

// GET /api/external-calls — joins FundingAgency to surface focus areas
app.get("/api/external-calls", auth, route(async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT ec.call_id, ec.title, ec.description, ec.deadline, ec.max_budget,
            COALESCE(fa.funding_focus_areas, '') AS focus
     FROM ExternalCall ec
     LEFT JOIN FundingAgency fa ON ec.agency_id = fa.agency_id`
  );
  res.json(rows);
}));

// GET /api/works-on — a student sees their own assignments, without stipends of others
app.get("/api/works-on", auth, route(async (req, res) => {
  const [rows] = req.user.role === "Student"
    ? await pool.execute("SELECT * FROM WORKS_ON WHERE user_id = ?", [req.user.user_id])
    : await pool.execute("SELECT * FROM WORKS_ON");
  res.json(rows);
}));

// ── Proposals ─────────────────────────────────────────────────────────────────

// POST /api/proposals — create a Draft. active_project_limit_pi may refuse it (BR3).
app.post("/api/proposals", auth, allow("PI", "Admin"), route(async (req, res) => {
  const { title, abstract, total_budget_requested, duration_months } = req.body;
  const pi_id = req.user.role === "PI" ? req.user.user_id : req.body.pi_id;
  const [result] = await pool.execute(
    `INSERT INTO Proposal
       (title, abstract, total_budget_requested, duration_months,
        submission_date, status, eligibility_check_passed, pi_id)
     VALUES (?, ?, ?, ?, CURDATE(), 'Draft', TRUE, ?)`,
    [title ?? null, abstract || "", total_budget_requested ?? null, duration_months ?? null, pi_id ?? null]
  );
  res.status(201).json({ proposal_id: result.insertId });
}));

// PATCH /api/proposals/:id/status — moves a proposal along its life cycle
const NEXT_STATUS = {
  Draft:          { Submitted: ["PI", "Admin"] },
  Submitted:      { "Under Review": OFFICE, Rejected: OFFICE },
  "Under Review": { Rejected: OFFICE },
};

app.patch("/api/proposals/:id/status", auth, allow(...STAFF), route(async (req, res) => {
  const { status } = req.body;
  await transaction(async conn => {
    const [[proposal]] = await conn.execute(
      "SELECT status, pi_id FROM Proposal WHERE proposal_id = ? FOR UPDATE", [req.params.id]);
    if (!proposal) throw httpError(404, "Proposal not found");
    if (req.user.role === "PI" && proposal.pi_id !== req.user.user_id) throw httpError(403, "This is not your proposal.");
    const roles = NEXT_STATUS[proposal.status]?.[status];
    if (!roles) throw httpError(409, `A ${proposal.status} proposal cannot move to ${status}.`);
    if (!roles.includes(req.user.role)) throw httpError(403, `The ${req.user.role} role cannot make this change.`);
    await conn.execute("UPDATE Proposal SET status = ? WHERE proposal_id = ?", [status, req.params.id]);
  });
  res.json({ success: true });
}));

// ── Workflow W1: award a grant ────────────────────────────────────────────────
// POST /api/grants/award
// One transaction approves the proposal and inserts the Grant_, Project and
// BudgetHead rows. Any failure rolls all of them back.
const CATEGORIES = ["Equipment", "Travel", "Manpower", "Consumables", "Other"];

app.post("/api/grants/award", auth, allow(...OFFICE), route(async (req, res) => {
  const { proposal_id, funding_agency, agency_contact_info, reporting_frequency,
          start_date, end_date, department_id, budget_heads } = req.body;

  if (!Array.isArray(budget_heads) || budget_heads.length === 0) throw httpError(400, "At least one budget head is required.");
  if (budget_heads.some(h => !CATEGORIES.includes(h.category))) throw httpError(400, "Unknown budget category.");

  const result = await transaction(async conn => {
    const [[proposal]] = await conn.execute(
      `SELECT p.proposal_id, p.title, p.abstract, p.status, p.pi_id, u.dept_id
       FROM Proposal p JOIN User u ON p.pi_id = u.user_id
       WHERE p.proposal_id = ? FOR UPDATE`, [proposal_id ?? null]);
    if (!proposal) throw httpError(404, "Proposal not found");
    if (!["Submitted", "Under Review"].includes(proposal.status)) {
      throw httpError(409, `A ${proposal.status} proposal cannot be awarded.`);
    }

    const total = budget_heads.reduce((sum, h) => sum + Number(h.allocated_amount), 0);

    const [grant] = await conn.execute(
      `INSERT INTO Grant_
         (grant_title, total_amount_awarded, start_date, end_date, status,
          funding_agency, agency_contact_info, reporting_frequency, proposal_id)
       VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?)`,
      [proposal.title, total, start_date ?? null, end_date ?? null, funding_agency ?? null,
       agency_contact_info ?? null, reporting_frequency ?? null, proposal.proposal_id]);

    const [project] = await conn.execute(
      `INSERT INTO Project
         (project_title, description, start_date, end_date, status,
          current_balance, department_id, grant_id, pi_id)
       VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?)`,
      [proposal.title, proposal.abstract, start_date ?? null, end_date ?? null, total,
       department_id ?? proposal.dept_id, grant.insertId, proposal.pi_id]);

    for (const head of budget_heads) {
      await conn.execute(
        `INSERT INTO BudgetHead (project_id, category, allocated_amount, fiscal_year)
         VALUES (?, ?, ?, YEAR(?))`,
        [project.insertId, head.category, head.allocated_amount ?? null, start_date ?? null]);
    }

    await conn.execute("UPDATE Proposal SET status = 'Approved' WHERE proposal_id = ?", [proposal.proposal_id]);
    return { grant_id: grant.insertId, project_id: project.insertId, total };
  });
  res.status(201).json(result);
}));

// ── Workflow W2: expenses ─────────────────────────────────────────────────────

// POST /api/expenses — a Pending expense. The BEFORE INSERT triggers refuse an
// overspend (BR1) or a repeated receipt (BR4) with SQLSTATE 45000.
app.post("/api/expenses", auth, allow("PI", "Admin"), route(async (req, res) => {
  const { project_id, budgethead_id, amount, description, receipt_reference } = req.body;
  if (req.user.role === "PI") {
    const [[own]] = await pool.execute(
      "SELECT 1 AS yes FROM Project WHERE project_id = ? AND pi_id = ?", [project_id ?? null, req.user.user_id]);
    if (!own) throw httpError(403, "This is not your project.");
  }
  const [[head]] = await pool.execute(
    "SELECT project_id FROM BudgetHead WHERE budgethead_id = ?", [budgethead_id ?? null]);
  if (head && head.project_id !== Number(project_id)) throw httpError(400, "This budget head belongs to another project.");
  const [result] = await pool.execute(
    `INSERT INTO Expense
       (project_id, budgethead_id, amount, description, receipt_reference, status, date)
     VALUES (?, ?, ?, ?, ?, 'Pending', CURDATE())`,
    [project_id ?? null, budgethead_id ?? null, amount ?? null, description || "", receipt_reference || ""]
  );
  res.status(201).json({ expense_id: result.insertId });
}));

// PATCH /api/expenses/:id/approve — ACID approval
// Row locks serialise concurrent approvals on one head. The second approver
// waits, then sees the balance the first one committed. The AFTER UPDATE trigger
// moves the money in this same transaction.
app.patch("/api/expenses/:id/approve", auth, allow(...OFFICE), route(async (req, res) => {
  await transaction(async conn => {
    const [[expense]] = await conn.execute(
      "SELECT amount, status, budgethead_id FROM Expense WHERE expense_id = ? FOR UPDATE", [req.params.id]);
    if (!expense) throw httpError(404, "Expense not found");
    if (expense.status !== "Pending") throw httpError(409, `This expense is already ${expense.status}.`);

    const [[head]] = await conn.execute(
      "SELECT remaining_balance FROM BudgetHead WHERE budgethead_id = ? FOR UPDATE", [expense.budgethead_id]);
    if (expense.amount > head.remaining_balance) {
      throw httpError(422, "ERR-BH002: Approving this expense would overspend the budget head");
    }
    await conn.execute(
      `UPDATE Expense
       SET status = 'Approved', approved_by = ?, approval_date = CURDATE()
       WHERE expense_id = ?`,
      [req.user.user_id, req.params.id]);
  });
  res.json({ success: true });
}));

// PATCH /api/expenses/:id/reject — rejects a Pending expense, or reverses an
// Approved one, in which case the trigger returns the money to the head (BR2).
app.patch("/api/expenses/:id/reject", auth, allow(...OFFICE), route(async (req, res) => {
  await transaction(async conn => {
    const [[expense]] = await conn.execute(
      "SELECT status FROM Expense WHERE expense_id = ? FOR UPDATE", [req.params.id]);
    if (!expense) throw httpError(404, "Expense not found");
    if (expense.status === "Rejected") throw httpError(409, "This expense is already Rejected.");
    await conn.execute("UPDATE Expense SET status = 'Rejected' WHERE expense_id = ?", [req.params.id]);
  });
  res.json({ success: true });
}));

// ── Workflow W3: discover and report ──────────────────────────────────────────

// GET /api/search?q=topic — FULLTEXT search over researchers and proposals
app.get("/api/search", auth, allow(...STAFF), route(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) throw httpError(400, "Enter a topic to search for.");
  const [researchers] = await pool.execute(
    `SELECT user_id, first_name, last_name, specialization, dept_id,
            MATCH(specialization) AGAINST (? IN NATURAL LANGUAGE MODE) AS relevance
     FROM User
     WHERE role = 'PI' AND MATCH(specialization) AGAINST (? IN NATURAL LANGUAGE MODE)
     ORDER BY relevance DESC LIMIT 10`, [q, q]);
  const [proposals] = await pool.execute(
    `SELECT proposal_id, title, status,
            MATCH(abstract, title) AGAINST (? IN NATURAL LANGUAGE MODE) AS relevance
     FROM Proposal
     WHERE MATCH(abstract, title) AGAINST (? IN NATURAL LANGUAGE MODE)
     ORDER BY relevance DESC LIMIT 10`, [q, q]);
  res.json({ researchers, proposals });
}));

// POST /api/match/:userId — scores open calls against a researcher with FULLTEXT
// relevance, scales the best call to 100 and stores the result in MATCHES.
app.post("/api/match/:userId", auth, allow("PI", "Admin"), route(async (req, res) => {
  const userId = Number(req.params.userId);
  if (req.user.role === "PI" && userId !== req.user.user_id) throw httpError(403, "You can only match your own profile.");

  const [calls] = await pool.execute(
    `SELECT ec.call_id, ec.title, ec.description, ec.deadline, ec.max_budget,
            COALESCE(fa.funding_focus_areas, '') AS focus
     FROM ExternalCall ec
     LEFT JOIN FundingAgency fa ON ec.agency_id = fa.agency_id
     WHERE ec.deadline >= CURDATE()`);

  const scored = [];
  for (const call of calls) {
    const text = `${call.title} ${call.description || ""} ${call.focus}`;
    const [[row]] = await pool.execute(
      `SELECT MATCH(specialization) AGAINST (? IN NATURAL LANGUAGE MODE) AS relevance
       FROM User WHERE user_id = ?`, [text, userId]);
    if (!row) throw httpError(404, "Researcher not found");
    scored.push({ ...call, relevance: Number(row.relevance) || 0 });
  }

  const best = Math.max(0, ...scored.map(c => c.relevance));
  const matches = scored
    .filter(c => c.relevance > 0)
    .map(c => ({ ...c, score: Math.round((c.relevance / best) * 100) }))
    .sort((a, b) => b.score - a.score);

  await transaction(async conn => {
    for (const m of matches) {
      await conn.execute(
        `INSERT INTO MATCHES (call_id, user_id, match_score, match_reason)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE match_score = VALUES(match_score),
                                 match_reason = VALUES(match_reason),
                                 computed_at = CURRENT_TIMESTAMP`,
        [m.call_id, userId, m.score, `FULLTEXT relevance ${m.relevance.toFixed(3)}`]);
    }
  });
  res.json(matches);
}));

// GET /api/reports/analytics — Admin_Analytics_View
app.get("/api/reports/analytics", auth, allow("Admin"), route(async (_req, res) => {
  const [rows] = await pool.execute("SELECT * FROM Admin_Analytics_View");
  res.json(rows);
}));

// GET /api/reports/pi-dashboard — PI_Dashboard_View, filtered to the caller
app.get("/api/reports/pi-dashboard", auth, allow("PI"), route(async (req, res) => {
  const [rows] = await pool.execute("SELECT * FROM PI_Dashboard_View WHERE pi_id = ?", [req.user.user_id]);
  res.json(rows);
}));

// GET /api/reports/department/:id — CALL generate_annual_report(id)
app.get("/api/reports/department/:id", auth, allow("Admin"), route(async (req, res) => {
  const [results] = await pool.query("CALL generate_annual_report(?)", [req.params.id]);
  res.json(results[0][0]);
}));

// GET /api/reports/queries — the catalogue of Q1 to Q6
app.get("/api/reports/queries", auth, allow("Admin"), (_req, res) => {
  res.json(QUERIES.map(({ id, title, concept, purpose, sql }) => ({ id, title, concept, purpose, sql })));
});

// GET /api/reports/queries/:id?term=topic — runs one query
app.get("/api/reports/queries/:id", auth, allow("Admin"), route(async (req, res) => {
  const query = QUERIES.find(q => q.id === req.params.id);
  if (!query) throw httpError(404, "Unknown query");
  const term = String(req.query.term || "").trim() || query.params?.[0];
  const params = query.params ? query.params.flatMap(() => [term, term]) : [];
  const [rows] = await pool.query(query.sql, params);
  res.json(rows);
}));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== "test") {
  if (!process.env.AUTH_SECRET) console.warn("AUTH_SECRET is not set: using a random one, so sessions end when the server restarts.");
  app.listen(PORT, () => {
    console.log(`UniGrant API listening on http://localhost:${PORT}`);
    console.log(`MySQL: ${process.env.DB_USER || "root"}@${process.env.DB_HOST || "localhost"}/${process.env.DB_NAME || "unigrant"}`);
  });
}

module.exports = app;
