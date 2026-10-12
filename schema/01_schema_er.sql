-- ============================================================
--  UniGrant — Schema & ER Modeling
--  Role 1: Database Schema & ER Modeling Engineer
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
  specialization   TEXT,                                 -- FULLTEXT indexed (Role 2)
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

