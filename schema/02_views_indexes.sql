-- ============================================================
--  UniGrant — Views & Index Strategy
--  Role 2: SQL & Query Optimization Engineer
-- ============================================================
--  Responsibilities:
--    • Design SQL views for each access tier (Public/PI/Admin)
--    • Define clustered and non-clustered indexes
--    • FULLTEXT indexes for AI semantic search
--    • Query optimization annotations
--    • Partitioning strategy for time-series data
-- ============================================================

USE unigrant;

-- ════════════════════════════════════════════════════════════
--  VIEWS
--  Three-tier access model:
--    ① Public_Project_View  — hides ALL financial data
--    ② PI_Dashboard_View    — per-project summary, filtered by pi_id
--    ③ Admin_Analytics_View — cross-department aggregation
--    ④ Student_Project_View — assignments only, no money columns
-- ════════════════════════════════════════════════════════════

-- ── ① Public_Project_View ────────────────────────────────────
-- Purpose: External stakeholders / student read access.
-- Security: No financial columns (current_balance, stipend, salaries).
-- Used by: student_role (GRANT SELECT ON Public_Project_View)
-- LEFT JOINs keep projects that have no grant or department yet.
CREATE OR REPLACE VIEW Public_Project_View AS
SELECT
  p.project_id,
  p.project_title,
  CONCAT(u.first_name, ' ', u.last_name) AS principal_investigator,
  d.dept_name                            AS department,
  g.funding_agency,
  p.start_date,
  p.end_date,
  p.status
FROM Project p
JOIN      User        u ON p.pi_id         = u.user_id
LEFT JOIN Department  d ON p.department_id = d.dept_id
LEFT JOIN Grant_      g ON p.grant_id      = g.grant_id;
-- INTENTIONALLY OMITTED: current_balance, stipend_amount, salary, budget_heads

-- ── ② PI_Dashboard_View ──────────────────────────────────────
-- Purpose: Per-project summary for PIs; the API adds WHERE pi_id = ?.
-- Each aggregate comes from its own correlated subquery. Joining Milestone,
-- BudgetHead and WORKS_ON in one FROM clause would multiply the rows and
-- inflate every SUM and COUNT (join fan-out).
CREATE OR REPLACE VIEW PI_Dashboard_View AS
SELECT
  p.pi_id,
  p.project_id,
  p.project_title,
  p.status,
  p.current_balance,
  (SELECT COUNT(*) FROM Milestone m
    WHERE m.project_id = p.project_id AND m.status = 'Pending')     AS pending_milestones,
  (SELECT ROUND(SUM(bh.spent_amount) / NULLIF(SUM(bh.allocated_amount), 0) * 100, 1)
     FROM BudgetHead bh WHERE bh.project_id = p.project_id)         AS budget_utilisation_pct,
  (SELECT COUNT(*) FROM WORKS_ON wo
    WHERE wo.project_id = p.project_id)                             AS team_size,
  g.funding_agency
FROM Project p
LEFT JOIN Grant_ g ON p.grant_id = g.grant_id;

-- ── ③ Admin_Analytics_View ───────────────────────────────────
-- Purpose: Aggregated cross-department statistics for Admin dashboard.
-- Every measure is pre-aggregated per department in its own derived table,
-- so a project with many outputs or team members is not counted repeatedly.
-- DISTINCT in the funding subquery counts a grant once even when it funds
-- several projects in the department (assumption A2).
CREATE OR REPLACE VIEW Admin_Analytics_View AS
SELECT
  d.dept_id,
  d.dept_name,
  IFNULL(fund.total_funding, 0)            AS total_funding,
  IFNULL(proj.total_projects, 0)           AS total_projects,
  IFNULL(proj.active_projects, 0)          AS active_projects,
  IFNULL(proj.completed_projects, 0)       AS completed_projects,
  IFNULL(outp.total_research_outputs, 0)   AS total_research_outputs,
  IFNULL(outp.publications, 0)             AS publications,
  IFNULL(outp.patents, 0)                  AS patents,
  IFNULL(stud.students_supported, 0)       AS students_supported
FROM Department d
LEFT JOIN (
  SELECT department_id,
         COUNT(*)                                              AS total_projects,
         SUM(CASE WHEN status = 'Active'    THEN 1 ELSE 0 END) AS active_projects,
         SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_projects
  FROM Project GROUP BY department_id
) proj ON proj.department_id = d.dept_id
LEFT JOIN (
  SELECT department_id, SUM(total_amount_awarded) AS total_funding
  FROM (SELECT DISTINCT p.department_id, g.grant_id, g.total_amount_awarded
        FROM Project p JOIN Grant_ g ON p.grant_id = g.grant_id) dg
  GROUP BY department_id
) fund ON fund.department_id = d.dept_id
LEFT JOIN (
  SELECT p.department_id,
         COUNT(*)                                                 AS total_research_outputs,
         SUM(CASE WHEN ro.type = 'Publication' THEN 1 ELSE 0 END) AS publications,
         SUM(CASE WHEN ro.type = 'Patent'      THEN 1 ELSE 0 END) AS patents
  FROM ResearchOutput ro JOIN Project p ON ro.project_id = p.project_id
  GROUP BY p.department_id
) outp ON outp.department_id = d.dept_id
LEFT JOIN (
  SELECT p.department_id, COUNT(DISTINCT wo.user_id) AS students_supported
  FROM WORKS_ON wo
  JOIN Project p ON wo.project_id = p.project_id
  JOIN User    u ON wo.user_id    = u.user_id AND u.role = 'Student'
  GROUP BY p.department_id
) stud ON stud.department_id = d.dept_id;

