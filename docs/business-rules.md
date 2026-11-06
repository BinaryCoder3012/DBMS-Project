# Business rules and how they are enforced

The rules that matter most live in the DBMS, so they hold for every client, not only for this application. The "Test" column names the case in [`server/test/integration.test.js`](../server/test/integration.test.js) that proves each rule.

| ID | Rule | Mechanism | Error | Test |
|---|---|---|---|---|
| BR1 | An expense cannot exceed the remaining balance of its head | Trigger `balance_check_before_expense` | `ERR-BH001` | BR1 |
| BR1 | Pending expenses cannot overspend together at approval | Row locks in the API, `chk_budget_amounts` as a backstop | `ERR-BH002`, error 3819 | W2 concurrent approvals, CHECK backstop |
| BR2 | Approval moves the amount into `spent_amount` atomically; a reversal restores it | Trigger `update_budget_on_approval` in a transaction | | BR2 |
| BR3 | A PI with 5 active projects cannot propose | Trigger `active_project_limit_pi` | `ERR-PI001` | BR3 |
| BR4 | A receipt reference is unique within a project | Trigger `prevent_duplicate_expense_receipt` | `ERR-EXP001` | BR4 |
| BR5 | Dates are ordered, amounts positive, no self-supervision | 11 CHECK constraints | error 3819 | BR5 |
| BR6 | Students see only assigned projects and no money columns | `Student_Project_View`, `Public_Project_View`, role guard | HTTP 403 | BR6, students get no money |
| BR7 | Grant officers can never create users or alter the schema | `REVOKE CREATE USER`, least-privilege GRANTs | error 1227, 1142 | BR7 |
| BR8 | Expired grants close; milestones due in 30 days notify the PI | Events `grant_closure_check`, `milestone_30day_alert` | | Run by hand, see [testing](testing.md) |

## Triggers

| Trigger | Fires | Purpose |
|---|---|---|
| `balance_check_before_expense` | BEFORE INSERT on Expense | Refuses an overspend with SQLSTATE 45000 |
| `prevent_duplicate_expense_receipt` | BEFORE INSERT on Expense | Refuses a repeated receipt |
| `update_budget_on_approval` | AFTER UPDATE on Expense | Moves money between head and project balances |
| `active_project_limit_pi` | BEFORE INSERT on Proposal | Enforces the 5-project limit |
| `auto_close_project` | BEFORE UPDATE on Project | Closes an expired active project |

### Why `auto_close_project` is BEFORE UPDATE

A trigger may not run `UPDATE` on the table that fired it. An `AFTER UPDATE` version that updated `Project` failed with:

```text
ERROR 1442 (HY000): Can't update table 'Project' in stored function/trigger because it is
already used by statement which invoked this stored function/trigger.
```

Assigning `NEW.status` in a `BEFORE UPDATE` trigger changes the row being written, which needs no second statement.

### Why BR1 needs more than the insert trigger

The trigger checks each expense against the balance when it is inserted, but pending expenses do not reduce that balance. Two ₹60,000 expenses on a ₹1,00,000 head both pass, and approving both would overspend.

| Layer | What it does |
|---|---|
| API | `SELECT ... FOR UPDATE` on the expense and its head, so concurrent approvals queue, and the second one sees the first one's committed balance |
| Database | `chk_budget_amounts` requires `spent_amount <= allocated_amount`, so an overspend fails even from a client that skips the API |

A test fires six ₹30,000 approvals at a ₹1,00,000 head at once. Exactly three succeed, and the head finishes at ₹90,000 spent.

## Scheduled events

| Event | Schedule | Action |
|---|---|---|
| `milestone_30day_alert` | Daily | Inserts a `Notification` for milestones due in exactly 30 days |
| `monthly_budget_snapshot` | 1st of each month | Copies active head balances into `BudgetSnapshot` |
| `grant_closure_check` | Daily | Closes active grants past their end date |

The event scheduler must be on: `SET GLOBAL event_scheduler = ON`, which `schema/05_stored_procs_events.sql` does and which needs an administrator account.

## Stored procedures

| Procedure | Purpose |
|---|---|
| `generate_annual_report(dept_id)` | One-row department report. Signals `ERR-DEPT001` for an unknown department |
| `get_pi_budget_summary(pi_id)` | Budget utilisation per head for a PI's projects |

## Known limitations

- `prevent_duplicate_expense_receipt` reads and then inserts, so two identical receipts inserted at the same instant could both pass. A `UNIQUE (project_id, receipt_reference)` index would close this, but empty references would then collide.
- Passwords use unsalted SHA-256, as the design specified. A production system would use bcrypt or Argon2.
- The API connects through one service account, so the MySQL GRANTs apply to direct database clients, and the role guard in `server/index.js` mirrors them for API requests.
