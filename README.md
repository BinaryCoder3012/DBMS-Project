# UniGrant: Research Grant Lifecycle Management

**CS F212 Database Systems | BITS Pilani, Hyderabad Campus | Group-25**

UniGrant is a centralised relational database application for university research grant lifecycle management — from first proposal submission, compliance review, and grant award to budget head tracking, atomic expense approvals, milestone alerts, and research output archiving.

All business rules (no budget overspending, maximum 5 active projects per PI, duplicate receipt prevention, strict date ordering) are enforced by the MySQL 8.0 DBMS through CHECK constraints and triggers.

---

# UniGrant — Research Grant Management System

A centralised DBMS for university research grant lifecycle management — from first proposal to final closure. Built with React (frontend) and MySQL 8.0+ (backend schema).

---

## Team & File Ownership

| # | Role | Member | Files Owned |
|---|------|--------|-------------|
| 1 | Database Schema & ER Modeling Engineer | | `schema/01_schema_er.sql`, `schema/06_seed_data.sql` |
| 2 | SQL & Query Optimization Engineer | | `schema/02_views_indexes.sql`, `src/components/DBAConsole.jsx` |
| 3 | Transaction, Concurrency & Integrity Engineer | | `schema/03_triggers_integrity.sql`, `src/components/ExpenseModule.jsx` |
| 4 | Backend API & DB Integration Engineer | | `api.js`, `src/database.js`, `src/utils.js` |
| 5 | Authentication & Role-Based Access Engineer | | `schema/04_rbac.sql`, `src/auth.js`, `src/components/Login.jsx`, `src/components/UsersModule.jsx` |
| 6 | Frontend & DB Interaction Engineer | | `src/styles.js`, `src/components/ui.jsx`, `src/components/Sidebar.jsx`, `src/components/Dashboard.jsx`, `src/components/ProposalsModule.jsx`, `src/components/ProjectsModule.jsx`, `src/components/MilestonesModule.jsx`, `src/components/OutputsModule.jsx`, `src/components/GrantsModule.jsx`, `src/components/AIGrantMatcher.jsx`, `src/components/DepartmentsModule.jsx`, `src/App.jsx` |
| 7 | Backup, Recovery & Analytics Engineer | | `schema/05_stored_procs_events.sql`, `src/analytics.js`, `src/components/Analytics.jsx` |

---

## Project Structure

```
uni-grant/
├── index.html                         # HTML entry point
├── UniGrant.jsx                       # Root re-export (build compat shim)
├── api.js                             # Role 4: REST API service layer
├── schema/
│   ├── 01_schema_er.sql               # Role 1: All CREATE TABLE + ER design
│   ├── 02_views_indexes.sql           # Role 2: Views + index strategy
│   ├── 03_triggers_integrity.sql      # Role 3: Triggers + ACID transactions
│   ├── 04_rbac.sql                    # Role 5: GRANT/REVOKE + roles
│   ├── 05_stored_procs_events.sql     # Role 7: Stored procs + events + backup
│   └── 06_seed_data.sql               # Role 1: Sample data
└── src/
    ├── App.jsx                        # Role 6: Root component
    ├── auth.js                        # Role 5: Authentication + NAV config
    ├── analytics.js                   # Role 7: Analytics computation helpers
    ├── database.js                    # Role 4: Mock DB + SQL audit log
    ├── styles.js                      # Role 6: Global CSS
    ├── utils.js                       # Role 4: Formatting utilities
    └── components/
        ├── ui.jsx                     # Role 6: Shared primitives (Badge, Modal…)
        ├── Login.jsx                  # Role 5: Authentication screen
        ├── Sidebar.jsx                # Role 6: Role-filtered navigation
        ├── Dashboard.jsx              # Role 6: KPI overview per role
        ├── ProposalsModule.jsx        # Role 6+3: Proposal CRUD + triggers
        ├── ProjectsModule.jsx         # Role 6: Project detail + budget/team
        ├── ExpenseModule.jsx          # Role 3: ACID expense approval
        ├── MilestonesModule.jsx       # Role 6: Milestone tracker
        ├── OutputsModule.jsx          # Role 6: Publications & patents
        ├── GrantsModule.jsx           # Role 6: Grant listing
        ├── AIGrantMatcher.jsx         # Role 6+2: Full-text search + matching
        ├── DBAConsole.jsx             # Role 2: Views/triggers/indexes viewer
        ├── Analytics.jsx              # Role 7: Cross-dept analytics dashboard
        ├── UsersModule.jsx            # Role 5: User + RBAC management
        └── DepartmentsModule.jsx      # Role 6: Department overview
```

