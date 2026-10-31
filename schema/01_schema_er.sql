-- ============================================================
--  UniGrant — Schema & ER Modeling
--  Owner: Lakshya Sachdeva
-- ============================================================
--  Responsibilities:
--    • Design ER diagram (entities, relationships, cardinalities)
--    • Define all CREATE TABLE statements with constraints
--    • Enforce referential integrity via FOREIGN KEY declarations
--    • Model weak entities (Dependent, Equipment, PublicationAuthor)
--    • Document ER design decisions in comments
-- ============================================================

CREATE DATABASE IF NOT EXISTS unigrant
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE unigrant;

-- ════════════════════════════════════════════════════════════
--  STRONG ENTITY TABLES
--  Each table represents a distinct real-world entity.
--  Primary keys are surrogate auto-increment integers unless
--  noted (Equipment uses a domain key).
-- ════════════════════════════════════════════════════════════

-- ── Department ───────────────────────────────────────────────
-- ER: Strong entity. One-to-many with User (dept_id FK).
-- Cardinality: Department ||—< User (one dept, many users)
CREATE TABLE Department (
  dept_id          INT            NOT NULL AUTO_INCREMENT,
  dept_name        VARCHAR(120)   NOT NULL,
  location         VARCHAR(200),
  annual_budget    DECIMAL(15,2)  NOT NULL DEFAULT 0,
  established_date DATE,
  PRIMARY KEY (dept_id)
);

-- ── User ─────────────────────────────────────────────────────
-- ER: Strong entity with ISA specialisation hierarchy:
--     User → {Admin, PI, Student, Grant_Officer}
-- Implemented as single-table inheritance via role ENUM.
-- specialization column is FULLTEXT-indexed for AI matching.
CREATE TABLE User (
  user_id          INT            NOT NULL AUTO_INCREMENT,
  ssn              VARCHAR(20)    UNIQUE,
  first_name       VARCHAR(60)    NOT NULL,
  middle_initial   CHAR(1),
  last_name        VARCHAR(60)    NOT NULL,
  email            VARCHAR(150)   NOT NULL UNIQUE,
  password_hash    VARCHAR(256)   NOT NULL,              -- SHA-256 stored
  role             ENUM('Admin','PI','Student','Grant_Officer') NOT NULL,
  phone            VARCHAR(20),
  address          TEXT,
  date_of_birth    DATE,
  hire_date        DATE,
  specialization   TEXT,                                 -- FULLTEXT indexed
  dept_id          INT,
  PRIMARY KEY (user_id),
  FOREIGN KEY (dept_id) REFERENCES Department(dept_id) ON DELETE SET NULL,
  CONSTRAINT chk_user_role CHECK (role IN ('Admin','PI','Student','Grant_Officer'))
);

-- ── FundingAgency ─────────────────────────────────────────────
-- ER: Strong entity. One-to-many with ExternalCall.
-- Cardinality: FundingAgency ||—< ExternalCall
CREATE TABLE FundingAgency (
  agency_id          INT           NOT NULL AUTO_INCREMENT,
  agency_name        VARCHAR(200)  NOT NULL,
  contact_person     VARCHAR(120),
  email              VARCHAR(150),
  phone              VARCHAR(20),
  address            TEXT,
  website            VARCHAR(300),
  funding_focus_areas TEXT,
  PRIMARY KEY (agency_id)
);

-- ── ExternalCall ──────────────────────────────────────────────
-- ER: Strong entity linked to FundingAgency.
-- Cardinality: FundingAgency ||—< ExternalCall (cascade delete)
CREATE TABLE ExternalCall (
  call_id             INT           NOT NULL AUTO_INCREMENT,
  title               VARCHAR(300)  NOT NULL,
  description         TEXT,
  eligibility_criteria TEXT,
  deadline            DATE          NOT NULL,
  max_budget          DECIMAL(15,2),
  agency_id           INT           NOT NULL,
  PRIMARY KEY (call_id),
  FOREIGN KEY (agency_id) REFERENCES FundingAgency(agency_id) ON DELETE CASCADE
);

