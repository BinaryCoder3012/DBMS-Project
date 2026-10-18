-- ============================================================
--  UniGrant — Role-Based Access Control (RBAC)
--  Role 5: Authentication & Role-Based Access Engineer
-- ============================================================
--  Responsibilities:
--    • Define MySQL roles and map to application roles
--    • GRANT minimum necessary privileges per role
--    • REVOKE dangerous privileges explicitly
--    • Create database users and assign roles
--    • Document row-level security strategy
-- ============================================================

USE unigrant;

-- ════════════════════════════════════════════════════════════
--  ROLE DEFINITIONS
--  Four roles matching the application's user.role ENUM:
--    Admin → admin_role
--    PI → pi_role
--    Grant_Officer → grant_officer_role
--    Student → student_role
-- ════════════════════════════════════════════════════════════

CREATE ROLE IF NOT EXISTS admin_role;
CREATE ROLE IF NOT EXISTS pi_role;
CREATE ROLE IF NOT EXISTS grant_officer_role;
CREATE ROLE IF NOT EXISTS student_role;

-- ════════════════════════════════════════════════════════════
--  ① ADMIN ROLE — Full DBA
--  Has ALL PRIVILEGES including CREATE USER and GRANT OPTION.
--  Can manage schema, create/drop tables, manage other users.
-- ════════════════════════════════════════════════════════════
GRANT ALL PRIVILEGES ON unigrant.* TO admin_role WITH GRANT OPTION;
GRANT CREATE USER ON *.* TO admin_role;

-- ════════════════════════════════════════════════════════════
--  ② PI ROLE — Principal Investigator
--  Read/write on own research objects.
--  Cannot manage users, cannot drop tables.
--  Row-level filtering enforced at application layer (pi_id = current user).
-- ════════════════════════════════════════════════════════════
-- Proposals: full CRUD
GRANT SELECT, INSERT, UPDATE ON unigrant.Proposal       TO pi_role;
-- Expenses: can create, view own; cannot approve
GRANT SELECT, INSERT         ON unigrant.Expense        TO pi_role;
-- Research outputs: create and view
GRANT SELECT, INSERT         ON unigrant.ResearchOutput TO pi_role;
-- Milestones: update completion status
GRANT SELECT, INSERT, UPDATE ON unigrant.Milestone      TO pi_role;
-- Projects: view only (creation managed by Admin/Grant linkage)
GRANT SELECT                 ON unigrant.Project        TO pi_role;
-- Budget: view only (created during project setup)
GRANT SELECT                 ON unigrant.BudgetHead     TO pi_role;
-- Grants: view only
GRANT SELECT                 ON unigrant.Grant_         TO pi_role;
-- Dashboard view
GRANT SELECT                 ON unigrant.PI_Dashboard_View TO pi_role;

-- ════════════════════════════════════════════════════════════
--  ③ GRANT OFFICER ROLE — Finance Approval
--  Can view proposals and approve/reject expenses.
--  Explicitly BLOCKED from creating users or modifying schema.
-- ════════════════════════════════════════════════════════════
GRANT SELECT         ON unigrant.Proposal TO grant_officer_role;
GRANT SELECT, UPDATE ON unigrant.Expense  TO grant_officer_role;
GRANT SELECT         ON unigrant.Grant_   TO grant_officer_role;
GRANT SELECT         ON unigrant.Project  TO grant_officer_role;
GRANT SELECT         ON unigrant.BudgetHead TO grant_officer_role;

-- Explicitly revoke dangerous privilege (even if inherited from default)
REVOKE CREATE USER ON *.* FROM grant_officer_role;

-- ════════════════════════════════════════════════════════════
--  ④ STUDENT ROLE — View Only (Row-Level Security)
--  Access only through pre-defined views.
--  Public_Project_View hides all financial data.
--  Student_Project_View further filters to assigned projects only.
-- ════════════════════════════════════════════════════════════
GRANT SELECT ON unigrant.Public_Project_View  TO student_role;
GRANT SELECT ON unigrant.Student_Project_View TO student_role;
-- No direct table access — all data access through views

-- ════════════════════════════════════════════════════════════
--  DATABASE USERS
