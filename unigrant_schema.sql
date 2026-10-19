-- ============================================================
--  UniGrant — Complete SQL Schema
--  Research Grant Management System
--  MySQL 8.0+ / MariaDB 10.6+
-- ============================================================

CREATE DATABASE IF NOT EXISTS unigrant
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE unigrant;

-- ────────────────────────────────────────────────────────────
--  ENTITY TABLES
-- ────────────────────────────────────────────────────────────

CREATE TABLE Department (
  dept_id          INT            NOT NULL AUTO_INCREMENT,
  dept_name        VARCHAR(120)   NOT NULL,
  location         VARCHAR(200),
  annual_budget    DECIMAL(15,2)  NOT NULL DEFAULT 0,
  established_date DATE,
  PRIMARY KEY (dept_id)
);

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
  specialization   TEXT,                                 -- Full-text indexed for AI matching
  dept_id          INT,
  PRIMARY KEY (user_id),
  FOREIGN KEY (dept_id) REFERENCES Department(dept_id) ON DELETE SET NULL,
  CONSTRAINT chk_user_role CHECK (role IN ('Admin','PI','Student','Grant_Officer'))
);

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
  CONSTRAINT chk_proposal_budget CHECK (total_budget_requested > 0),
  CONSTRAINT chk_proposal_duration CHECK (duration_months > 0)
);

CREATE TABLE Grant_ (                                    -- 'Grant' is reserved in some SQL dialects
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
  CONSTRAINT chk_grant_dates CHECK (end_date > start_date),
  CONSTRAINT chk_grant_amount CHECK (total_amount_awarded > 0)
);

CREATE TABLE Project (
  project_id     INT           NOT NULL AUTO_INCREMENT,
  project_title  VARCHAR(300)  NOT NULL,
  description    TEXT,
  start_date     DATE          NOT NULL,
  end_date       DATE          NOT NULL,
  status         ENUM('Planning','Active','On Hold','Completed','Closed')
                 NOT NULL DEFAULT 'Planning',
  current_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  department_id  INT,
  grant_id       INT,
  pi_id          INT           NOT NULL,
  PRIMARY KEY (project_id),
  FOREIGN KEY (department_id) REFERENCES Department(dept_id) ON DELETE SET NULL,
  FOREIGN KEY (grant_id)      REFERENCES Grant_(grant_id) ON DELETE SET NULL,
  FOREIGN KEY (pi_id)         REFERENCES User(user_id) ON DELETE RESTRICT,
  CONSTRAINT chk_project_dates CHECK (end_date > start_date),
  CONSTRAINT chk_project_balance CHECK (current_balance >= 0)
);

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
  CONSTRAINT chk_budget_amounts CHECK (allocated_amount > 0 AND spent_amount >= 0)
);

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
  FOREIGN KEY (project_id)    REFERENCES Project(project_id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by)   REFERENCES User(user_id) ON DELETE SET NULL,
  CONSTRAINT chk_expense_amount CHECK (amount > 0)
);

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

-- ────────────────────────────────────────────────────────────
--  WEAK ENTITIES
-- ────────────────────────────────────────────────────────────

