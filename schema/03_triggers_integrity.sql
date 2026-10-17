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
