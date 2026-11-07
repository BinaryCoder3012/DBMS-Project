# Access control

Access is controlled in two places, and they agree.

| Layer | Applies to | Defined in |
|---|---|---|
| MySQL roles and GRANTs | Anyone connecting directly to the database | [`schema/04_rbac.sql`](../schema/04_rbac.sql) |
| API role guard and row filters | Requests through the application | [`server/index.js`](../server/index.js) |

The API connects through one pooled service account, so MySQL cannot tell which person sent a request. The signed session token carries that identity, and each query adds `WHERE pi_id = ?` or `WHERE student_id = ?`.

## Roles

| Application role | MySQL role | Who | Needs |
|---|---|---|---|
| Admin | `admin_role` | Research office | University-wide analytics, user management |
| PI | `pi_role` | Faculty | Submit proposals, log expenses, update milestones |
| Grant Officer | `grant_officer_role` | Finance, compliance | Review proposals, award grants, approve or reject expenses |
| Student | `student_role` | Research assistants | Read assigned projects, no financial data |

## Privilege matrix

S = SELECT, I = INSERT, U = UPDATE.

| Table or view | Admin | PI | Grant Officer | Student |
|---|:-:|:-:|:-:|:-:|
| User, Department | ALL | | | |
| Proposal | ALL | S I U | S, U(status) | |
| Grant_ | ALL | S | S I | |
| Project | ALL | S | S I | |
| BudgetHead | ALL | S | S I | |
| Expense | ALL | S I | S U | |
| Milestone | ALL | S I U | | |
| ResearchOutput | ALL | S I | | |
| Public_Project_View | ALL | S | S | S |
| PI_Dashboard_View | ALL | S | | |
| Admin_Analytics_View | ALL | | | |
| Student_Project_View | ALL | | | S |

`admin_role` also holds `CREATE USER` and `GRANT OPTION`. `CREATE USER` is explicitly revoked from `grant_officer_role`. Triggers run with their definer's rights, which is why a grant officer can approve an expense without `UPDATE` on `BudgetHead`.

## Database accounts

Created by `04_rbac.sql` for demonstration. Change them in any real deployment.

| Account | Password | Role |
|---|---|---|
| `admin_user` | `AdminPass!1` | `admin_role` |
| `pi_user` | `PIPass!1` | `pi_role` |
| `grant_officer_user` | `GOPass!1` | `grant_officer_role` |
| `student_user` | `StudPass!1` | `student_role` |

See the privileges in action:

```bash
mysql -u student_user -p'StudPass!1' unigrant -e "SELECT * FROM Expense"
# ERROR 1142: SELECT command denied to user 'student_user'

mysql -u student_user -p'StudPass!1' unigrant -e "SELECT * FROM Public_Project_View LIMIT 3"
# works: no money columns

mysql -u grant_officer_user -p'GOPass!1' unigrant -e "CREATE USER 'x'@'%'"
# ERROR 1227: Access denied; you need the CREATE USER privilege
```
