-- ============================================================
--  UniGrant — Role-Based Access Control (RBAC)
--  Owner: Maddela Bhargava Krishna Reddy
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
GRANT SELECT                 ON unigrant.Public_Project_View TO pi_role;

-- ════════════════════════════════════════════════════════════
--  ③ GRANT OFFICER ROLE — Finance Approval
--  Reviews proposals, awards grants (W1) and approves or rejects expenses.
--  Project and BudgetHead rows are created only as part of an award.
--  Explicitly BLOCKED from creating users or modifying schema.
-- ════════════════════════════════════════════════════════════
GRANT SELECT, UPDATE (status) ON unigrant.Proposal   TO grant_officer_role;
GRANT SELECT, UPDATE          ON unigrant.Expense    TO grant_officer_role;
GRANT SELECT, INSERT          ON unigrant.Grant_     TO grant_officer_role;
GRANT SELECT, INSERT          ON unigrant.Project    TO grant_officer_role;
GRANT SELECT, INSERT          ON unigrant.BudgetHead TO grant_officer_role;
GRANT SELECT                  ON unigrant.Public_Project_View TO grant_officer_role;

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
--  Application-level users bound to their roles.
--  In production: use connection pooling with role-specific credentials.
-- ════════════════════════════════════════════════════════════
CREATE USER IF NOT EXISTS 'admin_user'@'%'          IDENTIFIED BY 'AdminPass!1';
CREATE USER IF NOT EXISTS 'pi_user'@'%'             IDENTIFIED BY 'PIPass!1';
CREATE USER IF NOT EXISTS 'grant_officer_user'@'%'  IDENTIFIED BY 'GOPass!1';
CREATE USER IF NOT EXISTS 'student_user'@'%'        IDENTIFIED BY 'StudPass!1';

GRANT admin_role         TO 'admin_user'@'%';
GRANT pi_role            TO 'pi_user'@'%';
GRANT grant_officer_role TO 'grant_officer_user'@'%';
GRANT student_role       TO 'student_user'@'%';

-- Activate roles on login (MySQL 8.0+)
SET DEFAULT ROLE ALL TO
  'admin_user'@'%',
  'pi_user'@'%',
  'grant_officer_user'@'%',
  'student_user'@'%';

-- ════════════════════════════════════════════════════════════
--  PRIVILEGE MATRIX SUMMARY
-- ════════════════════════════════════════════════════════════
-- Table/View           | Admin | PI  | Grant Officer | Student
-- ─────────────────────┼───────┼─────┼───────────────┼────────
-- User                 |  ALL  |  —  |      —        |   —
-- Department           |  ALL  |  —  |      —        |   —
-- Proposal             |  ALL  | SIU | S, U(status)  |   —
-- Grant_               |  ALL  |  S  |     SI        |   —
-- Project              |  ALL  |  S  |     SI        |   —
-- BudgetHead           |  ALL  |  S  |     SI        |   —
-- Expense              |  ALL  | SI  |     SU        |   —
-- Milestone            |  ALL  | SIU |      —        |   —
-- ResearchOutput       |  ALL  | SI  |      —        |   —
-- Public_Project_View  |  ALL  |  S  |      S        |   S
-- PI_Dashboard_View    |  ALL  |  S  |      —        |   —
-- Admin_Analytics_View |  ALL  |  —  |      —        |   —
-- Student_Project_View |  ALL  |  —  |      —        |   S
-- ─────────────────────┴───────┴─────┴───────────────┴────────
-- S=SELECT, I=INSERT, U=UPDATE, ALL=all privileges

-- ════════════════════════════════════════════════════════════
--  ROW-LEVEL SECURITY NOTES
-- ════════════════════════════════════════════════════════════
-- MySQL 8.0 does not have native row-level security policies (unlike PostgreSQL).
-- We enforce row-level restrictions via:
--   1. Views that leave out restricted columns and expose the row owner
--      (Student_Project_View.student_id, PI_Dashboard_View.pi_id)
--   2. The API role guard (server/index.js): the signed session token gives
--      the caller's id, and every query adds WHERE pi_id = ? or student_id = ?
--
-- The API uses one pooled service account, so these GRANTs apply to direct
-- database clients (admin_user, pi_user, grant_officer_user, student_user).
-- The role guard mirrors them for requests that arrive through the API.

-- ============================================================
--  END: schema/04_rbac.sql
--  Next: schema/05_stored_procs_events.sql
-- ============================================================
