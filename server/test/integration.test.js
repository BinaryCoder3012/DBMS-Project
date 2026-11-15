/**
 * Integration tests: real MySQL, real triggers, real HTTP.
 *
 * They run against the database named by DB_NAME (see .env.example) and change
 * its rows, so load a fresh copy first:
 *
 *   mysql -u root -p < unigrant_schema.sql
 *   cd server && npm test
 *
 * Every rule from the report is asserted, including the SQLSTATE 45000 refusals
 * and the concurrent-approval race.
 */

process.env.NODE_ENV = "test";
require("dotenv").config({ quiet: true });

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const app = require("../index.js");

const config = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "unigrant",
  decimalNumbers: true,
};

let db, server, base;
const sessions = {};

async function http(method, path, who, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(who ? { Authorization: `Bearer ${sessions[who]}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

// Asserts that a statement is refused with SQLSTATE 45000 and the given code.
async function refused(sql, params, code) {
  await assert.rejects(db.execute(sql, params), err => {
    assert.equal(err.sqlState, "45000");
    assert.match(err.sqlMessage, new RegExp(code));
    return true;
  });
}

// A fresh project with one head, so tests do not depend on each other.
async function freshHead(allocated = 100000) {
  const [project] = await db.execute(
    `INSERT INTO Project (project_title, start_date, end_date, status, current_balance, department_id, pi_id)
     VALUES ('Test project', '2026-01-01', '2030-01-01', 'Active', ?, 1, 2)`, [allocated]);
  const [head] = await db.execute(
    "INSERT INTO BudgetHead (project_id, category, allocated_amount) VALUES (?, 'Equipment', ?)",
    [project.insertId, allocated]);
  return { project_id: project.insertId, budgethead_id: head.insertId };
}

async function pendingExpense({ project_id, budgethead_id }, amount, receipt) {
  const [row] = await db.execute(
    `INSERT INTO Expense (project_id, budgethead_id, amount, date, receipt_reference)
     VALUES (?, ?, ?, CURDATE(), ?)`, [project_id, budgethead_id, amount, receipt]);
  return row.insertId;
}

before(async () => {
  db = await mysql.createConnection(config);
  await new Promise(resolve => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  const logins = { admin: ["priya@university.edu", "admin123"], pi: ["arjun@university.edu", "pi123"],
                   officer: ["sneha@university.edu", "go123"], student: ["rahul@university.edu", "student123"] };
  for (const [who, [email, password]] of Object.entries(logins)) {
    const { status, body } = await http("POST", "/auth/login", null, { email, password });
    assert.equal(status, 200);
    sessions[who] = body.token;
  }
});

after(async () => {
  await db.end();
  await new Promise(resolve => server.close(resolve));
  await app.locals.pool.end();
});

// ── Volume and consistency ───────────────────────────────────────
test("the seed holds at least 500 records", async () => {
  const tables = ["Department", "User", "FundingAgency", "ExternalCall", "Proposal", "Grant_", "Project",
                  "BudgetHead", "Expense", "Milestone", "ResearchOutput", "WORKS_ON", "SUPERVISES",
                  "PublicationAuthor", "Dependent", "Equipment", "Notification"];
  let total = 0;
  for (const t of tables) {
    const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM ${t}`);
    total += n;
  }
  assert.ok(total >= 500, `only ${total} rows`);
});

test("D2: current_balance equals the sum of the head balances", async () => {
  const [rows] = await db.query(
    `SELECT p.project_id FROM Project p
     WHERE p.current_balance <> (SELECT SUM(b.remaining_balance) FROM BudgetHead b
                                 WHERE b.project_id = p.project_id)`);
  assert.deepEqual(rows, []);
});

// ── Triggers ─────────────────────────────────────────────────────
test("BR1: an expense over the remaining balance is refused", async () => {
  const head = await freshHead(1000);
  await refused(
    `INSERT INTO Expense (project_id, budgethead_id, amount, date) VALUES (?, ?, 1000.01, CURDATE())`,
    [head.project_id, head.budgethead_id], "ERR-BH001");
});

