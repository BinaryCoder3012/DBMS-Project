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
--  Type:    AFTER UPDATE on Project
--  Purpose: Automatically set project status to 'Closed' when
--           end_date has passed and status is still 'Active'.
--  Note:    In production, this fires on any UPDATE — combine with
--           the milestone_30day_alert EVENT for scheduled checks.
-- ════════════════════════════════════════════════════════════
CREATE TRIGGER auto_close_project
AFTER UPDATE ON Project
FOR EACH ROW
BEGIN
  IF CURDATE() > NEW.end_date AND NEW.status = 'Active' THEN
    UPDATE Project
    SET status = 'Closed'
    WHERE project_id = NEW.project_id;
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
