# Data dictionary

Every column of every base table, as reported by `information_schema` on MySQL 8.0.46 after a clean install.

| Relation | Rows in the seed | Purpose |
|---|---:|---|
| [`Department`](#department) | 8 | Academic departments. |
| [`User`](#user) | 57 | Everyone who signs in. `role` is the discriminator of the ISA hierarchy. |
| [`FundingAgency`](#fundingagency) | 8 | External funders. |
| [`ExternalCall`](#externalcall) | 26 | Open and past funding calls from an agency. |
| [`Proposal`](#proposal) | 57 | A PI's request for funding. `status` is the life cycle. |
| [`Grant_`](#grant_) | 39 | An award. Named with an underscore because GRANT is reserved. |
| [`Project`](#project) | 39 | The hub entity. `current_balance` is a cached roll-up (D2). |
| [`BudgetHead`](#budgethead) | 154 | A project's budget by category. `remaining_balance` is generated. |
| [`Expense`](#expense) | 296 | Spending against a head. Only Approved rows count. |
| [`Milestone`](#milestone) | 191 | Project deliverables with due dates. |
| [`ResearchOutput`](#researchoutput) | 54 | Publications, patents, prototypes and reports. |
| [`Notification`](#notification) | 24 | Messages written by scheduled events. |
| [`Dependent`](#dependent) | 12 | Weak entity owned by User. |
| [`PublicationAuthor`](#publicationauthor) | 158 | Ordered authorship, M:N between ResearchOutput and User. |
| [`Equipment`](#equipment) | 30 | Weak entity owned by Expense. |
| [`WORKS_ON`](#works_on) | 138 | M:N between User and Project with role, hours and stipend. |
| [`SUPERVISES`](#supervises) | 44 | Recursive M:N on User. |
| [`MATCHES`](#matches) | 0 | M:N between ExternalCall and User. Filled when the grant matcher runs, so it starts empty. |
| [`BudgetSnapshot`](#budgetsnapshot) | 0 | Monthly archive written by the `monthly_budget_snapshot` event, so it starts empty. |
| **Total** | **1,335** | |

## Department

Academic departments.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `dept_id` | `int` | no | PK |  | auto_increment |
| `dept_name` | `varchar(120)` | no |  |  |  |
| `location` | `varchar(200)` | yes |  |  |  |
| `annual_budget` | `decimal(15,2)` | no |  | 0.00 |  |
| `established_date` | `date` | yes |  |  |  |

## User

Everyone who signs in. `role` is the discriminator of the ISA hierarchy.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `user_id` | `int` | no | PK |  | auto_increment |
| `ssn` | `varchar(20)` | yes | UNIQUE |  |  |
| `first_name` | `varchar(60)` | no |  |  |  |
| `middle_initial` | `char(1)` | yes |  |  |  |
| `last_name` | `varchar(60)` | no | INDEX/FK |  |  |
| `email` | `varchar(150)` | no | UNIQUE |  |  |
| `password_hash` | `varchar(256)` | no |  |  |  |
| `role` | `enum('Admin','PI','Student','Grant_Officer')` | no |  |  |  |
| `phone` | `varchar(20)` | yes |  |  |  |
| `address` | `text` | yes |  |  |  |
| `date_of_birth` | `date` | yes |  |  |  |
| `hire_date` | `date` | yes |  |  |  |
| `specialization` | `text` | yes | INDEX/FK |  |  |
| `dept_id` | `int` | yes | INDEX/FK |  |  |

## FundingAgency

External funders.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `agency_id` | `int` | no | PK |  | auto_increment |
| `agency_name` | `varchar(200)` | no |  |  |  |
| `contact_person` | `varchar(120)` | yes |  |  |  |
| `email` | `varchar(150)` | yes |  |  |  |
| `phone` | `varchar(20)` | yes |  |  |  |
| `address` | `text` | yes |  |  |  |
| `website` | `varchar(300)` | yes |  |  |  |
| `funding_focus_areas` | `text` | yes |  |  |  |

## ExternalCall

Open and past funding calls from an agency.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `call_id` | `int` | no | PK |  | auto_increment |
| `title` | `varchar(300)` | no |  |  |  |
| `description` | `text` | yes |  |  |  |
| `eligibility_criteria` | `text` | yes |  |  |  |
| `deadline` | `date` | no |  |  |  |
| `max_budget` | `decimal(15,2)` | yes |  |  |  |
| `agency_id` | `int` | no | INDEX/FK |  |  |

## Proposal

A PI's request for funding. `status` is the life cycle.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `proposal_id` | `int` | no | PK |  | auto_increment |
| `title` | `varchar(300)` | no |  |  |  |
| `abstract` | `text` | yes | INDEX/FK |  |  |
| `total_budget_requested` | `decimal(15,2)` | no |  |  |  |
| `duration_months` | `tinyint` | no |  |  |  |
| `submission_date` | `date` | yes |  |  |  |
| `status` | `enum('Draft','Submitted','Under Review','Approved','Rejected')` | no |  | Draft |  |
| `eligibility_check_passed` | `tinyint(1)` | yes |  | 0 |  |
| `pi_id` | `int` | no | INDEX/FK |  |  |

## Grant_

An award. Named with an underscore because GRANT is reserved.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `grant_id` | `int` | no | PK |  | auto_increment |
| `grant_title` | `varchar(300)` | no |  |  |  |
| `total_amount_awarded` | `decimal(15,2)` | no |  |  |  |
| `start_date` | `date` | no |  |  |  |
| `end_date` | `date` | no |  |  |  |
| `status` | `enum('Active','Closed','Suspended')` | no |  | Active |  |
| `funding_agency` | `varchar(200)` | yes |  |  |  |
| `agency_contact_info` | `varchar(300)` | yes |  |  |  |
| `reporting_frequency` | `enum('Monthly','Quarterly','Biannual','Annual')` | yes |  |  |  |
| `proposal_id` | `int` | yes | UNIQUE |  |  |

## Project

The hub entity. `current_balance` is a cached roll-up (D2).

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `project_id` | `int` | no | PK |  | auto_increment |
| `project_title` | `varchar(300)` | no | INDEX/FK |  |  |
| `description` | `text` | yes |  |  |  |
| `start_date` | `date` | no |  |  |  |
| `end_date` | `date` | no |  |  |  |
| `status` | `enum('Planning','Active','On Hold','Completed','Closed')` | no |  | Planning |  |
| `current_balance` | `decimal(15,2)` | no |  | 0.00 |  |
| `department_id` | `int` | yes | INDEX/FK |  |  |
| `grant_id` | `int` | yes | INDEX/FK |  |  |
| `pi_id` | `int` | no | INDEX/FK |  |  |

## BudgetHead

A project's budget by category. `remaining_balance` is generated.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `budgethead_id` | `int` | no | PK |  | auto_increment |
| `project_id` | `int` | no | INDEX/FK |  |  |
| `category` | `enum('Equipment','Travel','Manpower','Consumables','Other')` | no |  |  |  |
| `allocated_amount` | `decimal(15,2)` | no |  |  |  |
| `spent_amount` | `decimal(15,2)` | no |  | 0.00 |  |
| `remaining_balance` | `decimal(15,2)` | yes |  |  | STORED GENERATED |
| `fiscal_year` | `year` | yes |  |  |  |

## Expense

Spending against a head. Only Approved rows count.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `expense_id` | `int` | no | PK |  | auto_increment |
| `amount` | `decimal(15,2)` | no |  |  |  |
| `date` | `date` | no | INDEX/FK |  |  |
| `description` | `varchar(500)` | yes |  |  |  |
| `receipt_reference` | `varchar(100)` | yes |  |  |  |
| `status` | `enum('Pending','Approved','Rejected')` | no |  | Pending |  |
| `budgethead_id` | `int` | no | INDEX/FK |  |  |
| `project_id` | `int` | no | INDEX/FK |  |  |
| `approval_date` | `date` | yes |  |  |  |
| `approved_by` | `int` | yes | INDEX/FK |  |  |

## Milestone

Project deliverables with due dates.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `milestone_id` | `int` | no | PK |  | auto_increment |
| `project_id` | `int` | no | INDEX/FK |  |  |
| `title` | `varchar(200)` | no |  |  |  |
| `due_date` | `date` | no |  |  |  |
| `completion_date` | `date` | yes |  |  |  |
| `deliverable_description` | `text` | yes |  |  |  |
| `status` | `enum('Pending','Completed','Delayed')` | no | INDEX/FK | Pending |  |
| `report_submitted` | `tinyint(1)` | yes |  | 0 |  |
| `priority` | `enum('High','Medium','Low')` | no |  | Medium |  |

## ResearchOutput

Publications, patents, prototypes and reports.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `output_id` | `int` | no | PK |  | auto_increment |
| `project_id` | `int` | no | INDEX/FK |  |  |
| `type` | `enum('Publication','Patent','Prototype','Report')` | no |  |  |  |
| `title` | `varchar(400)` | no |  |  |  |
| `authors` | `text` | yes |  |  |  |
| `publication_date` | `date` | yes |  |  |  |
| `journal_conference` | `varchar(300)` | yes |  |  |  |
| `doi` | `varchar(200)` | yes |  |  |  |
| `status` | `enum('Submitted','Accepted','Published')` | no |  | Submitted |  |

## Notification

Messages written by scheduled events.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `notif_id` | `int` | no | PK |  | auto_increment |
| `user_id` | `int` | no | INDEX/FK |  |  |
| `message` | `text` | no |  |  |  |
| `is_read` | `tinyint(1)` | yes |  | 0 |  |
| `sent_at` | `timestamp` | yes |  | CURRENT_TIMESTAMP |  |

## Dependent

Weak entity owned by User.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `user_id` | `int` | no | PK |  |  |
| `dependent_name` | `varchar(120)` | no | PK |  |  |
| `relationship` | `enum('Spouse','Child','Parent')` | no |  |  |  |
| `date_of_birth` | `date` | yes |  |  |  |
| `phone` | `varchar(20)` | yes |  |  |  |

## PublicationAuthor

Ordered authorship, M:N between ResearchOutput and User.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `output_id` | `int` | no | PK |  |  |
| `user_id` | `int` | no | PK |  |  |
| `author_position` | `tinyint` | no |  |  |  |
| `contribution_description` | `text` | yes |  |  |  |

## Equipment

Weak entity owned by Expense.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `equipment_id` | `varchar(50)` | no | PK |  |  |
| `expense_id` | `int` | no | PK |  |  |
| `equipment_name` | `varchar(200)` | no |  |  |  |
| `serial_number` | `varchar(100)` | yes |  |  |  |
| `warranty_until` | `date` | yes |  |  |  |
| `location` | `varchar(200)` | yes |  |  |  |

## WORKS_ON

M:N between User and Project with role, hours and stipend.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `user_id` | `int` | no | PK |  |  |
| `project_id` | `int` | no | PK |  |  |
| `role_in_project` | `enum('Lead Researcher','Team Member','Research Assistant')` | no |  |  |  |
| `hours_per_week` | `tinyint` | yes |  |  |  |
| `stipend_amount` | `decimal(12,2)` | yes |  | 0.00 |  |

## SUPERVISES

Recursive M:N on User.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `supervisor_id` | `int` | no | PK |  |  |
| `supervisee_id` | `int` | no | PK |  |  |
| `relationship_type` | `enum('PhD Advisor','Mentor','Co-Supervisor')` | no |  |  |  |
| `start_date` | `date` | yes |  |  |  |

## MATCHES

M:N between ExternalCall and User. Filled when the grant matcher runs, so it starts empty.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `call_id` | `int` | no | PK |  |  |
| `user_id` | `int` | no | PK |  |  |
| `match_score` | `tinyint` | no |  |  |  |
| `match_reason` | `text` | yes |  |  |  |
| `notification_sent` | `tinyint(1)` | yes |  | 0 |  |
| `computed_at` | `timestamp` | yes |  | CURRENT_TIMESTAMP |  |

## BudgetSnapshot

Monthly archive written by the `monthly_budget_snapshot` event, so it starts empty.

| Column | Type | Null | Key | Default | Extra |
|---|---|---|---|---|---|
| `snapshot_id` | `int` | no | PK |  | auto_increment |
| `snapshot_date` | `date` | no | INDEX/FK |  |  |
| `budgethead_id` | `int` | no |  |  |  |
| `project_id` | `int` | no |  |  |  |
| `category` | `varchar(20)` | no |  |  |  |
| `allocated_amount` | `decimal(15,2)` | yes |  |  |  |
| `spent_amount` | `decimal(15,2)` | yes |  |  |  |
| `remaining_balance` | `decimal(15,2)` | yes |  |  |  |