test("BR2: approval moves the money and a reversal restores it", async () => {
  const head = await freshHead(50000);
  const id = await pendingExpense(head, 20000, "BR2-A");
  await db.execute("UPDATE Expense SET status = 'Approved' WHERE expense_id = ?", [id]);
  let [[h]] = await db.execute("SELECT spent_amount, remaining_balance FROM BudgetHead WHERE budgethead_id = ?", [head.budgethead_id]);
  assert.deepEqual([h.spent_amount, h.remaining_balance], [20000, 30000]);
  let [[p]] = await db.execute("SELECT current_balance FROM Project WHERE project_id = ?", [head.project_id]);
  assert.equal(p.current_balance, 30000);

  await db.execute("UPDATE Expense SET status = 'Rejected' WHERE expense_id = ?", [id]);
  [[h]] = await db.execute("SELECT spent_amount FROM BudgetHead WHERE budgethead_id = ?", [head.budgethead_id]);
  assert.equal(h.spent_amount, 0);
  [[p]] = await db.execute("SELECT current_balance FROM Project WHERE project_id = ?", [head.project_id]);
  assert.equal(p.current_balance, 50000);
});

test("BR3: a PI with 5 active projects cannot propose", async () => {
  const [[pi]] = await db.query("SELECT user_id FROM User WHERE email = 'arjun@university.edu'");
  const [[{ n }]] = await db.execute("SELECT COUNT(*) AS n FROM Project WHERE pi_id = ? AND status = 'Active'", [pi.user_id]);
  for (let i = n; i < 5; i++) {
    await db.execute(
      `INSERT INTO Project (project_title, start_date, end_date, status, pi_id)
       VALUES ('Filler', '2026-01-01', '2030-01-01', 'Active', ?)`, [pi.user_id]);
  }
  await refused(
    `INSERT INTO Proposal (title, total_budget_requested, duration_months, pi_id) VALUES ('Sixth', 1000, 12, ?)`,
    [pi.user_id], "ERR-PI001");
  await db.execute("UPDATE Project SET status = 'On Hold' WHERE pi_id = ? AND project_title IN ('Filler', 'Test project')", [pi.user_id]);
});

test("BR4: a receipt reference cannot repeat within a project", async () => {
  const head = await freshHead();
  await pendingExpense(head, 100, "DUP-1");
  await refused(
    `INSERT INTO Expense (project_id, budgethead_id, amount, date, receipt_reference) VALUES (?, ?, 100, CURDATE(), 'DUP-1')`,
    [head.project_id, head.budgethead_id], "ERR-EXP001");
});

test("auto_close_project closes an expired project without error 1442", async () => {
  const head = await freshHead();
  await db.execute("UPDATE Project SET end_date = '2026-02-01' WHERE project_id = ?", [head.project_id]);
  const [[p]] = await db.execute("SELECT status FROM Project WHERE project_id = ?", [head.project_id]);
  assert.equal(p.status, "Closed");
});

// ── CHECK constraints ────────────────────────────────────────────
test("BR5: CHECK constraints refuse bad values", async () => {
  const head = await freshHead();
  const bad = [
    ["INSERT INTO Proposal (title, total_budget_requested, duration_months, pi_id) VALUES ('x', 0, 12, 3)", "chk_proposal_budget"],
    ["INSERT INTO Proposal (title, total_budget_requested, duration_months, pi_id) VALUES ('x', 1, 0, 3)", "chk_proposal_duration"],
    ["INSERT INTO Grant_ (grant_title, total_amount_awarded, start_date, end_date) VALUES ('x', 1, '2026-02-02', '2026-01-01')", "chk_grant_dates"],
    ["INSERT INTO Grant_ (grant_title, total_amount_awarded, start_date, end_date) VALUES ('x', 0, '2026-01-01', '2026-02-02')", "chk_grant_amount"],
    ["INSERT INTO Project (project_title, start_date, end_date, pi_id) VALUES ('x', '2026-02-02', '2026-01-01', 3)", "chk_project_dates"],
    ["INSERT INTO Project (project_title, start_date, end_date, pi_id, current_balance) VALUES ('x', '2026-01-01', '2026-02-02', 3, -1)", "chk_project_balance"],
    [`INSERT INTO Expense (project_id, budgethead_id, amount, date) VALUES (${head.project_id}, ${head.budgethead_id}, -5, CURDATE())`, "chk_expense_amount"],
    ["INSERT INTO SUPERVISES (supervisor_id, supervisee_id, relationship_type) VALUES (2, 2, 'Mentor')", "chk_no_self_supervise"],
  ];
  for (const [sql, name] of bad) {
    await assert.rejects(db.query(sql), err => {
      assert.equal(err.code, "ER_CHECK_CONSTRAINT_VIOLATED", sql);
      assert.match(err.sqlMessage, new RegExp(name));
      return true;
    });
  }
});