---

## Role Contributions

### Role 1 — Database Schema & ER Modeling Engineer
**Files:** `schema/01_schema_er.sql`, `schema/06_seed_data.sql`

Designed the full Entity-Relationship model for UniGrant:

- **Strong entities:** `Department`, `User`, `FundingAgency`, `ExternalCall`, `Proposal`, `Grant_`, `Project`, `BudgetHead`, `Expense`, `Milestone`, `ResearchOutput`, `Notification`
- **Weak entities:** `Dependent` (partial key: `user_id + dependent_name`), `PublicationAuthor`, `Equipment`
- **M:N relationships:** `WORKS_ON` (User ↔ Project), `SUPERVISES` (User ↔ User, self-referential), `MATCHES` (ExternalCall ↔ User)
- ISA (specialisation) hierarchy for `User` → `{Admin, PI, Student, Grant_Officer}` implemented as single-table inheritance via `role` ENUM
- `BudgetHead.remaining_balance` is a `GENERATED ALWAYS AS` computed column to prevent update anomalies
- All FK relationships include `ON DELETE` actions (CASCADE, RESTRICT, SET NULL) chosen based on entity dependency

Key design decisions:
- `Grant_` is named with underscore because `GRANT` is a reserved SQL keyword
- `remaining_balance` uses `STORED` (materialised) rather than `VIRTUAL` for index support
- CHECK constraints enforce domain integrity at the DB level independently of application code

---

### Role 2 — SQL & Query Optimization Engineer
**Files:** `schema/02_views_indexes.sql`, `src/components/DBAConsole.jsx`

Designed the three-tier view architecture and full index strategy:

**Views:**
| View | Purpose | Visible To |
|------|---------|------------|
| `Public_Project_View` | Hides all financial data | Students, Public |
| `PI_Dashboard_View` | Personalised per-PI summary with aggregates | PI |
| `Admin_Analytics_View` | Cross-department GROUP BY aggregation | Admin |
| `Student_Project_View` | Row-level filtered (WORKS_ON join) | Student |

**Indexes:**

| Index | Type | Columns | Query Pattern |
|-------|------|---------|---------------|
| `IDX_Project_Title_Status` | B-tree composite | `project_title, status` | Dashboard status filter |
| `IDX_User_Name` | B-tree composite | `last_name, first_name` | Name lookup |
| `IDX_Expense_Date_Project` | B-tree composite | `date, project_id` | Timeline queries |
| `IDX_Milestone_Status_DueDate` | B-tree composite | `status, due_date` | 30-day alert event |
| `FT_Proposal` | FULLTEXT inverted | `abstract, title` | AI proposal search |
| `FT_User_Specialization` | FULLTEXT inverted | `specialization` | Grant matching |

The `DBAConsole.jsx` component exposes all views, triggers, stored procedures, and the index strategy to the Admin user in the live UI.

---

### Role 3 — Transaction, Concurrency & Integrity Engineer
**Files:** `schema/03_triggers_integrity.sql`, `src/components/ExpenseModule.jsx`

Implemented all triggers and ACID transaction logic:

**Triggers:**

| Trigger | Event | Purpose |
|---------|-------|---------|
| `balance_check_before_expense` | `BEFORE INSERT ON Expense` | Blocks overspend; `SIGNAL SQLSTATE '45000'` |
| `update_budget_on_approval` | `AFTER UPDATE ON Expense` | Atomically updates `BudgetHead.spent_amount` |
| `active_project_limit_pi` | `BEFORE INSERT ON Proposal` | Enforces max 5 active projects per PI |
| `auto_close_project` | `AFTER UPDATE ON Project` | Closes project when `end_date` passes |
| `prevent_duplicate_expense_receipt` | `BEFORE INSERT ON Expense` | Blocks duplicate receipt references |

