# Relational schema

19 relations: 18 mapped from the ER model, plus the archive `BudgetSnapshot` written by a scheduled event. For every column, see the [data dictionary](data-dictionary.md).

## Mapping rules

| ER construct | Relational mapping | Example |
|---|---|---|
| Strong entity | One relation | `Project` |
| Weak entity | Relation whose key includes the owner's key | `Dependent (user_id, dependent_name)` |
| 1:N relationship | Foreign key on the N side | `Expense.budgethead_id` |
| M:N relationship | Bridge relation with a composite key | `WORKS_ON (user_id, project_id)` |
| Specialisation | One table with a discriminator | `User.role` |
| Derived attribute | Stored generated column | `BudgetHead.remaining_balance` |

## Relations, keys and referential actions

| Relation | Primary key | Foreign keys (ON DELETE) |
|---|---|---|
| Department | dept_id | none |
| User | user_id | dept_id → Department (SET NULL); UNIQUE email, ssn |
| FundingAgency | agency_id | none |
| ExternalCall | call_id | agency_id → FundingAgency (CASCADE) |
| Proposal | proposal_id | pi_id → User (RESTRICT) |
| Grant_ | grant_id | proposal_id → Proposal (SET NULL); UNIQUE proposal_id |
| Project | project_id | department_id → Department (SET NULL); grant_id → Grant_ (SET NULL); pi_id → User (RESTRICT) |
| BudgetHead | budgethead_id | project_id → Project (CASCADE) |
| Expense | expense_id | budgethead_id → BudgetHead (RESTRICT); project_id → Project (CASCADE); approved_by → User (SET NULL) |
| Milestone | milestone_id | project_id → Project (CASCADE) |
| ResearchOutput | output_id | project_id → Project (CASCADE) |
| Notification | notif_id | user_id → User (CASCADE) |
| Dependent | (user_id, dependent_name) | user_id → User (CASCADE) |
| PublicationAuthor | (output_id, user_id) | output_id → ResearchOutput; user_id → User (both CASCADE) |
| Equipment | (equipment_id, expense_id) | expense_id → Expense (CASCADE) |
| WORKS_ON | (user_id, project_id) | both CASCADE |
| SUPERVISES | (supervisor_id, supervisee_id) | both → User (CASCADE) |
| MATCHES | (call_id, user_id) | call_id → ExternalCall; user_id → User (both CASCADE) |
| BudgetSnapshot | snapshot_id | none (archive) |

**Why these actions.** RESTRICT protects financial history. SET NULL keeps optional links harmless. CASCADE removes rows that cannot exist without their parent.

## Integrity constraints

- `DECIMAL(15,2)` for all money, `ENUM` for every status and category.
- `NOT NULL` on mandatory keys and amounts; `UNIQUE` on `User.email`, `User.ssn` and `Grant_.proposal_id`.
- `BudgetHead.remaining_balance` is `GENERATED ALWAYS AS (allocated_amount - spent_amount) STORED`.

### The 11 CHECK constraints

| Constraint | Table | Rule |
|---|---|---|
| `chk_user_role` | User | role is one of the four roles |
| `chk_proposal_budget` | Proposal | `total_budget_requested > 0` |
| `chk_proposal_duration` | Proposal | `duration_months > 0` |
| `chk_grant_dates` | Grant_ | `end_date > start_date` |
| `chk_grant_amount` | Grant_ | `total_amount_awarded > 0` |
| `chk_project_dates` | Project | `end_date > start_date` |
| `chk_project_balance` | Project | `current_balance >= 0` |
| `chk_budget_amounts` | BudgetHead | `allocated_amount > 0`, `0 <= spent_amount <= allocated_amount` |
| `chk_expense_amount` | Expense | `amount > 0` |
| `chk_no_self_supervise` | SUPERVISES | `supervisor_id != supervisee_id` |
| `MATCHES_chk_1` | MATCHES | `match_score BETWEEN 0 AND 100` |

## Normalisation

All relations are in 3NF, and every determinant is a candidate key, so they are in BCNF, apart from the documented denormalisations below.

| Relation | Key dependencies | Observation | NF |
|---|---|---|---|
| User | user_id → all; email → user_id; ssn → user_id | Candidate keys user_id, email, ssn | BCNF |
| BudgetHead | budgethead_id → all | remaining_balance is a generated column, not stored independently | BCNF |
| Expense | expense_id → all | project_id is also derivable through budgethead_id; kept for fast project queries | 3NF |
| WORKS_ON, Dependent, Equipment | composite key → non-key attributes | No partial dependency | BCNF |

### Documented denormalisations

| ID | Column | Why it exists | How it stays correct |
|---|---|---|---|
| D1 | `Grant_.funding_agency` | Snapshot of the agency name at award time | It is history, so it should not change later |
| D2 | `Project.current_balance` | Cached roll-up, saves a join on list screens | `update_budget_on_approval` adjusts it in the same transaction; a test asserts it equals the sum of the head balances |
| D3 | `ResearchOutput.authors` | Display string | Ordered authorship lives in `PublicationAuthor` |

## Assumptions

- **A1** A user has one role and at most one department.
- **A2** A project has exactly one PI and at most one grant; a grant may fund several projects.
- **A3** Money is `DECIMAL(15,2)` in rupees, single currency.
- **A4** Only Approved expenses count towards `spent_amount`.
- **A5** MySQL has no row-level security policy, so row filtering is done with views and the application layer.