test("UNIQUE on proposal_id allows one grant per proposal", async () => {
  await assert.rejects(
    db.query(`INSERT INTO Grant_ (grant_title, total_amount_awarded, start_date, end_date, proposal_id)
              VALUES ('Second', 1, '2026-01-01', '2026-02-02', 1)`),
    err => err.code === "ER_DUP_ENTRY");
});

// ── Views ────────────────────────────────────────────────────────
test("BR6: student views hide every money column", async () => {
  for (const view of ["Student_Project_View", "Public_Project_View"]) {
    const [columns] = await db.query(`SHOW COLUMNS FROM ${view}`);
    const names = columns.map(c => c.Field);
    for (const money of ["current_balance", "stipend_amount", "allocated_amount"]) {
      assert.ok(!names.includes(money), `${view} exposes ${money}`);
    }
  }
});

test("analytics are not inflated by join fan-out", async () => {
  const [[view]] = await db.query("SELECT SUM(total_funding) AS funding FROM Admin_Analytics_View");
  const [[truth]] = await db.query(
    `SELECT SUM(total_amount_awarded) AS funding FROM Grant_ g
     WHERE EXISTS (SELECT 1 FROM Project p WHERE p.grant_id = g.grant_id AND p.department_id IS NOT NULL)`);
  assert.equal(view.funding, truth.funding);

  const [[{ total }]] = await db.query("SELECT SUM(total_projects) AS total FROM Admin_Analytics_View");
  const [[{ actual }]] = await db.query("SELECT COUNT(*) AS actual FROM Project WHERE department_id IS NOT NULL");
  assert.equal(total, actual);
});

test("the annual report agrees with the analytics view", async () => {
  const [[results]] = await db.query("CALL generate_annual_report(1)");
  const report = results[0];
  const [[view]] = await db.query("SELECT * FROM Admin_Analytics_View WHERE dept_id = 1");
  assert.equal(report.total_funds_received, view.total_funding);
  assert.equal(report.active_projects, view.active_projects);
  assert.equal(report.publications, view.publications);
});

// ── RBAC, as real database accounts ──────────────────────────────
const as = (user, password) => mysql.createConnection({ ...config, user, password });

test("BR7: grant officers cannot create users or alter the schema", async () => {
  const conn = await as("grant_officer_user", "GOPass!1");
  await assert.rejects(conn.query("CREATE USER 'nope'@'%' IDENTIFIED BY 'x'"), err => err.code === "ER_SPECIFIC_ACCESS_DENIED_ERROR");
  await assert.rejects(conn.query("DROP TABLE Expense"), err => err.code === "ER_TABLEACCESS_DENIED_ERROR");
  await conn.end();
});

test("students reach data only through views", async () => {
  const conn = await as("student_user", "StudPass!1");
  await assert.rejects(conn.query("SELECT * FROM Project"), err => err.code === "ER_TABLEACCESS_DENIED_ERROR");
  await assert.rejects(conn.query("SELECT * FROM Expense"), err => err.code === "ER_TABLEACCESS_DENIED_ERROR");
  const [rows] = await conn.query("SELECT * FROM Public_Project_View LIMIT 1");
  assert.equal(rows.length, 1);
  await conn.end();
});

test("a PI cannot approve an expense at database level", async () => {
  const conn = await as("pi_user", "PIPass!1");
  await assert.rejects(conn.query("UPDATE Expense SET status = 'Approved'"), err => err.code === "ER_TABLEACCESS_DENIED_ERROR");
  await conn.end();
});

// ── API role guard ───────────────────────────────────────────────
test("the API needs a session", async () => {
  assert.equal((await http("GET", "/projects")).status, 401);
});

test("students get no money through the API", async () => {
  assert.equal((await http("GET", "/expenses", "student")).status, 403);
  assert.equal((await http("GET", "/budget-heads", "student")).status, 403);
  const { body } = await http("GET", "/projects", "student");
  assert.ok(body.length > 0);
  for (const p of body) {
    assert.ok(!("current_balance" in p));
    assert.equal(p.student_id, 4);
  }
});

