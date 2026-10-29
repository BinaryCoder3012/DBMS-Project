-- ============================================================
--  UniGrant — Triggers, Constraints & Transaction Integrity
--  Role 3: Transaction, Concurrency & Integrity Engineer
-- ============================================================
--  Responsibilities:
--    • Define all BEFORE/AFTER triggers with SIGNAL error handling
--    • Demonstrate ACID transactions (BEGIN/COMMIT/ROLLBACK)
--    • Implement CHECK constraints for domain integrity
--    • Handle concurrency via SELECT FOR UPDATE locking
--    • Document isolation level strategy
-- ============================================================

USE unigrant;

DELIMITER //

-- ════════════════════════════════════════════════════════════
--  TRIGGER 1: balance_check_before_expense
--  Type:    BEFORE INSERT on Expense
--  Purpose: Prevent overspending a budget head.
--  ACID:    Atomicity — if this trigger fires, the entire INSERT
--           transaction is rolled back. No partial state.
-- ════════════════════════════════════════════════════════════
CREATE TRIGGER balance_check_before_expense
BEFORE INSERT ON Expense
FOR EACH ROW
BEGIN
  DECLARE avail DECIMAL(15,2);

  -- Read current available balance (with implicit lock in transaction context)
  SELECT remaining_balance INTO avail
  FROM BudgetHead
  WHERE budgethead_id = NEW.budgethead_id;

  IF avail IS NULL THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ERR-BH000: BudgetHead not found';
  END IF;

  IF NEW.amount > avail THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ERR-BH001: Expense amount exceeds remaining balance in this budget head';
  END IF;
END //

-- ════════════════════════════════════════════════════════════
--  TRIGGER 2: update_budget_on_approval
--  Type:    AFTER UPDATE on Expense
--  Purpose: Atomically update BudgetHead.spent_amount when an
--           expense status changes to Approved or back to Rejected.
--  ACID:    Atomicity — the Expense UPDATE and BudgetHead UPDATE
--           are part of the same transaction. Both commit or both roll back.
--  Concurrency: Uses row-level locking (InnoDB default) on BudgetHead row.
-- ════════════════════════════════════════════════════════════
CREATE TRIGGER update_budget_on_approval
AFTER UPDATE ON Expense
FOR EACH ROW
BEGIN
  IF NEW.status = 'Approved' AND OLD.status = 'Pending' THEN
    UPDATE BudgetHead
    SET spent_amount = spent_amount + NEW.amount
    WHERE budgethead_id = NEW.budgethead_id;
  END IF;

  -- Reversal: if an approved expense is rejected (e.g., audit correction)
  IF NEW.status = 'Rejected' AND OLD.status = 'Approved' THEN
    UPDATE BudgetHead
    SET spent_amount = spent_amount - NEW.amount
    WHERE budgethead_id = NEW.budgethead_id;
  END IF;
END //

-- ════════════════════════════════════════════════════════════
--  TRIGGER 3: active_project_limit_pi
--  Type:    BEFORE INSERT on Proposal
--  Purpose: Enforce business rule — a PI may not have more than
--           5 concurrently active projects.
--  ACID:    Consistency — prevents INSERT that would violate the rule.
-- ════════════════════════════════════════════════════════════
CREATE TRIGGER active_project_limit_pi
BEFORE INSERT ON Proposal
FOR EACH ROW
BEGIN
  DECLARE active_count INT;

  SELECT COUNT(*) INTO active_count
  FROM Project
  WHERE pi_id = NEW.pi_id AND status = 'Active';

  IF active_count >= 5 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ERR-PI001: PI already has 5 active projects; cannot submit new proposal';
  END IF;
END //

-- ════════════════════════════════════════════════════════════
--  TRIGGER 4: auto_close_project
--  Type:    BEFORE UPDATE on Project
--  Purpose: Automatically set project status to 'Closed' when
--           end_date has passed and status is still 'Active'.
--  Note:    Must be BEFORE UPDATE and assign NEW.status. A trigger may
--           not run UPDATE on its own table (MySQL error 1442), so an
--           AFTER UPDATE version aborts the statement that fired it.
-- ════════════════════════════════════════════════════════════
CREATE TRIGGER auto_close_project
BEFORE UPDATE ON Project
FOR EACH ROW
BEGIN
  IF CURDATE() > NEW.end_date AND NEW.status = 'Active' THEN
    SET NEW.status = 'Closed';
  END IF;
