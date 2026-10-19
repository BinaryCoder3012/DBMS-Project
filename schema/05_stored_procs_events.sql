-- ============================================================
--  UniGrant — Stored Procedures, Events & Backup Strategy
--  Role 7: Backup, Recovery & Analytics Engineer
-- ============================================================
--  Responsibilities:
--    • Stored procedure: generate_annual_report(dept_id)
--    • Scheduled event: milestone_30day_alert (daily notification)
--    • Scheduled event: monthly_budget_snapshot (analytics archive)
--    • Backup strategy documentation (mysqldump commands)
--    • Point-in-time recovery (binary log) guidelines
-- ============================================================

USE unigrant;

-- Enable MySQL event scheduler (must be ON for events to fire)
SET GLOBAL event_scheduler = ON;

DELIMITER //

-- ════════════════════════════════════════════════════════════
--  STORED PROCEDURE: generate_annual_report
--  Purpose: Generate a comprehensive annual report for a given
--           department — funding received, projects, outputs,
--           students supported, and budget utilisation %.
--  Caller:  Admin via DBAConsole.jsx → Analytics.jsx
--  SQL:     CALL generate_annual_report(dept_id);
-- ════════════════════════════════════════════════════════════
CREATE PROCEDURE generate_annual_report(IN p_dept_id INT)
BEGIN
  DECLARE dept_exists INT DEFAULT 0;

  -- Input validation (mirrors CHECK constraint in application)
  SELECT COUNT(*) INTO dept_exists
  FROM Department WHERE dept_id = p_dept_id;

  IF dept_exists = 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ERR-DEPT001: Department not found';
  END IF;

  -- Main report query
  SELECT
    d.dept_name,
    YEAR(CURDATE())                                                       AS report_year,
    IFNULL(SUM(g.total_amount_awarded), 0)                               AS total_funds_received,
    COUNT(DISTINCT p.project_id)                                         AS total_projects,
    SUM(CASE WHEN p.status = 'Active'     THEN 1 ELSE 0 END)            AS active_projects,
    SUM(CASE WHEN p.status = 'Completed'  THEN 1 ELSE 0 END)            AS completed_projects,
    IFNULL(COUNT(DISTINCT ro.output_id), 0)                              AS total_research_outputs,
    SUM(CASE WHEN ro.type  = 'Publication' THEN 1 ELSE 0 END)           AS publications,
    SUM(CASE WHEN ro.type  = 'Patent'      THEN 1 ELSE 0 END)           AS patents,
    COUNT(DISTINCT CASE WHEN u.role = 'Student' THEN u.user_id END)     AS students_supported,
    IFNULL(SUM(e.amount), 0)                                             AS total_expenditure,
    ROUND(
      IFNULL(SUM(e.amount), 0) /
      NULLIF(SUM(g.total_amount_awarded), 0) * 100,
      2
    )                                                                    AS budget_utilisation_pct
  FROM Department d
  LEFT JOIN Project        p  ON d.dept_id    = p.department_id
  LEFT JOIN Grant_         g  ON p.grant_id   = g.grant_id
  LEFT JOIN ResearchOutput ro ON p.project_id = ro.project_id
  LEFT JOIN WORKS_ON       wo ON p.project_id = wo.project_id
  LEFT JOIN User           u  ON wo.user_id   = u.user_id
  LEFT JOIN Expense        e  ON p.project_id = e.project_id
                              AND e.status    = 'Approved'
  WHERE d.dept_id = p_dept_id
  GROUP BY d.dept_id, d.dept_name;
END //