test("a PI cannot approve expenses through the API", async () => {
  const head = await freshHead();
  const id = await pendingExpense(head, 100, "GUARD-1");
  assert.equal((await http("PATCH", `/expenses/${id}/approve`, "pi")).status, 403);
});

test("a PI cannot log an expense on another PI's project", async () => {
  const { status } = await http("POST", "/expenses", "pi", { project_id: 2, budgethead_id: 5, amount: 1 });
  assert.equal(status, 403);
});

test("the database's refusal reaches the client as 422 with its message", async () => {
  const head = await freshHead(1000);
  const { status, body } = await http("POST", "/expenses", "admin", { ...head, amount: 5000, description: "Too much" });
  assert.equal(status, 422);
  assert.match(body.error, /ERR-BH001/);
});

// ── W1: award a grant ────────────────────────────────────────────
const award = id => ({
  proposal_id: id, funding_agency: "DST", agency_contact_info: "grants@dst.gov.in", reporting_frequency: "Quarterly",
  start_date: "2026-12-01", end_date: "2028-11-30",
  budget_heads: [{ category: "Equipment", allocated_amount: 600000 }, { category: "Manpower", allocated_amount: 400000 }],
});

test("W1: an award writes all four tables in one transaction", async () => {
  const [[p]] = await db.query("SELECT proposal_id FROM Proposal WHERE status = 'Under Review' AND eligibility_check_passed LIMIT 1");
  const { status, body } = await http("POST", "/grants/award", "officer", award(p.proposal_id));
  assert.equal(status, 201);
  assert.equal(body.total, 1000000);
  const [[state]] = await db.execute("SELECT status FROM Proposal WHERE proposal_id = ?", [p.proposal_id]);
  assert.equal(state.status, "Approved");
  const [[project]] = await db.execute("SELECT current_balance, grant_id FROM Project WHERE project_id = ?", [body.project_id]);
  assert.equal(project.current_balance, 1000000);
  assert.equal(project.grant_id, body.grant_id);
  const [heads] = await db.execute("SELECT * FROM BudgetHead WHERE project_id = ?", [body.project_id]);
  assert.equal(heads.length, 2);
});

test("W1: a failed award rolls back every row", async () => {
  const [[p]] = await db.query("SELECT proposal_id FROM Proposal WHERE status = 'Submitted' AND eligibility_check_passed LIMIT 1");
  const [[before]] = await db.query("SELECT (SELECT COUNT(*) FROM Grant_) AS g, (SELECT COUNT(*) FROM Project) AS p");
  const body = award(p.proposal_id);
  body.budget_heads[1].allocated_amount = -1; // the last insert breaks a CHECK
  const { status } = await http("POST", "/grants/award", "officer", body);
  assert.equal(status, 422);
  const [[afterwards]] = await db.query("SELECT (SELECT COUNT(*) FROM Grant_) AS g, (SELECT COUNT(*) FROM Project) AS p");
  assert.deepEqual(afterwards, before);
  const [[state]] = await db.execute("SELECT status FROM Proposal WHERE proposal_id = ?", [p.proposal_id]);
  assert.equal(state.status, "Submitted");
});

test("W1: an awarded proposal cannot be awarded twice", async () => {
  const { status } = await http("POST", "/grants/award", "officer", award(1));
  assert.equal(status, 409);
});

// ── W2: concurrency ──────────────────────────────────────────────
test("W2: concurrent approvals cannot overspend a head", async () => {
  const head = await freshHead(100000);
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(await pendingExpense(head, 30000, `RACE-${i}`)); // 180,000 pending
  const results = await Promise.all(ids.map(id => http("PATCH", `/expenses/${id}/approve`, "officer")));

  const statuses = results.map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 200, 200, 422, 422, 422]);
  const [[h]] = await db.execute("SELECT spent_amount, remaining_balance FROM BudgetHead WHERE budgethead_id = ?", [head.budgethead_id]);
  assert.deepEqual([h.spent_amount, h.remaining_balance], [90000, 10000]);
  const [[p]] = await db.execute("SELECT current_balance FROM Project WHERE project_id = ?", [head.project_id]);
  assert.equal(p.current_balance, 10000);
});

test("W2: the same expense cannot be approved twice", async () => {
  const head = await freshHead();
  const id = await pendingExpense(head, 1000, "TWICE");
  const results = await Promise.all([1, 2, 3].map(() => http("PATCH", `/expenses/${id}/approve`, "officer")));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409]);
  const [[h]] = await db.execute("SELECT spent_amount FROM BudgetHead WHERE budgethead_id = ?", [head.budgethead_id]);
  assert.equal(h.spent_amount, 1000);
});

