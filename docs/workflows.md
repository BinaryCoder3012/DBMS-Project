# Application workflows

Three end-to-end workflows, each exercising a different part of the database.

| | Workflow | Exercises | Screens |
|---|---|---|---|
| **W1** | Award a grant | Multi-table transaction | Proposals |
| **W2** | Submit and approve an expense | Integrity enforcement, concurrency | Expenses |
| **W3** | Discover and report | Complex retrieval, search, aggregation | Grant matcher, Analytics, DBA console |

## W1: award a grant

A PI drafts and submits a proposal. A grant officer reviews it and awards it. One transaction approves the proposal and creates the grant, the project and its budget heads. Any failure rolls all of it back.

```mermaid
sequenceDiagram
    actor Officer as Grant officer
    participant UI as React
    participant API as Express
    participant DB as MySQL
    Officer->>UI: Award grant
    UI->>API: POST /api/grants/award
    API->>DB: START TRANSACTION
    API->>DB: SELECT ... FROM Proposal FOR UPDATE
    API->>DB: INSERT INTO Grant_
    API->>DB: INSERT INTO Project
    API->>DB: INSERT INTO BudgetHead (one per category)
    API->>DB: UPDATE Proposal SET status = 'Approved'
    alt every statement succeeded
        API->>DB: COMMIT
        API-->>UI: 201 Created
    else any statement failed
        API->>DB: ROLLBACK
        API-->>UI: 4xx with the reason
    end
```

| Tables | `Proposal`, `Grant_`, `Project`, `BudgetHead` |
|---|---|
| Demonstrates | Atomicity, row locks, `UNIQUE (proposal_id)` allowing one grant per proposal |
| Try it | Sign in as Sneha, open Proposals, choose **Award grant** on an Under Review proposal |

## W2: submit and approve an expense

A PI logs an expense. The triggers may refuse it. A grant officer approves it, and the trigger moves the money in the same transaction.

```mermaid
sequenceDiagram
    actor PI
    actor Officer as Grant officer
    participant API as Express
    participant DB as MySQL
    PI->>API: POST /api/expenses
    API->>DB: INSERT INTO Expense
    Note over DB: balance_check_before_expense<br/>prevent_duplicate_expense_receipt
    alt refused
        DB-->>API: SQLSTATE 45000 ERR-BH001
        API-->>PI: 422 with the database's message
    else accepted
        DB-->>API: Pending row
    end
    Officer->>API: PATCH /api/expenses/:id/approve
    API->>DB: START TRANSACTION
    API->>DB: SELECT Expense FOR UPDATE
    API->>DB: SELECT BudgetHead FOR UPDATE
    API->>DB: UPDATE Expense SET status = 'Approved'
    Note over DB: update_budget_on_approval<br/>updates BudgetHead and Project
    API->>DB: COMMIT
```

| Tables | `Expense`, `BudgetHead`, `Project` |
|---|---|
| Demonstrates | Triggers, SQLSTATE error mapping, `SELECT ... FOR UPDATE`, a CHECK as a backstop |
| Try it | Sign in as Arjun, log an expense for ₹99,99,999 and read the refusal, then sign in as Sneha and approve a pending expense |

![A refusal from MySQL shown in the UI](screenshots/trigger-refusal.jpg)

## W3: discover and report

| Feature | Backed by |
|---|---|
| Researchers for a topic | `MATCH ... AGAINST` over `FT_User_Specialization` and `FT_Proposal` |
| Calls for a researcher | FULLTEXT relevance per open call, stored in `MATCHES` |
| Analytics | `Admin_Analytics_View` |
| Annual report | `CALL generate_annual_report(dept_id)` |
| Query runner | Q1 to Q6 in the DBA console |

Match scores are FULLTEXT relevance scaled so the best call scores 100, which keeps `match_score` inside its CHECK range of 0 to 100.

| Try it | Sign in as Priya, open DBA console, then the Queries tab, and run Q1 to Q6 |
|---|---|

## Screen to database map

| Screen | Roles | Objects |
|---|---|---|
| Overview | All | `Project`, `BudgetHead`, `Milestone`, `Expense`, `Student_Project_View` for students |
| Proposals | Admin, PI, Grant Officer | `Proposal`, W1 transaction, `active_project_limit_pi` |
| Projects | Admin, PI, Student | `Project`, `BudgetHead`, `WORKS_ON`, `Milestone` |
| Expenses | Admin, PI, Grant Officer | `Expense`, W2 transaction, three triggers |
| Grants | Admin, Grant Officer | `Grant_` |
| Milestones | PI, Student | `Milestone` |
| Research outputs | PI, Student | `ResearchOutput` |
| People, Departments | Admin | `User`, `Department` |
| Analytics | Admin | `Admin_Analytics_View` |
| DBA console | Admin | Everything in `schema/`, read straight from the SQL files |
| Grant matcher | Admin, PI | `MATCHES`, FULLTEXT indexes |
| Schema | All | Interactive 3D Chen-notation model |
