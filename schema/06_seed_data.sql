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
INSERT INTO Proposal
  (title, abstract, total_budget_requested, duration_months, submission_date, status, eligibility_check_passed, pi_id) VALUES
  ('Solar-Wind Hybrid Grid for Rural India',
   'This project deploys a 5 MW hybrid renewable energy grid combining solar PV with wind turbines in rural Rajasthan, focusing on storage optimisation and off-grid stability for 12 villages.',
   2500000.00, 24, '2024-01-15', 'Approved', TRUE, 2),

  ('AI-Driven Crop Disease Detection via UAV',
   'Deep learning models using CNNs to detect crop diseases from drone imagery, enabling early intervention for 10,000+ farmers across Maharashtra''s Vidarbha region.',
   1800000.00, 18, '2024-03-20', 'Under Review', TRUE, 3),

  ('Quantum Algorithms for Drug Discovery',
   'Leveraging variational quantum eigensolver algorithms to simulate molecular interactions for accelerated pharmaceutical research targeting oncology drug candidates.',
   3200000.00, 36, '2024-05-10', 'Draft', FALSE, 2),

  ('Federated Learning for Healthcare Privacy',
   'Training hospital-grade diagnostic models without sharing patient data across institutions, preserving HIPAA compliance while improving model accuracy.',
   2100000.00, 30, '2024-06-01', 'Submitted', TRUE, 3);

-- ════════════════════════════════════════════════════════════
--  GRANTS
-- ════════════════════════════════════════════════════════════
INSERT INTO Grant_
  (grant_title, total_amount_awarded, start_date, end_date, status, funding_agency, agency_contact_info, reporting_frequency, proposal_id) VALUES
  ('DST Solar Mission Grant 2024', 2500000.00, '2024-04-01', '2026-03-31', 'Active', 'Dept. of Science & Technology',      'grants@dst.gov.in',      'Quarterly', 1),
  ('ICMR AI in Healthcare 2022',   1200000.00, '2022-06-01', '2024-05-31', 'Closed', 'Indian Council of Medical Research', 'extramural@icmr.org.in', 'Biannual',  2);

-- ════════════════════════════════════════════════════════════
--  PROJECTS
-- ════════════════════════════════════════════════════════════
INSERT INTO Project
  (project_title, description, start_date, end_date, status, current_balance, department_id, grant_id, pi_id) VALUES
  ('Solar-Wind Hybrid Grid',   '5 MW hybrid renewable energy deployment across 12 villages in Rajasthan.', '2024-04-01', '2026-03-31', 'Active',    1820000.00, 1, 1, 2),
  ('AI Crop Disease Detector', 'CNN-based UAV imagery analysis for early crop disease detection.',          '2022-06-01', '2024-05-31', 'Completed', 48000.00,   2, 2, 3);

-- ════════════════════════════════════════════════════════════
--  BUDGET HEADS
-- ════════════════════════════════════════════════════════════
INSERT INTO BudgetHead (project_id, category, allocated_amount, spent_amount, fiscal_year) VALUES
  (1, 'Equipment',   1000000.00, 380000.00, 2024),
  (1, 'Travel',       300000.00,  95000.00, 2024),
  (1, 'Manpower',     800000.00, 240000.00, 2024),
  (1, 'Consumables',  400000.00, 165000.00, 2024),
  (2, 'Equipment',    600000.00, 597000.00, 2023),
  (2, 'Manpower',     600000.00, 555000.00, 2023);

-- ════════════════════════════════════════════════════════════
--  EXPENSES
-- ════════════════════════════════════════════════════════════
INSERT INTO Expense
  (project_id, budgethead_id, amount, date, description, receipt_reference, status, approved_by, approval_date) VALUES
  (1, 1, 280000.00, '2024-05-15', 'Solar panel procurement – 50 kW mono-PERC modules',             'RCP-2024-001', 'Approved', 6, '2024-05-20'),
  (1, 1, 100000.00, '2024-07-20', 'Wind turbine hub & blade assembly',                             'RCP-2024-002', 'Approved', 6, '2024-07-25'),
  (1, 2,  95000.00, '2024-08-10', 'Field visit – Rajasthan site survey (4 members, 7 days)',       'RCP-2024-003', 'Pending',  NULL, NULL),
  (1, 3, 240000.00, '2024-06-01', 'Research team stipends – Q1 2024–25',                           'RCP-2024-004', 'Approved', 6, '2024-06-03'),
  (1, 4, 165000.00, '2024-09-05', 'Battery cells, wiring & BMS components',                       'RCP-2024-005', 'Pending',  NULL, NULL);