test("the CHECK backstop refuses an overspend that skips the API", async () => {
  const head = await freshHead(1000);
  const a = await pendingExpense(head, 800, "CHK-A");
  const b = await pendingExpense(head, 800, "CHK-B");
  await db.execute("UPDATE Expense SET status = 'Approved' WHERE expense_id = ?", [a]);
  await assert.rejects(
    db.execute("UPDATE Expense SET status = 'Approved' WHERE expense_id = ?", [b]),
    err => err.code === "ER_CHECK_CONSTRAINT_VIOLATED");
  const [[e]] = await db.execute("SELECT status FROM Expense WHERE expense_id = ?", [b]);
  assert.equal(e.status, "Pending"); // the failed statement left nothing behind
});

// ── W3: reports and search ───────────────────────────────────────
test("W3: Q1 to Q6 all return rows", async () => {
  for (const id of ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]) {
    const { status, body } = await http("GET", `/reports/queries/${id}`, "admin");
    assert.equal(status, 200, id);
    assert.ok(body.length > 0, `${id} returned nothing`);
  }
});

test("W3: Q3 returns at most 3 ranks per department", async () => {
  const { body } = await http("GET", "/reports/queries/Q3", "admin");
  assert.ok(body.every(r => r.rnk <= 3));
});

test("W3: Q6 follows the recursive relationship past one level", async () => {
  const { body } = await http("GET", "/reports/queries/Q6", "admin");
  assert.ok(Math.max(...body.map(r => r.depth)) >= 2);
});

test("W3: FULLTEXT search ranks the solar researcher first", async () => {
  const { body } = await http("GET", "/search?q=solar%20photovoltaics", "admin");
  assert.equal(body.researchers[0].last_name, "Mehta");
});

test("W3: matching stores scores between 0 and 100", async () => {
  const { status, body } = await http("POST", "/match/2", "pi");
  assert.equal(status, 200);
  assert.ok(body.length > 0);
  assert.equal(body[0].score, 100);
  const [rows] = await db.query("SELECT match_score FROM MATCHES WHERE user_id = 2");
  assert.equal(rows.length, body.length);
});

test("W3: the department report runs the stored procedure", async () => {
  const { status, body } = await http("GET", "/reports/department/1", "admin");
  assert.equal(status, 200);
  assert.equal(body.dept_name, "Electrical Engineering");
  assert.equal((await http("GET", "/reports/department/999", "admin")).status, 422);
});

// ── Drafts, project records, people and departments ─────────────
// Earlier tests give the seeded PI five active projects, so the draft is inserted
// for the admin (no projects) and then handed over; only INSERT runs the cap.
async function draftFor(piId) {
  const [row] = await db.execute(
    `INSERT INTO Proposal (title, abstract, total_budget_requested, duration_months, status, pi_id)
     VALUES ('Draft under test', '', 100000, 12, 'Draft', 1)`);
  await db.execute("UPDATE Proposal SET pi_id = ? WHERE proposal_id = ?", [piId, row.insertId]);
  return row.insertId;
}

test("a PI can edit and delete their own Draft, and nobody else's", async () => {
  const mine = await draftFor(2), theirs = await draftFor(3);
  assert.equal((await http("PATCH", `/proposals/${mine}`, "pi",
    { title: "Edited draft", abstract: "x", total_budget_requested: 200000, duration_months: 18 })).status, 200);
  const [[row]] = await db.execute("SELECT title, total_budget_requested FROM Proposal WHERE proposal_id = ?", [mine]);
  assert.equal(row.title, "Edited draft");
  assert.equal(row.total_budget_requested, 200000);
  assert.equal((await http("DELETE", `/proposals/${theirs}`, "pi")).status, 403);
  assert.equal((await http("DELETE", `/proposals/${mine}`, "officer")).status, 403);
  assert.equal((await http("DELETE", `/proposals/${mine}`, "student")).status, 403);
  assert.equal((await http("DELETE", `/proposals/${mine}`, "pi")).status, 200);
  const [gone] = await db.execute("SELECT 1 FROM Proposal WHERE proposal_id = ?", [mine]);
  assert.equal(gone.length, 0);
});