CREATE TABLE Dependent (
  user_id          INT          NOT NULL,
  dependent_name   VARCHAR(120) NOT NULL,
  relationship     ENUM('Spouse','Child','Parent') NOT NULL,
  date_of_birth    DATE,
  phone            VARCHAR(20),
  PRIMARY KEY (user_id, dependent_name),
  FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

CREATE TABLE PublicationAuthor (
  output_id                INT          NOT NULL,
  user_id                  INT          NOT NULL,
  author_position          TINYINT      NOT NULL,
  contribution_description TEXT,
  PRIMARY KEY (output_id, user_id),
  FOREIGN KEY (output_id) REFERENCES ResearchOutput(output_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES User(user_id) ON DELETE CASCADE
);

CREATE TABLE Equipment (
  equipment_id  VARCHAR(50) NOT NULL,
  expense_id    INT         NOT NULL,
  equipment_name VARCHAR(200) NOT NULL,
  serial_number  VARCHAR(100),
  warranty_until DATE,
  location       VARCHAR(200),
  PRIMARY KEY (equipment_id, expense_id),
  FOREIGN KEY (expense_id) REFERENCES Expense(expense_id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
--  RELATIONSHIP TABLES
-- ────────────────────────────────────────────────────────────

-- WORKS_ON (User ↔ Project)
CREATE TABLE WORKS_ON (
  user_id          INT NOT NULL,
  project_id       INT NOT NULL,
  role_in_project  ENUM('Lead Researcher','Team Member','Research Assistant') NOT NULL,
  hours_per_week   TINYINT,
  stipend_amount   DECIMAL(12,2) DEFAULT 0,
  PRIMARY KEY (user_id, project_id),
  FOREIGN KEY (user_id)    REFERENCES User(user_id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES Project(project_id) ON DELETE CASCADE
);

-- SUPERVISES (User ↔ User — self-referential)
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

-- MATCHES (ExternalCall ↔ User — AI matching results)
CREATE TABLE MATCHES (
  call_id           INT            NOT NULL,
  user_id           INT            NOT NULL,
  match_score       TINYINT        NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  match_reason      TEXT,
  notification_sent BOOLEAN        DEFAULT FALSE,
  computed_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (call_id, user_id),
  FOREIGN KEY (call_id) REFERENCES ExternalCall(call_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
--  NOTIFICATIONS (trigger output)
-- ────────────────────────────────────────────────────────────

CREATE TABLE Notification (
  notif_id    INT          NOT NULL AUTO_INCREMENT,
  user_id     INT          NOT NULL,
  message     TEXT         NOT NULL,
  is_read     BOOLEAN      DEFAULT FALSE,
  sent_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notif_id),
  FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
--  VIEWS
-- ────────────────────────────────────────────────────────────

-- ① Public — hides all financial data
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
JOIN User       u ON p.pi_id        = u.user_id
JOIN Department d ON p.department_id = d.dept_id
JOIN Grant_     g ON p.grant_id      = g.grant_id;
-- HIDDEN: current_balance, stipend_amount, salary, budget details

-- ② PI dashboard — personalised, current user only
CREATE OR REPLACE VIEW PI_Dashboard_View AS
SELECT
  p.project_id,
  p.project_title,
  p.current_balance,
  COUNT(CASE WHEN m.status = 'Pending' THEN 1 END)               AS pending_milestones,
  ROUND(SUM(bh.spent_amount) / SUM(bh.allocated_amount) * 100, 1) AS budget_utilisation_pct,
  COUNT(DISTINCT wo.user_id)                                      AS team_size,
  g.funding_agency
FROM Project p
JOIN Milestone  m  ON p.project_id = m.project_id
JOIN BudgetHead bh ON p.project_id = bh.project_id
JOIN WORKS_ON   wo ON p.project_id = wo.project_id
JOIN Grant_     g  ON p.grant_id   = g.grant_id
WHERE p.pi_id = (SELECT user_id FROM User WHERE email = CURRENT_USER())
GROUP BY p.project_id;

-- ③ Admin analytics — aggregated cross-department
CREATE OR REPLACE VIEW Admin_Analytics_View AS
SELECT
  d.dept_id,
  d.dept_name,
  SUM(g.total_amount_awarded)                                          AS total_funding,
  COUNT(DISTINCT p.project_id)                                        AS total_projects,
  SUM(CASE WHEN p.status = 'Active'       THEN 1 ELSE 0 END)         AS active_projects,
  COUNT(DISTINCT ro.output_id)                                        AS total_research_outputs,
  SUM(CASE WHEN ro.type  = 'Publication'  THEN 1 ELSE 0 END)         AS publications,
  SUM(CASE WHEN ro.type  = 'Patent'       THEN 1 ELSE 0 END)         AS patents,
  COUNT(DISTINCT CASE WHEN u.role = 'Student' THEN u.user_id END)    AS students_supported
FROM Department d
LEFT JOIN Project        p  ON d.dept_id    = p.department_id
LEFT JOIN Grant_         g  ON p.grant_id   = g.grant_id
LEFT JOIN ResearchOutput ro ON p.project_id = ro.project_id
LEFT JOIN WORKS_ON       wo ON p.project_id = wo.project_id
LEFT JOIN User           u  ON wo.user_id   = u.user_id
GROUP BY d.dept_id, d.dept_name;

-- ────────────────────────────────────────────────────────────
--  TRIGGERS
-- ────────────────────────────────────────────────────────────

DELIMITER //

-- T1: Auto-close project when end_date passes
CREATE TRIGGER auto_close_project
AFTER UPDATE ON Project
FOR EACH ROW
BEGIN
  IF CURDATE() > NEW.end_date AND NEW.status = 'Active' THEN
    UPDATE Project SET status = 'Closed'
    WHERE project_id = NEW.project_id;
  END IF;
END //

-- T2: Balance check before expense insert (prevents overspend)
CREATE TRIGGER balance_check_before_expense
BEFORE INSERT ON Expense
FOR EACH ROW
BEGIN
  DECLARE avail DECIMAL(15,2);
  SELECT remaining_balance INTO avail
  FROM BudgetHead WHERE budgethead_id = NEW.budgethead_id;
  IF NEW.amount > avail THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ERR-BH001: Expense amount exceeds remaining balance in this budget head';
  END IF;
END //

-- T3: Active project limit per PI (max 5)
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

-- T4: Update BudgetHead when expense is approved
CREATE TRIGGER update_budget_on_approval
AFTER UPDATE ON Expense
FOR EACH ROW
BEGIN
  IF NEW.status = 'Approved' AND OLD.status = 'Pending' THEN
    UPDATE BudgetHead
    SET spent_amount = spent_amount + NEW.amount
    WHERE budgethead_id = NEW.budgethead_id;
  END IF;
  IF NEW.status = 'Rejected' AND OLD.status = 'Approved' THEN
    UPDATE BudgetHead
    SET spent_amount = spent_amount - NEW.amount
    WHERE budgethead_id = NEW.budgethead_id;
  END IF;
END //

DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  SCHEDULED EVENT — Milestone Alert (30-day warning)
-- ────────────────────────────────────────────────────────────

CREATE EVENT milestone_30day_alert
ON SCHEDULE EVERY 1 DAY
STARTS CURDATE()
DO
  INSERT INTO Notification(user_id, message, sent_at)
  SELECT p.pi_id,
    CONCAT('⚠ Milestone due in 30 days: "', m.title,
           '" for project: ', p.project_title,
           ' — Deliverable: ', m.deliverable_description),
    NOW()
  FROM Milestone m
  JOIN Project p ON m.project_id = p.project_id
  WHERE m.status    = 'Pending'
    AND m.due_date  = DATE_ADD(CURDATE(), INTERVAL 30 DAY);

-- ────────────────────────────────────────────────────────────
--  STORED PROCEDURE — Annual Department Report
-- ────────────────────────────────────────────────────────────

DELIMITER //

CREATE PROCEDURE generate_annual_report(IN p_dept_id INT)
BEGIN
  DECLARE dept_exists INT DEFAULT 0;
  SELECT COUNT(*) INTO dept_exists FROM Department WHERE dept_id = p_dept_id;
  IF dept_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Department not found';
  END IF;

  SELECT
    d.dept_name,
    YEAR(CURDATE())                                                      AS report_year,
    IFNULL(SUM(g.total_amount_awarded), 0)                              AS total_funds_received,
    COUNT(DISTINCT p.project_id)                                        AS total_projects,
    SUM(CASE WHEN p.status = 'Active'    THEN 1 ELSE 0 END)            AS active_projects,
    SUM(CASE WHEN p.status = 'Completed' THEN 1 ELSE 0 END)            AS completed_projects,
    IFNULL(COUNT(DISTINCT ro.output_id), 0)                            AS total_research_outputs,
    SUM(CASE WHEN ro.type = 'Publication' THEN 1 ELSE 0 END)           AS publications,
    SUM(CASE WHEN ro.type = 'Patent'      THEN 1 ELSE 0 END)           AS patents,
    COUNT(DISTINCT CASE WHEN u.role = 'Student' THEN u.user_id END)    AS students_supported,
    IFNULL(SUM(e.amount), 0)                                           AS total_expenditure,
    ROUND(
      IFNULL(SUM(e.amount), 0) /
      NULLIF(SUM(g.total_amount_awarded), 0) * 100, 2
    )                                                                   AS budget_utilisation_pct
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

DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  ROLE-BASED ACCESS CONTROL (DBA)
-- ────────────────────────────────────────────────────────────

-- Create application-level roles
CREATE ROLE IF NOT EXISTS admin_role;
CREATE ROLE IF NOT EXISTS pi_role;
CREATE ROLE IF NOT EXISTS grant_officer_role;
CREATE ROLE IF NOT EXISTS student_role;

-- ① ADMIN — full DBA
GRANT ALL PRIVILEGES ON unigrant.* TO admin_role WITH GRANT OPTION;
GRANT CREATE USER ON *.* TO admin_role;

-- ② PI — read/write on own objects; no user management
GRANT SELECT, INSERT, UPDATE ON unigrant.Proposal       TO pi_role;
GRANT SELECT, INSERT, UPDATE ON unigrant.Expense        TO pi_role;
GRANT SELECT, INSERT         ON unigrant.ResearchOutput TO pi_role;
GRANT SELECT, INSERT, UPDATE ON unigrant.Milestone      TO pi_role;
GRANT SELECT                 ON unigrant.Project        TO pi_role;
GRANT SELECT                 ON unigrant.BudgetHead     TO pi_role;
GRANT SELECT                 ON unigrant.Grant_         TO pi_role;
-- Row-level security via application layer or MySQL policy

-- ③ GRANT OFFICER — view proposals, approve expenses, NO user creation
GRANT SELECT                 ON unigrant.Proposal       TO grant_officer_role;
GRANT SELECT, UPDATE         ON unigrant.Expense        TO grant_officer_role;
GRANT SELECT                 ON unigrant.Grant_         TO grant_officer_role;
GRANT SELECT                 ON unigrant.Project        TO grant_officer_role;
REVOKE CREATE USER ON *.* FROM grant_officer_role;   -- explicitly blocked

-- ④ STUDENT — view-only via restricted views + row-level security
GRANT SELECT ON unigrant.Public_Project_View TO student_role;
-- Row-level security: student sees only their WORKS_ON projects
CREATE OR REPLACE VIEW Student_Project_View AS
  SELECT p.* FROM Project p
  JOIN WORKS_ON wo ON p.project_id = wo.project_id
  WHERE wo.user_id = (SELECT user_id FROM User WHERE email = CURRENT_USER());
GRANT SELECT ON unigrant.Student_Project_View TO student_role;

-- Create sample database users and assign roles
CREATE USER IF NOT EXISTS 'admin_user'@'%'         IDENTIFIED BY 'AdminPass!1';
CREATE USER IF NOT EXISTS 'pi_user'@'%'            IDENTIFIED BY 'PIPass!1';
CREATE USER IF NOT EXISTS 'grant_officer_user'@'%' IDENTIFIED BY 'GOPass!1';
CREATE USER IF NOT EXISTS 'student_user'@'%'       IDENTIFIED BY 'StudPass!1';

GRANT admin_role        TO 'admin_user'@'%';
GRANT pi_role           TO 'pi_user'@'%';
GRANT grant_officer_role TO 'grant_officer_user'@'%';
GRANT student_role      TO 'student_user'@'%';

SET DEFAULT ROLE ALL TO
  'admin_user'@'%', 'pi_user'@'%',
  'grant_officer_user'@'%', 'student_user'@'%';

-- ────────────────────────────────────────────────────────────
--  INDEXES
-- ────────────────────────────────────────────────────────────

-- Primary keys are clustered by default in InnoDB

-- Non-clustered composite index — project search & filter
CREATE INDEX IDX_Project_Title_Status ON Project(project_title, status);

-- User name lookup
CREATE INDEX IDX_User_Name ON User(last_name, first_name);

-- Expense date + project query (dashboard timelines)
CREATE INDEX IDX_Expense_Date_Project ON Expense(date, project_id);

-- Full-text: AI semantic search on proposals
CREATE FULLTEXT INDEX FT_Proposal ON Proposal(abstract, title);

-- Full-text: AI grant matching on researcher profile
CREATE FULLTEXT INDEX FT_User_Specialization ON User(specialization);

-- Partition Project by start year (time-series analytics)
-- Note: Must be defined at table creation in MySQL; shown here for reference.
-- ALTER TABLE Project PARTITION BY RANGE (YEAR(start_date)) (
--   PARTITION p2022 VALUES LESS THAN (2023),
--   PARTITION p2023 VALUES LESS THAN (2024),
--   PARTITION p2024 VALUES LESS THAN (2025),
--   PARTITION p2025 VALUES LESS THAN (2026),
--   PARTITION pFuture VALUES LESS THAN MAXVALUE
-- );

-- ────────────────────────────────────────────────────────────
--  SEED DATA
-- ────────────────────────────────────────────────────────────

INSERT INTO Department (dept_name, location, annual_budget, established_date) VALUES
  ('Electrical Engineering', 'Block A, Lab 101–104', 5000000, '1985-07-01'),
  ('Computer Science & AI',  'Block B, Lab 201–206', 4500000, '1990-01-01'),
  ('Finance & Administration','Admin Block, Floor 2', 2000000, '1985-07-01');

INSERT INTO User (first_name, last_name, email, password_hash, role, dept_id, specialization, hire_date) VALUES
  ('Priya',  'Sharma', 'priya@university.edu', SHA2('admin123',256), 'Admin',        3, 'Administration', '2015-03-15'),
  ('Arjun',  'Mehta',  'arjun@university.edu', SHA2('pi123',256),    'PI',           1, 'Renewable Energy, Solar Photovoltaics, Grid Storage, Wind Energy', '2018-07-01'),
  ('Vikram', 'Singh',  'vikram@university.edu',SHA2('pi456',256),    'PI',           2, 'Artificial Intelligence, Deep Learning, Computer Vision, NLP', '2017-06-01'),
  ('Rahul',  'Verma',  'rahul@university.edu', SHA2('student123',256),'Student',     1, 'Power Systems, MPPT Algorithms', '2022-08-01'),
  ('Anjali', 'Nair',   'anjali@university.edu',SHA2('student456',256),'Student',     2, 'Machine Learning, PyTorch', '2023-08-01'),
  ('Sneha',  'Patel',  'sneha@university.edu', SHA2('go123',256),    'Grant_Officer',3, 'Finance, Grant Compliance', '2019-01-10');

INSERT INTO FundingAgency (agency_name, contact_person, email, website, funding_focus_areas) VALUES
  ('Dept. of Science & Technology', 'Dr. R. Kumar', 'grants@dst.gov.in', 'https://dst.gov.in', 'Science, Technology, Renewable Energy'),
  ('ICMR',                          'Dr. S. Rao',   'extramural@icmr.org.in', 'https://icmr.org.in', 'Medical Research, AI in Healthcare'),
  ('SERB',                          'Dr. P. Nair',  'grants@serb.gov.in', 'https://serb.gov.in', 'Basic Science, Engineering'),
  ('MeitY',                         'Dr. A. Gupta', 'grants@meity.gov.in','https://meity.gov.in','IT, AI, Quantum Computing');

INSERT INTO ExternalCall (title, description, deadline, max_budget, agency_id) VALUES
  ('DST Solar Mission 2025 — Phase II', 'Grid-scale solar storage and rural electrification.', '2025-03-31', 5000000, 1),
  ('BIRAC AI in Healthcare Grant',      'AI/ML in diagnostics and drug discovery.',           '2025-02-28', 3000000, 2),
  ('SERB National Science Fellowship',  'Fundamental research in renewable energy.',           '2025-04-15', 2000000, 3),
  ('MeitY Quantum Computing Initiative','Quantum computing for optimisation and simulation.',  '2025-05-31', 4500000, 4);

-- Example query — AI semantic search
-- SELECT * FROM User WHERE MATCH(specialization) AGAINST ('renewable energy solar' IN NATURAL LANGUAGE MODE);

-- Example query — Expense approval with ACID transaction
-- START TRANSACTION;
-- UPDATE Expense SET status='Approved', approved_by=1, approval_date=NOW() WHERE expense_id=3;
-- COMMIT;

-- ============================================================
--  END OF SCHEMA
-- ============================================================