**ACID demonstration in `ExpenseModule.jsx`:**
- **Atomicity** — `Expense INSERT` + `BudgetHead UPDATE` wrapped in one transaction
- **Consistency** — Trigger fires before insert to validate balance
- **Isolation** — `SELECT FOR UPDATE` pattern documented for concurrent approvals
- **Durability** — Committed changes persist across component re-renders

The Expense Approvals UI fires these triggers live and displays the SQL in the Audit Console.

---

### Role 4 — Backend API & DB Integration Engineer
**Files:** `api.js`, `src/database.js`, `src/utils.js`

Built two layers of backend integration:

**`api.js` — REST API service layer:**
- Full CRUD endpoints for all entities (Users, Projects, Expenses, Grants, etc.)
- JWT Bearer token authentication (`Authorization: Bearer <token>`)
- Automatic 401 interception with session cleanup
- Query string builder for filter parameters
- Maps to real backend routes: `POST /auth/login`, `GET /projects`, `PATCH /expenses/:id/status`, etc.

**`src/database.js` — In-memory mock DB:**
- Mirrors the MySQL schema in JavaScript for the demo frontend
- All mutations also call `logSQL()` to show the equivalent SQL in the Audit Console
- Shared mutable object — all component imports reference the same DB state

**`src/utils.js` — Formatting helpers:**
- `inr(n)` → mirrors `FORMAT(n, 2)` with Indian locale (`₹1,23,456`)
- `fmtDate(d)` → mirrors `DATE_FORMAT(d, '%d %b %Y')`
- `daysUntil(d)` → mirrors `DATEDIFF(d, CURDATE())`

---

### Role 5 — Authentication & Role-Based Access Engineer
**Files:** `schema/04_rbac.sql`, `src/auth.js`, `src/components/Login.jsx`, `src/components/UsersModule.jsx`

Implemented the full RBAC system:

**MySQL roles and privilege matrix:**

| Role | Tables | Privileges |
|------|--------|------------|
| `admin_role` | All | ALL + CREATE USER + GRANT OPTION |
| `pi_role` | Proposal, Expense, Milestone, ResearchOutput | SELECT, INSERT, UPDATE |
| `grant_officer_role` | Proposal (R), Expense (RU) | SELECT only on Proposal; UPDATE on Expense |
| `student_role` | Views only | SELECT on Public/Student views |

`REVOKE CREATE USER ON *.* FROM grant_officer_role` is explicitly shown in the UI.

**`src/auth.js`:**
- `authenticateUser(email, password)` — simulates `SELECT ... WHERE SHA2(password,256) = password_hash`
- `NAV` config — each role's navigation items are filtered to match their SQL GRANT permissions
- `ROLE_COLORS` — visual differentiation per role in the sidebar

**`src/components/Login.jsx`:**
- Demo account quick-fill for all 4 roles
- 700ms simulated auth latency (production: POST `/auth/login` via `api.js`)

---

### Role 6 — Frontend & DB Interaction Engineer
**Files:** `src/styles.js`, `src/App.jsx`, and all `src/components/*.jsx` not owned by other roles

Built the entire React frontend that visually represents the database:

**Component → DB entity mapping:**

| Component | DB Entity/View |
|-----------|---------------|
| `Dashboard.jsx` | `PI_Dashboard_View`, `Admin_Analytics_View` |
| `ProposalsModule.jsx` | `Proposal` table + `active_project_limit_pi` trigger |
| `ProjectsModule.jsx` | `Project` + `BudgetHead` + `WORKS_ON` |
| `ExpenseModule.jsx` | `Expense` + ACID transactions |
| `MilestonesModule.jsx` | `Milestone` + 30-day alert event |
| `OutputsModule.jsx` | `ResearchOutput` + `PublicationAuthor` |
| `GrantsModule.jsx` | `Grant_` table |
| `AIGrantMatcher.jsx` | `MATCHES` table + `FT_User_Specialization` FULLTEXT |
| `DepartmentsModule.jsx` | `Department` + aggregated joins |