test("a submitted proposal can no longer be edited or deleted", async () => {
  const id = await draftFor(2);
  assert.equal((await http("PATCH", `/proposals/${id}/status`, "pi", { status: "Submitted" })).status, 200);
  assert.equal((await http("DELETE", `/proposals/${id}`, "pi")).status, 409);
  assert.equal((await http("PATCH", `/proposals/${id}`, "pi",
    { title: "Late edit", total_budget_requested: 1, duration_months: 1 })).status, 409);
  assert.equal((await http("PATCH", `/proposals/${id}`, "admin",
    { title: "", total_budget_requested: 1, duration_months: 1 })).status, 409);
});

test("editing a Draft still obeys the CHECK constraints", async () => {
  const id = await draftFor(2);
  const { status, body } = await http("PATCH", `/proposals/${id}`, "pi",
    { title: "Bad", total_budget_requested: -5, duration_months: 12 });
  assert.equal(status, 422);
  assert.match(body.error, /chk_proposal_budget/);
});

test("a PI adds and completes milestones only on their own projects", async () => {
  const { project_id } = await freshHead();
  const add = await http("POST", "/milestones", "pi", { project_id, title: "Prototype", due_date: "2027-01-31", priority: "High" });
  assert.equal(add.status, 201);
  const id = add.body.milestone_id;
  assert.equal((await http("PATCH", `/milestones/${id}`, "pi", { status: "Completed" })).status, 200);
  assert.equal((await http("PATCH", `/milestones/${id}`, "pi", { report_submitted: true })).status, 200);
  const [[m]] = await db.execute("SELECT status, completion_date, report_submitted FROM Milestone WHERE milestone_id = ?", [id]);
  assert.equal(m.status, "Completed");
  assert.ok(m.completion_date);
  assert.equal(m.report_submitted, 1);
  const [[other]] = await db.query("SELECT project_id FROM Project WHERE pi_id <> 2 LIMIT 1");
  assert.equal((await http("POST", "/milestones", "pi", { project_id: other.project_id, title: "x", due_date: "2027-01-01" })).status, 403);
  assert.equal((await http("PATCH", `/milestones/${id}`, "student", { status: "Pending" })).status, 403);
  assert.equal((await http("PATCH", `/milestones/${id}`, "pi", { status: "Done" })).status, 400);
});

test("research outputs can be added, moved along and deleted by their PI", async () => {
  const { project_id } = await freshHead();
  const add = await http("POST", "/research-outputs", "pi",
    { project_id, type: "Publication", title: "Test paper", authors: "Mehta A." });
  assert.equal(add.status, 201);
  const id = add.body.output_id;
  assert.equal((await http("PATCH", `/research-outputs/${id}`, "pi", { status: "Published" })).status, 200);
  const [[o]] = await db.execute("SELECT status FROM ResearchOutput WHERE output_id = ?", [id]);
  assert.equal(o.status, "Published");
  assert.equal((await http("POST", "/research-outputs", "pi", { project_id, type: "Poem", title: "x" })).status, 400);
  assert.equal((await http("DELETE", `/research-outputs/${id}`, "officer")).status, 403);
  assert.equal((await http("DELETE", `/research-outputs/${id}`, "pi")).status, 200);
});

test("only the admin adds people and departments; a new user can sign in", async () => {
  const dept = await http("POST", "/departments", "admin", { dept_name: "Test Dept", location: "Block Z", annual_budget: 100 });
  assert.equal(dept.status, 201);
  const person = { first_name: "New", last_name: "Person", email: "new.person@university.edu",
                   password: "newpass1", role: "Student", dept_id: dept.body.dept_id };
  assert.equal((await http("POST", "/users", "pi", person)).status, 403);
  assert.equal((await http("POST", "/users", "admin", person)).status, 201);
  assert.equal((await http("POST", "/users", "admin", person)).status, 409);
  const login = await http("POST", "/auth/login", null, { email: person.email, password: "newpass1" });
  assert.equal(login.status, 200);
  assert.equal(login.body.role, "Student");
  assert.equal((await http("POST", "/departments", "officer", { dept_name: "x" })).status, 403);
});

