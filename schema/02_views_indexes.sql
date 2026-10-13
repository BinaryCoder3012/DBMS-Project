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
--    ② PI_Dashboard_View    — personalised per-user view
--    ③ Admin_Analytics_View — cross-department aggregation
--    ④ Student_Project_View — row-level filtered view
-- ════════════════════════════════════════════════════════════

-- ── ① Public_Project_View ────────────────────────────────────
-- Purpose: External stakeholders / student read access.
-- Security: No financial columns (current_balance, stipend, salaries).
-- Used by: student_role (GRANT SELECT ON Public_Project_View)
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
JOIN User        u ON p.pi_id        = u.user_id
JOIN Department  d ON p.department_id = d.dept_id
JOIN Grant_      g ON p.grant_id      = g.grant_id;
-- INTENTIONALLY OMITTED: current_balance, stipend_amount, salary, budget_heads