-- ════════════════════════════════════════════════════════════
--  STORED PROCEDURE: get_pi_budget_summary
--  Purpose: Return budget utilisation per project for a given PI.
--  SQL:     CALL get_pi_budget_summary(pi_user_id);
-- ════════════════════════════════════════════════════════════
CREATE PROCEDURE get_pi_budget_summary(IN p_pi_id INT)
BEGIN
  SELECT
    p.project_id,
    p.project_title,
    bh.category,
    bh.allocated_amount,
    bh.spent_amount,
    bh.remaining_balance,
    ROUND(bh.spent_amount / NULLIF(bh.allocated_amount, 0) * 100, 1) AS utilisation_pct
  FROM Project     p
  JOIN BudgetHead  bh ON p.project_id = bh.project_id
  WHERE p.pi_id = p_pi_id
  ORDER BY p.project_id, bh.category;
END //

DELIMITER ;

-- ════════════════════════════════════════════════════════════
--  SCHEDULED EVENT 1: milestone_30day_alert
--  Schedule: Daily at midnight
--  Purpose:  Insert a Notification row for PIs whose milestones
--            are due in exactly 30 days (mirrors the 30-day
--            urgency colouring in MilestonesModule.jsx).
-- ════════════════════════════════════════════════════════════
CREATE EVENT IF NOT EXISTS milestone_30day_alert
ON SCHEDULE EVERY 1 DAY
STARTS CURDATE()
DO
  INSERT INTO Notification(user_id, message, sent_at)
  SELECT
    p.pi_id,
    CONCAT('⚠ Milestone due in 30 days: "', m.title,
           '" for project: ', p.project_title,
           ' — Deliverable: ', IFNULL(m.deliverable_description, 'N/A')),
    NOW()
  FROM Milestone m
  JOIN Project p ON m.project_id = p.project_id
  WHERE m.status   = 'Pending'
    AND m.due_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY);

-- ════════════════════════════════════════════════════════════
--  SCHEDULED EVENT 2: monthly_budget_snapshot
--  Schedule: 1st of every month
--  Purpose:  Archive current BudgetHead balances for trend analysis
--            and audit trail. Creates a snapshot in BudgetSnapshot.
-- ════════════════════════════════════════════════════════════

-- Snapshot archive table (created once)
CREATE TABLE IF NOT EXISTS BudgetSnapshot (
  snapshot_id    INT            NOT NULL AUTO_INCREMENT,
  snapshot_date  DATE           NOT NULL,
  budgethead_id  INT            NOT NULL,
  project_id     INT            NOT NULL,
  category       VARCHAR(20)    NOT NULL,
  allocated_amount DECIMAL(15,2),
  spent_amount     DECIMAL(15,2),
  remaining_balance DECIMAL(15,2),
  PRIMARY KEY (snapshot_id),
  INDEX IDX_Snapshot_Date (snapshot_date)
);

CREATE EVENT IF NOT EXISTS monthly_budget_snapshot
ON SCHEDULE EVERY 1 MONTH
STARTS DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)
DO
  INSERT INTO BudgetSnapshot
    (snapshot_date, budgethead_id, project_id, category,
     allocated_amount, spent_amount, remaining_balance)
  SELECT
    CURDATE(),
    bh.budgethead_id,
    bh.project_id,
    bh.category,
    bh.allocated_amount,
    bh.spent_amount,
    bh.remaining_balance
  FROM BudgetHead bh
  JOIN Project p ON bh.project_id = p.project_id
  WHERE p.status = 'Active';

-- ════════════════════════════════════════════════════════════
--  SCHEDULED EVENT 3: grant_closure_check
--  Schedule: Daily
--  Purpose:  Automatically mark grants as 'Closed' when their
--            end_date has passed (complements auto_close_project trigger).
-- ════════════════════════════════════════════════════════════
CREATE EVENT IF NOT EXISTS grant_closure_check
ON SCHEDULE EVERY 1 DAY
STARTS CURDATE()
DO
  UPDATE Grant_
  SET status = 'Closed'
  WHERE status   = 'Active'
    AND end_date < CURDATE();

-- ════════════════════════════════════════════════════════════
--  BACKUP & RECOVERY STRATEGY
-- ════════════════════════════════════════════════════════════