**Design system** (`src/styles.js`):
- Palette: deep navy (`#0c1a2e`) + warm gold (`#c9a84c`) — institutional aesthetic
- Typography: DM Serif Display (headings) + DM Sans (body)
- `Badge` component renders all SQL ENUM values with colour coding

**SQL Audit Console** (`ui.jsx → SQLConsole`):
- Shows the last 5 SQL queries executed by any module
- Auto-refreshes every 1.5 seconds via `setInterval` in `App.jsx`
- Mimics MySQL's `general_log` output format

---

### Role 7 — Backup, Recovery & Analytics Engineer
**Files:** `schema/05_stored_procs_events.sql`, `src/analytics.js`, `src/components/Analytics.jsx`

Built the analytics layer and database maintenance system:

**Stored Procedures:**

| Procedure | Parameters | Description |
|-----------|-----------|-------------|
| `generate_annual_report` | `dept_id INT` | Full funding/output/student report for a department |
| `get_pi_budget_summary` | `pi_id INT` | Budget utilisation per category per PI |

**Scheduled Events:**

| Event | Schedule | Action |
|-------|----------|--------|
| `milestone_30day_alert` | Daily | Inserts `Notification` rows for due milestones |
| `monthly_budget_snapshot` | 1st of month | Archives `BudgetHead` balances to `BudgetSnapshot` |
| `grant_closure_check` | Daily | Auto-closes expired active grants |

**`src/analytics.js` — JS mirror of SQL aggregations:**
- `getUniversityKPIs()` → mirrors `SELECT COUNT(*), SUM() FROM Admin_Analytics_View`
- `getDepartmentFundingStats()` → mirrors `GROUP BY d.dept_id`
- `getExpenseCategoryStats()` → mirrors `GROUP BY bh.category`
- `generateAnnualReport(deptId)` → mirrors `CALL generate_annual_report(dept_id)`

**Backup strategy (documented in `05_stored_procs_events.sql`):**
- Nightly `mysqldump --single-transaction --routines --triggers --events`
- Incremental via MySQL binary log (`binlog_format = ROW`)
- Point-in-time recovery via `mysqlbinlog --start-datetime ... --stop-datetime`
- Primary-Replica replication setup for HA

---

## How to Run

### Frontend (React)
```bash
# Install dependencies (Vite + React)
npm create vite@latest . -- --template react
npm install

# Start dev server
npm run dev
```

### Database Setup
```bash
# Run schema files in order
mysql -u root -p < schema/01_schema_er.sql
mysql -u root -p < schema/02_views_indexes.sql
mysql -u root -p < schema/03_triggers_integrity.sql
mysql -u root -p < schema/04_rbac.sql
mysql -u root -p < schema/05_stored_procs_events.sql
mysql -u root -p < schema/06_seed_data.sql
```

### Demo Accounts (frontend mock)

| Role | Email | Password |
|------|-------|----------|
| Admin | priya@university.edu | admin123 |
| PI | arjun@university.edu | pi123 |
| PI | vikram@university.edu | pi456 |
| Student | rahul@university.edu | student123 |
| Grant Officer | sneha@university.edu | go123 |

---

## Key Features Demonstrated

| Feature | Where to see it |
|---------|----------------|
| RBAC with MySQL roles | Login as different users; DBA Console → Roles tab |
| ACID expense approval | Login as Grant Officer → Expense Approvals → Approve |
| Trigger: balance check | Login as PI → Add Expense → Enter amount > available balance |
| Trigger: project limit | Login as PI → New Proposal (if 5 active projects exist) |
| Stored procedure | Login as Admin → DBA Console → Stored Proc → Execute |
| Views (3-tier) | DBA Console → Views tab |
| Full-text search | AI Grant Matcher → Semantic Search |
| Analytics dashboard | Login as Admin → Analytics |
| SQL Audit Console | Bottom of every page — shows live queries |
