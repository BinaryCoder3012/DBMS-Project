-- ============================================================
--  UniGrant — Seed / Sample Data
--  Role 1: Database Schema & ER Modeling Engineer
-- ============================================================
--  Purpose: Populate the database with realistic sample data
--           to demonstrate all ER relationships and system features.
--  Note:    Run AFTER all schema files (01–05) have been executed.
-- ============================================================

USE unigrant;

-- ════════════════════════════════════════════════════════════
--  DEPARTMENTS
-- ════════════════════════════════════════════════════════════
INSERT INTO Department (dept_name, location, annual_budget, established_date) VALUES
  ('Electrical Engineering',   'Block A, Lab 101–104', 5000000.00, '1985-07-01'),
  ('Computer Science & AI',    'Block B, Lab 201–206', 4500000.00, '1990-01-01'),
  ('Finance & Administration', 'Admin Block, Floor 2', 2000000.00, '1985-07-01');

-- ════════════════════════════════════════════════════════════
--  USERS (password_hash = SHA2(plaintext, 256))
-- ════════════════════════════════════════════════════════════
INSERT INTO User
  (first_name, last_name, email, password_hash, role, dept_id, specialization, hire_date, phone) VALUES
  ('Priya',  'Sharma',  'priya@university.edu',  SHA2('admin123',   256), 'Admin',         3, 'Administration, Policy',                                                                         '2015-03-15', '+91-98765-43211'),
  ('Arjun',  'Mehta',   'arjun@university.edu',  SHA2('pi123',      256), 'PI',            1, 'Renewable Energy, Solar Photovoltaics, Grid Storage, Wind Energy',                              '2018-07-01', '+91-98765-43210'),
  ('Vikram', 'Singh',   'vikram@university.edu', SHA2('pi456',      256), 'PI',            2, 'Artificial Intelligence, Deep Learning, Computer Vision, NLP',                                  '2017-06-01', '+91-98765-43214'),
  ('Rahul',  'Verma',   'rahul@university.edu',  SHA2('student123', 256), 'Student',       1, 'Power Systems, MPPT Algorithms',                                                                '2022-08-01', '+91-98765-43212'),
  ('Anjali', 'Nair',    'anjali@university.edu', SHA2('student456', 256), 'Student',       2, 'Machine Learning, PyTorch',                                                                     '2023-08-01', '+91-98765-43215'),
  ('Sneha',  'Patel',   'sneha@university.edu',  SHA2('go123',      256), 'Grant_Officer', 3, 'Finance, Grant Compliance',                                                                     '2019-01-10', '+91-98765-43213');

-- ════════════════════════════════════════════════════════════
--  FUNDING AGENCIES
-- ════════════════════════════════════════════════════════════
INSERT INTO FundingAgency (agency_name, contact_person, email, website, funding_focus_areas) VALUES
  ('Dept. of Science & Technology', 'Dr. R. Kumar',  'grants@dst.gov.in',        'https://dst.gov.in',   'Science, Technology, Renewable Energy'),
  ('ICMR',                          'Dr. S. Rao',    'extramural@icmr.org.in',   'https://icmr.org.in',  'Medical Research, AI in Healthcare'),
  ('SERB',                          'Dr. P. Nair',   'grants@serb.gov.in',       'https://serb.gov.in',  'Basic Science, Engineering'),
  ('MeitY',                         'Dr. A. Gupta',  'grants@meity.gov.in',      'https://meity.gov.in', 'IT, AI, Quantum Computing'),
  ('ICAR',                          'Dr. M. Sharma', 'grants@icar.gov.in',       'https://icar.gov.in',  'Agriculture, Smart Farming, Precision Agriculture');

-- ════════════════════════════════════════════════════════════
--  EXTERNAL CALLS
-- ════════════════════════════════════════════════════════════
INSERT INTO ExternalCall (title, description, deadline, max_budget, agency_id) VALUES
  ('DST Solar Mission 2025 – Phase II',   'Grid-scale solar storage and rural electrification; preference for hybrid systems.', '2025-03-31', 5000000.00, 1),
  ('BIRAC AI in Healthcare Grant',        'AI/ML in diagnostics and drug discovery.',                                          '2025-02-28', 3000000.00, 2),
  ('SERB National Science Fellowship',    'Fundamental research in renewable energy and materials science.',                    '2025-04-15', 2000000.00, 3),
  ('MeitY Quantum Computing Initiative', 'Quantum computing for optimisation and simulation.',                                  '2025-05-31', 4500000.00, 4),
  ('ICAR Smart Agriculture Grant',        'AI-driven precision agriculture and crop monitoring.',                               '2025-01-31', 1800000.00, 5);

-- ════════════════════════════════════════════════════════════
--  PROPOSALS
-- ════════════════════════════════════════════════════════════