-- ════════════════════════════════════════════════════════════
--  MILESTONES
-- ════════════════════════════════════════════════════════════
INSERT INTO Milestone
  (project_id, title, due_date, completion_date, deliverable_description, status, report_submitted, priority) VALUES
  (1, 'Site Survey & Foundation',    '2024-06-30', '2024-06-28', 'Geological survey and grid foundation work for 12 village sites',             'Completed', TRUE,  'High'),
  (1, 'Solar Array Installation',    '2024-11-30', NULL,         'Install and commission 50 kW solar array with MPPT controllers',              'Pending',   FALSE, 'High'),
  (1, 'Wind Turbine Erection',       '2025-03-31', NULL,         'Erect 3 × 1.5 MW turbines and run 30-day calibration',                       'Pending',   FALSE, 'Medium'),
  (1, 'Grid Integration & Live Test','2025-09-30', NULL,         'Connect hybrid system to rural grid and run 90-day performance test',          'Pending',   FALSE, 'High'),
  (2, 'Dataset Collection',          '2022-12-31', '2022-12-20', 'Collect 50,000 UAV images across wheat, rice, and cotton fields',             'Completed', TRUE,  'High'),
  (2, 'Model Training & Validation', '2023-09-30', '2023-09-25', 'Train ResNet-50 and EfficientNet-B4 models; validate at >92% accuracy',       'Completed', TRUE,  'High');

-- ════════════════════════════════════════════════════════════
--  RESEARCH OUTPUTS
-- ════════════════════════════════════════════════════════════
INSERT INTO ResearchOutput
  (project_id, type, title, authors, publication_date, journal_conference, doi, status) VALUES
  (1, 'Publication', 'Hybrid Renewable Microgrids: Optimal Scheduling for Rural Electrification',  'Mehta A., Kumar R., Iyer S.',  '2024-08-01', 'IEEE Transactions on Energy Conversion', '10.1109/TEC.2024.0012',   'Published'),
  (2, 'Publication', 'Multi-Scale CNN for Aerial Crop Disease Segmentation',                       'Singh V., Verma R., Nair A.',  '2024-01-15', 'Nature Food',                            '10.1038/nfood.2024.012', 'Published'),
  (2, 'Patent',      'Autonomous UAV Pathfinding System for Agricultural Monitoring',              'Singh V., Nair A.',            '2024-03-10', 'Indian Patent Office',                   'IN-PAT-2024-00418',      'Accepted');

-- ════════════════════════════════════════════════════════════
--  WORKS_ON (project team assignments)
-- ════════════════════════════════════════════════════════════
INSERT INTO WORKS_ON (user_id, project_id, role_in_project, hours_per_week, stipend_amount) VALUES
  (2, 1, 'Lead Researcher',    12, 0.00),
  (4, 1, 'Research Assistant', 20, 35000.00),
  (3, 2, 'Lead Researcher',    14, 0.00),
  (5, 2, 'Research Assistant', 25, 38000.00);

-- ════════════════════════════════════════════════════════════
--  SUPERVISES
-- ════════════════════════════════════════════════════════════
INSERT INTO SUPERVISES (supervisor_id, supervisee_id, relationship_type, start_date) VALUES
  (2, 4, 'PhD Advisor',  '2022-08-01'),
  (3, 5, 'PhD Advisor',  '2023-08-01');

-- ════════════════════════════════════════════════════════════
--  PUBLICATION AUTHORS (M:N linking researchers to publications)
-- ════════════════════════════════════════════════════════════
INSERT INTO PublicationAuthor (output_id, user_id, author_position, contribution_description) VALUES
  (1, 2, 1, 'Principal investigator, conceptualisation and methodology'),
  (2, 3, 1, 'Principal investigator, model architecture'),
  (2, 5, 2, 'Data collection and field validation'),
  (3, 3, 1, 'Inventor, drone navigation algorithm'),
  (3, 5, 2, 'Co-inventor, sensor integration');

-- ════════════════════════════════════════════════════════════
--  VERIFICATION QUERIES
-- ════════════════════════════════════════════════════════════
-- Run after seeding to verify row counts:
--
-- SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
-- WHERE TABLE_SCHEMA = 'unigrant'
-- ORDER BY TABLE_NAME;
--
-- SELECT * FROM Public_Project_View;
-- SELECT * FROM Admin_Analytics_View;
-- CALL generate_annual_report(1);

-- ============================================================
--  END: schema/06_seed_data.sql
--  Database is now fully populated and ready for demonstration.
-- ============================================================
