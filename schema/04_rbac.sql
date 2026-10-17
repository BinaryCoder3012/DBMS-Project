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