test("deleting a department keeps its people (ON DELETE SET NULL)", async () => {
  const { body } = await http("POST", "/departments", "admin", { dept_name: "Short-lived" });
  const [u] = await db.execute(
    `INSERT INTO User (first_name, last_name, email, password_hash, role, dept_id)
     VALUES ('Kept', 'User', 'kept.user@university.edu', SHA2('x',256), 'PI', ?)`, [body.dept_id]);
  assert.equal((await http("DELETE", `/departments/${body.dept_id}`, "admin")).status, 200);
  const [[row]] = await db.execute("SELECT dept_id FROM User WHERE user_id = ?", [u.insertId]);
  assert.equal(row.dept_id, null);
  assert.equal((await http("DELETE", `/departments/${body.dept_id}`, "admin")).status, 404);
});

// ── Hand-offs between roles ──────────────────────────────────────
const unread = async userId => (await db.execute(
  "SELECT message FROM Notification WHERE user_id = ? AND is_read = FALSE ORDER BY notif_id DESC", [userId]))[0];

test("submit, eligibility, award: each step reaches the next person", async () => {
  const id = await draftFor(2);
  assert.equal((await http("PATCH", `/proposals/${id}/status`, "pi", { status: "Submitted" })).status, 200);
  assert.match((await unread(6))[0].message, /Draft under test.*waiting for review/);   // Sneha, the officer
  assert.equal((await http("PATCH", `/proposals/${id}/status`, "officer", { status: "Under Review" })).status, 200);
  // not yet eligible: the award is refused and nothing is written
  const refused = await http("POST", "/grants/award", "officer", award(id));
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /eligible/);
  assert.equal((await http("PATCH", `/proposals/${id}/eligibility`, "pi", { eligible: true })).status, 403);
  assert.equal((await http("PATCH", `/proposals/${id}/eligibility`, "officer", { eligible: true })).status, 200);
  assert.equal((await http("POST", "/grants/award", "officer", award(id))).status, 201);
  const pi = await unread(2);
  assert.match(pi[0].message, /awarded a grant/);
  assert.ok(pi.some(n => /marked eligible/.test(n.message)));
  const mine = await http("GET", "/notifications", "pi");
  assert.equal(mine.status, 200);
  assert.ok(mine.body.length > 0);
  assert.equal((await http("PATCH", "/notifications/read", "pi")).status, 200);
  assert.equal((await unread(2)).length, 0);
});

test("a logged expense reaches the officer and the decision reaches the PI", async () => {
  const head = await freshHead(50000);
  const logged = await http("POST", "/expenses", "pi", { ...head, amount: 1000, receipt_reference: "HAND-1" });
  assert.equal(logged.status, 201);
  assert.match((await unread(6))[0].message, /waiting for approval/);
  await http("PATCH", `/expenses/${logged.body.expense_id}/approve`, "officer");
  assert.match((await unread(2))[0].message, /HAND-1.*approved/);
  await http("PATCH", `/expenses/${logged.body.expense_id}/reject`, "officer");
  assert.match((await unread(2))[0].message, /HAND-1.*reversed/);
});

test("a PI withdraws only their own Pending expense", async () => {
  const head = await freshHead(50000);
  const a = await pendingExpense(head, 1000, "WD-1"), b = await pendingExpense(head, 1000, "WD-2");
  await http("PATCH", `/expenses/${b}/approve`, "officer");
  assert.equal((await http("DELETE", `/expenses/${a}`, "officer")).status, 403);
  assert.equal((await http("DELETE", `/expenses/${b}`, "pi")).status, 409);
  assert.equal((await http("DELETE", `/expenses/${a}`, "pi")).status, 200);
});

test("a PI assigns and removes team members on their own project", async () => {
  const { project_id } = await freshHead();
  const add = await http("POST", `/projects/${project_id}/team`, "pi",
    { user_id: 4, role_in_project: "Research Assistant", hours_per_week: 10, stipend_amount: 8000 });
  assert.equal(add.status, 201);
  assert.match((await unread(4))[0].message, /added to the project/);
  const seen = await http("GET", "/projects", "student");
  assert.ok(seen.body.some(p => p.project_id === project_id));
  assert.equal((await http("POST", `/projects/${project_id}/team`, "pi", { user_id: 4 })).status, 409);
  assert.equal((await http("POST", `/projects/${project_id}/team`, "student", { user_id: 5 })).status, 403);
  assert.equal((await http("DELETE", `/projects/${project_id}/team/4`, "pi")).status, 200);
  assert.equal((await http("DELETE", `/projects/${project_id}/team/4`, "pi")).status, 404);
});