-- ── Proposal ──────────────────────────────────────────────────
-- ER: Strong entity. Many-to-one with User (PI).
-- Status ENUM models the proposal lifecycle state machine.
-- Cardinality: User(PI) ||—< Proposal
CREATE TABLE Proposal (
  proposal_id              INT            NOT NULL AUTO_INCREMENT,
  title                    VARCHAR(300)   NOT NULL,
  abstract                 TEXT,
  total_budget_requested   DECIMAL(15,2)  NOT NULL,
  duration_months          TINYINT        NOT NULL,
  submission_date          DATE,
  status                   ENUM('Draft','Submitted','Under Review','Approved','Rejected')
                           NOT NULL DEFAULT 'Draft',
  eligibility_check_passed BOOLEAN        DEFAULT FALSE,
  pi_id                    INT            NOT NULL,
  PRIMARY KEY (proposal_id),
  FOREIGN KEY (pi_id) REFERENCES User(user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_proposal_budget   CHECK (total_budget_requested > 0),
  CONSTRAINT chk_proposal_duration CHECK (duration_months > 0)
);

-- ── Grant_ ────────────────────────────────────────────────────
-- ER: Strong entity. One-to-one with Proposal (approved proposals
-- become grants). One-to-many with Project.
-- Note: named Grant_ because GRANT is a reserved SQL keyword.
CREATE TABLE Grant_ (
  grant_id             INT            NOT NULL AUTO_INCREMENT,
  grant_title          VARCHAR(300)   NOT NULL,
  total_amount_awarded DECIMAL(15,2)  NOT NULL,
  start_date           DATE           NOT NULL,
  end_date             DATE           NOT NULL,
  status               ENUM('Active','Closed','Suspended') NOT NULL DEFAULT 'Active',
  funding_agency       VARCHAR(200),
  agency_contact_info  VARCHAR(300),
  reporting_frequency  ENUM('Monthly','Quarterly','Biannual','Annual'),
  proposal_id          INT,
  PRIMARY KEY (grant_id),
  UNIQUE KEY uq_grant_proposal (proposal_id),            -- makes "becomes" 1:1 (NULLs allowed)
  FOREIGN KEY (proposal_id) REFERENCES Proposal(proposal_id) ON DELETE SET NULL,
  CONSTRAINT chk_grant_dates  CHECK (end_date > start_date),
  CONSTRAINT chk_grant_amount CHECK (total_amount_awarded > 0)
);

-- ── Project ───────────────────────────────────────────────────
-- ER: Strong entity. Central hub entity connected to:
--     Grant_ (funding), Department (ownership), User (PI),
--     BudgetHead, Milestone, Expense, ResearchOutput (children).
CREATE TABLE Project (
  project_id      INT           NOT NULL AUTO_INCREMENT,
  project_title   VARCHAR(300)  NOT NULL,
  description     TEXT,
  start_date      DATE          NOT NULL,
  end_date        DATE          NOT NULL,
  status          ENUM('Planning','Active','On Hold','Completed','Closed')
                  NOT NULL DEFAULT 'Planning',
  current_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  department_id   INT,
  grant_id        INT,
  pi_id           INT           NOT NULL,
  PRIMARY KEY (project_id),
  FOREIGN KEY (department_id) REFERENCES Department(dept_id) ON DELETE SET NULL,
  FOREIGN KEY (grant_id)      REFERENCES Grant_(grant_id)    ON DELETE SET NULL,
  FOREIGN KEY (pi_id)         REFERENCES User(user_id)       ON DELETE RESTRICT,
  CONSTRAINT chk_project_dates   CHECK (end_date > start_date),
  CONSTRAINT chk_project_balance CHECK (current_balance >= 0)
);

-- ── BudgetHead ────────────────────────────────────────────────
-- ER: Weak entity dependent on Project.
-- remaining_balance is a GENERATED (computed) column — avoids anomalies.
-- Cardinality: Project ||—< BudgetHead (cascade delete)
CREATE TABLE BudgetHead (
  budgethead_id     INT           NOT NULL AUTO_INCREMENT,
  project_id        INT           NOT NULL,
  category          ENUM('Equipment','Travel','Manpower','Consumables','Other') NOT NULL,
  allocated_amount  DECIMAL(15,2) NOT NULL,
  spent_amount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  remaining_balance DECIMAL(15,2) GENERATED ALWAYS AS (allocated_amount - spent_amount) STORED,
  fiscal_year       YEAR,
  PRIMARY KEY (budgethead_id),
  FOREIGN KEY (project_id) REFERENCES Project(project_id) ON DELETE CASCADE,
  -- spent <= allocated is the last line of defence for BR1: two pending
  -- expenses can each pass the insert trigger and still overspend together.
  CONSTRAINT chk_budget_amounts CHECK (allocated_amount > 0 AND spent_amount >= 0
                                       AND spent_amount <= allocated_amount)
);

-- ── Expense ───────────────────────────────────────────────────
-- ER: Strong entity. Many-to-one with BudgetHead and Project.
-- approved_by FK references User (Grant Officer / Admin).
CREATE TABLE Expense (
  expense_id        INT            NOT NULL AUTO_INCREMENT,
  amount            DECIMAL(15,2)  NOT NULL,
  date              DATE           NOT NULL,
  description       VARCHAR(500),
  receipt_reference VARCHAR(100),
  status            ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  budgethead_id     INT            NOT NULL,
  project_id        INT            NOT NULL,
  approval_date     DATE,
  approved_by       INT,
  PRIMARY KEY (expense_id),
  FOREIGN KEY (budgethead_id) REFERENCES BudgetHead(budgethead_id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id)    REFERENCES Project(project_id)       ON DELETE CASCADE,
  FOREIGN KEY (approved_by)   REFERENCES User(user_id)             ON DELETE SET NULL,
  CONSTRAINT chk_expense_amount CHECK (amount > 0)
);

-- ── Milestone ─────────────────────────────────────────────────
-- ER: Weak entity dependent on Project.
-- Used by milestone_30day_alert scheduled event.
CREATE TABLE Milestone (
  milestone_id            INT           NOT NULL AUTO_INCREMENT,
  project_id              INT           NOT NULL,
  title                   VARCHAR(200)  NOT NULL,
  due_date                DATE          NOT NULL,
  completion_date         DATE,
  deliverable_description TEXT,
  status                  ENUM('Pending','Completed','Delayed') NOT NULL DEFAULT 'Pending',
  report_submitted        BOOLEAN       DEFAULT FALSE,
  priority                ENUM('High','Medium','Low') NOT NULL DEFAULT 'Medium',
  PRIMARY KEY (milestone_id),
  FOREIGN KEY (project_id) REFERENCES Project(project_id) ON DELETE CASCADE
);

-- ── ResearchOutput ────────────────────────────────────────────
-- ER: Strong entity linked to Project. Also linked to User via
--     PublicationAuthor (M:N relationship table below).
CREATE TABLE ResearchOutput (
  output_id           INT           NOT NULL AUTO_INCREMENT,
  project_id          INT           NOT NULL,
  type                ENUM('Publication','Patent','Prototype','Report') NOT NULL,
  title               VARCHAR(400)  NOT NULL,
  authors             TEXT,
  publication_date    DATE,
  journal_conference  VARCHAR(300),
  doi                 VARCHAR(200),
  status              ENUM('Submitted','Accepted','Published') NOT NULL DEFAULT 'Submitted',
  PRIMARY KEY (output_id),
  FOREIGN KEY (project_id) REFERENCES Project(project_id) ON DELETE CASCADE
);

-- ── Notification ──────────────────────────────────────────────
-- ER: Weak entity. Output table for triggers & scheduled events.
CREATE TABLE Notification (
  notif_id INT       NOT NULL AUTO_INCREMENT,
  user_id  INT       NOT NULL,
  message  TEXT      NOT NULL,
  is_read  BOOLEAN   DEFAULT FALSE,
  sent_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notif_id),
  FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

-- ════════════════════════════════════════════════════════════
--  WEAK ENTITIES (partial key + owner entity)
-- ════════════════════════════════════════════════════════════

-- ── Dependent ────────────────────────────────────────────────
-- ER: Weak entity. PK = (user_id, dependent_name).
-- Existence depends on parent User (cascade delete).
CREATE TABLE Dependent (
  user_id        INT          NOT NULL,
  dependent_name VARCHAR(120) NOT NULL,
  relationship   ENUM('Spouse','Child','Parent') NOT NULL,
  date_of_birth  DATE,
  phone          VARCHAR(20),
  PRIMARY KEY (user_id, dependent_name),
  FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

-- ── PublicationAuthor ─────────────────────────────────────────
-- ER: Associative (bridge) entity for M:N between ResearchOutput and User.
-- author_position captures first/second/corresponding author ordering.
CREATE TABLE PublicationAuthor (
  output_id                INT          NOT NULL,
  user_id                  INT          NOT NULL,
  author_position          TINYINT      NOT NULL,
  contribution_description TEXT,
  PRIMARY KEY (output_id, user_id),
  FOREIGN KEY (output_id) REFERENCES ResearchOutput(output_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES User(user_id)             ON DELETE CASCADE
);

-- ── Equipment ─────────────────────────────────────────────────
-- ER: Weak entity dependent on Expense.
-- PK = (equipment_id, expense_id) — domain composite key.
CREATE TABLE Equipment (
  equipment_id   VARCHAR(50)  NOT NULL,
  expense_id     INT          NOT NULL,
  equipment_name VARCHAR(200) NOT NULL,
  serial_number  VARCHAR(100),
  warranty_until DATE,
  location       VARCHAR(200),
  PRIMARY KEY (equipment_id, expense_id),
  FOREIGN KEY (expense_id) REFERENCES Expense(expense_id) ON DELETE CASCADE
);

-- ════════════════════════════════════════════════════════════
--  RELATIONSHIP TABLES (M:N associations)
-- ════════════════════════════════════════════════════════════

-- ── WORKS_ON (User ↔ Project) ─────────────────────────────────
-- ER: M:N between User and Project with descriptive attributes.
-- Cardinality: User }—{ Project
CREATE TABLE WORKS_ON (
  user_id         INT NOT NULL,
  project_id      INT NOT NULL,
  role_in_project ENUM('Lead Researcher','Team Member','Research Assistant') NOT NULL,
  hours_per_week  TINYINT,
  stipend_amount  DECIMAL(12,2) DEFAULT 0,
  PRIMARY KEY (user_id, project_id),
  FOREIGN KEY (user_id)    REFERENCES User(user_id)       ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES Project(project_id) ON DELETE CASCADE
);

-- ── SUPERVISES (User ↔ User — self-referential) ───────────────
-- ER: Recursive (unary) relationship on User entity.
-- Prevents self-supervision via CHECK constraint.
CREATE TABLE SUPERVISES (
  supervisor_id     INT         NOT NULL,
  supervisee_id     INT         NOT NULL,
  relationship_type ENUM('PhD Advisor','Mentor','Co-Supervisor') NOT NULL,
  start_date        DATE,
  PRIMARY KEY (supervisor_id, supervisee_id),
  FOREIGN KEY (supervisor_id) REFERENCES User(user_id) ON DELETE CASCADE,
  FOREIGN KEY (supervisee_id) REFERENCES User(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_no_self_supervise CHECK (supervisor_id != supervisee_id)
);

-- ── MATCHES (ExternalCall ↔ User — AI results) ────────────────
-- ER: M:N relationship storing AI grant-matching computed scores.
-- match_score: 0–100 tinyint — corresponds to cosine similarity %.
CREATE TABLE MATCHES (
  call_id           INT            NOT NULL,
  user_id           INT            NOT NULL,
  match_score       TINYINT        NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  match_reason      TEXT,
  notification_sent BOOLEAN        DEFAULT FALSE,
  computed_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (call_id, user_id),
  FOREIGN KEY (call_id) REFERENCES ExternalCall(call_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES User(user_id)         ON DELETE CASCADE
);

-- ============================================================
--  END: schema/01_schema_er.sql
--  Next: schema/02_views_indexes.sql
-- ============================================================

-- Schema audited: all FK ON DELETE actions and CHECK constraints verified
