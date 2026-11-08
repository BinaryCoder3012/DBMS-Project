# Demo and viva guide

A run-through for the in-lab demonstration, which follows the evaluation order: workflows, then SQL and DBMS concepts, then questions.

## Before you start

```bash
mysql -u root -p < unigrant_schema.sql   # fresh data
npm run server                           # terminal 1
npm run dev                              # terminal 2
```

Keep a `mysql` client open beside the browser, so you can show each change in the tables.

## Part 1: workflows

### W2: the rule the database enforces

1. Sign in as **Arjun Mehta (PI)** and open **Expenses**.
2. Choose **Log an expense**, enter ₹99,99,999 and save.
3. Point at the message: `ERR-BH001` was raised by `balance_check_before_expense`, not by JavaScript.
4. Log an expense for ₹20,000, with a new receipt reference.
5. Sign out, sign in as **Sneha Patel (Grant Officer)**, and approve it.
6. In the client, show that the balance moved:

```sql
SELECT category, allocated_amount, spent_amount, remaining_balance
FROM BudgetHead WHERE project_id = 1;
```

7. Prove the rule holds without the application:

```sql
INSERT INTO Expense (project_id, budgethead_id, amount, date)
VALUES (1, 1, 99999999, CURDATE());
-- ERROR 1644 (45000): ERR-BH001 ...
```

### W1: one transaction, four tables

1. As Sneha, open **Proposals**.
2. Choose **Award grant** on *Edge AI for Early Sepsis Warning in Rural Clinics*.
3. Fill in the agency and confirm.
4. Show the rows:

```sql
SELECT g.grant_id, g.status, p.project_id, p.current_balance
FROM Grant_ g JOIN Project p ON p.grant_id = g.grant_id
ORDER BY g.grant_id DESC LIMIT 1;

SELECT category, allocated_amount FROM BudgetHead ORDER BY budgethead_id DESC LIMIT 4;
```

### W3: search and reports

1. Sign in as **Priya Sharma (Admin)**.
2. In **Grant matcher**, find calls for Prof. Mehta, then search "drug discovery".
3. Show that the scores were stored: `SELECT * FROM MATCHES ORDER BY match_score DESC LIMIT 5;`
4. Open **Analytics**, which reads `Admin_Analytics_View`.
5. In **DBA console**, run the stored procedure, then Q1 to Q6.

### RBAC

Sign in as **Rahul Verma (Student)**. The menu is short and no project shows money. Then, in the client:

```bash
mysql -u student_user -p'StudPass!1' unigrant -e "SELECT * FROM Expense"
```

## Part 2: questions to be ready for

**Why is `remaining_balance` a generated column?** It can never disagree with the two columns it derives from, which removes an update anomaly. It is STORED so it can be indexed.

**Why keep `project_id` on `Expense` if it follows from `budgethead_id`?** Fast project queries. It is a documented denormalisation, and the API checks that the head belongs to the project.

**Why triggers rather than application checks?** They hold for every client. The demo's direct `INSERT` shows this.

**Why does `auto_close_project` use BEFORE UPDATE?** A trigger cannot update its own table (error 1442). In BEFORE UPDATE, it assigns `NEW.status` instead.

**What stops two officers overspending at once?** `SELECT ... FOR UPDATE` serialises them, and the CHECK on `spent_amount` is the backstop.

**What is join fan-out?** See [queries](queries.md). The views pre-aggregate to avoid it.

**Is `Project.current_balance` redundant?** Yes, it is denormalisation D2, kept for list screens. The trigger maintains it, and a test checks it.

**Why does the Student view not use `CURRENT_USER()`?** The application uses a pooled service account, so `CURRENT_USER()` is never the student. The view exposes `student_id`, and the API filters on the identity in the signed token.

**Is the database normalised?** See [relational schema](relational-schema.md) for dependencies and the three denormalisations.

**Why is the table called `Grant_`?** `GRANT` is reserved.

**Why does `MATCHES` start empty?** It stores computed results, which appear when the matcher runs.

## Resetting

Re-run `mysql -u root -p < unigrant_schema.sql` between rehearsals.
