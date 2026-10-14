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

-- ── ② PI_Dashboard_View ──────────────────────────────────────
-- Purpose: Real-time summary for a PI's own projects only.
-- Row-level security: WHERE pi_id = CURRENT_USER() identity.
-- Aggregates: pending milestones, budget utilisation %, team size.
CREATE OR REPLACE VIEW PI_Dashboard_View AS
SELECT
  p.project_id,
  p.project_title,
  p.current_balance,
  COUNT(CASE WHEN m.status = 'Pending' THEN 1 END)                AS pending_milestones,
  ROUND(SUM(bh.spent_amount) / NULLIF(SUM(bh.allocated_amount),0) * 100, 1)
                                                                   AS budget_utilisation_pct,
  COUNT(DISTINCT wo.user_id)                                       AS team_size,
  g.funding_agency
FROM Project     p
JOIN Milestone   m  ON p.project_id = m.project_id
JOIN BudgetHead  bh ON p.project_id = bh.project_id
JOIN WORKS_ON    wo ON p.project_id = wo.project_id
JOIN Grant_      g  ON p.grant_id   = g.grant_id
WHERE p.pi_id = (SELECT user_id FROM User WHERE email = CURRENT_USER())
GROUP BY p.project_id, p.project_title, p.current_balance, g.funding_agency;


-- ── ④ Student_Project_View (row-level security) ───────────────
-- Purpose: Students only see projects they are assigned to via WORKS_ON.
-- This enforces row-level security without a policy engine.
-- GRANT SELECT ON Student_Project_View TO student_role;
CREATE OR REPLACE VIEW Student_Project_View AS
  SELECT p.*
  FROM Project p
  JOIN WORKS_ON wo ON p.project_id = wo.project_id
  WHERE wo.user_id = (SELECT user_id FROM User WHERE email = CURRENT_USER());

-- ════════════════════════════════════════════════════════════
--  INDEX STRATEGY
--  InnoDB stores data in the B+ tree of the clustered (PK) index.
--  All secondary indexes below are non-clustered B-trees or
--  inverted-index (FULLTEXT) structures.
-- ════════════════════════════════════════════════════════════

