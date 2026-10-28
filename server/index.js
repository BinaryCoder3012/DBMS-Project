/**
 * UniGrant — Express + MySQL2 REST API
 * ──────────────────────────────────────
 * Runs on port 3001 (Vite proxies /api → here).
 *
 * Start:  node index.js
 * Dev:    nodemon index.js
 *
 * Env vars (set in your shell or a .env file with dotenv):
 *   DB_HOST   – default: localhost
 *   DB_USER   – default: root
 *   DB_PASS   – default: (empty)
 *   DB_NAME   – default: unigrant
 *   PORT      – default: 3001
 */

const express = require("express");
const cors    = require("cors");
const mysql   = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json());

// ── Database connection pool ──────────────────────────────────────────────────
const pool = mysql.createPool({
  host:             process.env.DB_HOST || "localhost",
  port:             Number(process.env.DB_PORT) || 3306,
  user:            process.env.DB_USER || "root",
  password:         process.env.DB_PASS || "",
  database:         process.env.DB_NAME || "unigrant",
  waitForConnections: true,
  connectionLimit:  10,
});

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
// POST /api/auth/login
// Body: { email, password }   →   Returns user row (no password_hash)
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, first_name, last_name, email, role,
              dept_id, specialization, phone, hire_date
       FROM User
       WHERE email = ? AND password_hash = SHA2(?, 256)`,
      [email, password]
    );
    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Read endpoints (GET all rows) ─────────────────────────────────────────────

// GET /api/users
app.get("/api/users", async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, first_name, last_name, email, role,
              dept_id, specialization, phone, hire_date
       FROM User`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/departments
app.get("/api/departments", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM Department");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/proposals
app.get("/api/proposals", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM Proposal");
    // Convert tinyint boolean to JS boolean
    res.json(rows.map(r => ({ ...r, eligibility_check_passed: !!r.eligibility_check_passed })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/grants
app.get("/api/grants", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM Grant_");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/projects
app.get("/api/projects", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM Project");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/budget-heads
app.get("/api/budget-heads", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM BudgetHead");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/expenses
app.get("/api/expenses", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM Expense");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/milestones
app.get("/api/milestones", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM Milestone");
    res.json(rows.map(r => ({ ...r, report_submitted: !!r.report_submitted })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/research-outputs
app.get("/api/research-outputs", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM ResearchOutput");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/external-calls
// Joins FundingAgency to surface focus areas (used by AI Grant Matcher)
app.get("/api/external-calls", async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT ec.call_id, ec.title, ec.description, ec.deadline, ec.max_budget,
              COALESCE(fa.funding_focus_areas, '') AS focus
       FROM ExternalCall ec
       LEFT JOIN FundingAgency fa ON ec.agency_id = fa.agency_id`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/works-on
app.get("/api/works-on", async (_req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM WORKS_ON");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Write endpoints ───────────────────────────────────────────────────────────

// POST /api/proposals  — create a new proposal (Draft)
app.post("/api/proposals", async (req, res) => {
  const { title, abstract, total_budget_requested, duration_months, pi_id } = req.body;
  try {
    const [result] = await pool.execute(
      `INSERT INTO Proposal
         (title, abstract, total_budget_requested, duration_months,
          submission_date, status, eligibility_check_passed, pi_id)
       VALUES (?, ?, ?, ?, CURDATE(), 'Draft', TRUE, ?)`,
      [title, abstract || "", total_budget_requested, duration_months, pi_id]
    );
    res.json({ proposal_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses  — create a pending expense
// The DB trigger balance_check_before_expense fires BEFORE INSERT and
// signals SQLSTATE '45000' if remaining_balance < amount — that
// exception propagates here as a mysql2 error.
app.post("/api/expenses", async (req, res) => {
  const { project_id, budgethead_id, amount, description, receipt_reference } = req.body;
  try {
    const [result] = await pool.execute(
      `INSERT INTO Expense
         (project_id, budgethead_id, amount, description, receipt_reference, status, date)
       VALUES (?, ?, ?, ?, ?, 'Pending', CURDATE())`,
      [project_id, budgethead_id, amount, description || "", receipt_reference || ""]
    );
    res.json({ expense_id: result.insertId });
  } catch (err) {
    // Trigger fired (ERR-BH001) or constraint violation
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/expenses/:id/approve  — approve an expense (ACID transaction)
// The DB trigger update_budget_on_approval fires AFTER the UPDATE and
// adjusts BudgetHead.spent_amount automatically.
app.patch("/api/expenses/:id/approve", async (req, res) => {
  const { approved_by } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE Expense
       SET status = 'Approved', approved_by = ?, approval_date = CURDATE()
       WHERE expense_id = ?`,
      [approved_by, req.params.id]
    );
    // Trigger update_budget_on_approval fires AFTER this UPDATE in MySQL
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PATCH /api/expenses/:id/reject  — reject a pending expense
app.patch("/api/expenses/:id/reject", async (req, res) => {
  try {
    await pool.execute(
      "UPDATE Expense SET status = 'Rejected' WHERE expense_id = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`UniGrant API listening on http://localhost:${PORT}`);
    console.log(`MySQL: ${process.env.DB_USER || "root"}@${process.env.DB_HOST || "localhost"}/${process.env.DB_NAME || "unigrant"}`);
  });
}

module.exports = app;