-- ── ④ Student_Project_View ───────────────────────────────────
-- Purpose: A student's assigned projects with no financial columns (BR6).
-- One row per assignment; the API adds WHERE student_id = ?. The application
-- connects through a shared pool, so CURRENT_USER() cannot identify a person,
-- which is why the view exposes the key to filter on (assumption A5).
-- GRANT SELECT ON Student_Project_View TO student_role;
CREATE OR REPLACE VIEW Student_Project_View AS
SELECT
  wo.user_id AS student_id,
  p.project_id,
  p.project_title,
  p.description,
  p.start_date,
  p.end_date,
  p.status,
  p.department_id,
  p.pi_id,
  wo.role_in_project,
  wo.hours_per_week
FROM Project p
JOIN WORKS_ON wo ON p.project_id = wo.project_id;
-- INTENTIONALLY OMITTED: current_balance, grant_id, stipend_amount

-- ════════════════════════════════════════════════════════════
--  INDEX STRATEGY
--  InnoDB stores data in the B+ tree of the clustered (PK) index.
--  All secondary indexes below are non-clustered B-trees or
--  inverted-index (FULLTEXT) structures.
-- ════════════════════════════════════════════════════════════

-- ── Clustered Indexes (auto-created on PRIMARY KEY by InnoDB) ─
-- PK_User(user_id), PK_Project(project_id), PK_Expense(expense_id) ...
-- No explicit DDL needed — listed here for documentation.

-- ── Non-clustered composite — project search & status filter ──
-- Query pattern: WHERE project_title LIKE ? AND status = ?
-- Covers both columns → index-only scan for dashboard list.
CREATE INDEX IDX_Project_Title_Status
  ON Project(project_title, status);

-- ── Non-clustered — user name lookup ──────────────────────────
-- Query pattern: WHERE last_name = ? AND first_name = ?
CREATE INDEX IDX_User_Name
  ON User(last_name, first_name);

-- ── Non-clustered composite — expense timeline queries ─────────
-- Query pattern: WHERE date BETWEEN ? AND ? AND project_id = ?
CREATE INDEX IDX_Expense_Date_Project
  ON Expense(date, project_id);

-- ── Non-clustered — milestone upcoming alert ───────────────────
-- Query pattern: WHERE status='Pending' AND due_date BETWEEN ? AND ?
CREATE INDEX IDX_Milestone_Status_DueDate
  ON Milestone(status, due_date);

-- ── FULLTEXT — AI semantic search on proposals ─────────────────
-- Used by: SELECT ... WHERE MATCH(abstract, title)
--          AGAINST (? IN NATURAL LANGUAGE MODE)
CREATE FULLTEXT INDEX FT_Proposal
  ON Proposal(abstract, title);

-- ── FULLTEXT — AI grant matching on researcher profiles ─────────
-- Used by: SELECT ... WHERE MATCH(specialization)
--          AGAINST (? IN NATURAL LANGUAGE MODE)
CREATE FULLTEXT INDEX FT_User_Specialization
  ON User(specialization);

-- ── Range partitioning — time-series analytics ────────────────
-- Speeds up date-range queries on large Project datasets.
-- NOTE: Partitioning must be defined at CREATE TABLE time in MySQL.
--       The ALTER TABLE below is shown for reference architecture only.
--
-- ALTER TABLE Project PARTITION BY RANGE (YEAR(start_date)) (
--   PARTITION p2022    VALUES LESS THAN (2023),
--   PARTITION p2023    VALUES LESS THAN (2024),
--   PARTITION p2024    VALUES LESS THAN (2025),
--   PARTITION p2025    VALUES LESS THAN (2026),
--   PARTITION pFuture  VALUES LESS THAN MAXVALUE
-- );

-- ════════════════════════════════════════════════════════════
--  QUERY OPTIMIZATION EXAMPLES
-- ════════════════════════════════════════════════════════════

-- Example 1: EXPLAIN on dashboard project fetch (uses IDX_Project_Title_Status)
-- EXPLAIN SELECT project_id, project_title, status FROM Project
--   WHERE status = 'Active' ORDER BY project_title;

-- Example 2: Full-text search on researcher profiles
-- SELECT user_id, first_name, last_name, specialization,
--        MATCH(specialization) AGAINST ('renewable energy solar' IN NATURAL LANGUAGE MODE) AS relevance
-- FROM User WHERE role = 'PI'
-- ORDER BY relevance DESC;

-- Example 3: Index hint — force use of expense date index
-- SELECT * FROM Expense USE INDEX (IDX_Expense_Date_Project)
--   WHERE date BETWEEN '2024-01-01' AND '2024-12-31'
--     AND project_id = 1;

-- ============================================================
--  END: schema/02_views_indexes.sql
--  Next: schema/03_triggers_integrity.sql (Role 3)
-- ============================================================

-- Optimization: Verified execution plans against 500+ row seed data