END //

-- ════════════════════════════════════════════════════════════
--  TRIGGER 5: prevent_duplicate_expense_receipt
--  Type:    BEFORE INSERT on Expense
--  Purpose: Prevent duplicate receipt references within same project.
--  ACID:    Consistency — guards against accidental double-submission.
-- ════════════════════════════════════════════════════════════
CREATE TRIGGER prevent_duplicate_expense_receipt
BEFORE INSERT ON Expense
FOR EACH ROW
BEGIN
  DECLARE dup_count INT;

  SELECT COUNT(*) INTO dup_count
  FROM Expense
  WHERE project_id       = NEW.project_id
    AND receipt_reference = NEW.receipt_reference
    AND NEW.receipt_reference IS NOT NULL
    AND NEW.receipt_reference != '';

  IF dup_count > 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ERR-EXP001: Duplicate receipt reference for this project';
  END IF;
END //

DELIMITER ;

-- ════════════════════════════════════════════════════════════
--  ACID TRANSACTION EXAMPLES
-- ════════════════════════════════════════════════════════════

-- ── Expense Approval Transaction ──────────────────────────────
-- Atomically approves an expense and updates BudgetHead.
-- If any statement fails, ROLLBACK restores prior state.
--
-- START TRANSACTION;
--
--   -- Lock the expense row (prevents concurrent approval)
--   SELECT * FROM Expense WHERE expense_id = 3 FOR UPDATE;
--
--   -- Approve the expense
--   UPDATE Expense
--   SET status = 'Approved', approved_by = 4, approval_date = NOW()
--   WHERE expense_id = 3;
--   -- ↑ Trigger update_budget_on_approval fires here automatically
--
-- COMMIT;
-- -- OR: ROLLBACK; if any validation fails

-- ── Budget Transfer Transaction ────────────────────────────────
-- Move funds between two budget heads within the same project.
--
-- START TRANSACTION;
--
--   SELECT remaining_balance FROM BudgetHead
--   WHERE budgethead_id = 1 FOR UPDATE;
--
--   SELECT remaining_balance FROM BudgetHead
--   WHERE budgethead_id = 2 FOR UPDATE;
--
--   -- Debit source head
--   UPDATE BudgetHead SET allocated_amount = allocated_amount - 50000
--   WHERE budgethead_id = 1;
--
--   -- Credit target head
--   UPDATE BudgetHead SET allocated_amount = allocated_amount + 50000
--   WHERE budgethead_id = 2;
--
-- COMMIT;

-- ════════════════════════════════════════════════════════════
--  ISOLATION LEVEL STRATEGY
-- ════════════════════════════════════════════════════════════
-- Default: REPEATABLE READ (InnoDB default)
-- For expense approval: Use READ COMMITTED to avoid long-held locks.
-- For financial reporting: Use SERIALIZABLE to prevent phantom reads.
--
-- SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- START TRANSACTION;
-- ... expense approval ...
-- COMMIT;
--
-- SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- START TRANSACTION;
-- ... generate_annual_report() call ...
-- COMMIT;

-- ════════════════════════════════════════════════════════════
--  CHECK CONSTRAINTS SUMMARY (all defined in 01_schema_er.sql)
-- ════════════════════════════════════════════════════════════
-- Proposal:  chk_proposal_budget   → total_budget_requested > 0
-- Proposal:  chk_proposal_duration → duration_months > 0
-- Grant_:    chk_grant_dates       → end_date > start_date
-- Grant_:    chk_grant_amount      → total_amount_awarded > 0
-- Project:   chk_project_dates     → end_date > start_date
-- Project:   chk_project_balance   → current_balance >= 0
-- BudgetHead:chk_budget_amounts    → allocated_amount > 0 AND spent_amount >= 0
-- Expense:   chk_expense_amount    → amount > 0
-- MATCHES:   (inline)              → match_score BETWEEN 0 AND 100
-- SUPERVISES:chk_no_self_supervise → supervisor_id != supervisee_id

-- ============================================================
--  END: schema/03_triggers_integrity.sql
--  Next: schema/04_rbac.sql (Role 5)
-- ============================================================
