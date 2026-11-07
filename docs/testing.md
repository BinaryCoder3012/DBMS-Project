# Testing

## Automated suite

[`server/test/integration.test.js`](../server/test/integration.test.js) runs real SQL and real HTTP requests against a real MySQL server, with 32 cases.

```bash
mysql -u root -p < unigrant_schema.sql   # the tests change rows, so start fresh
npm test
```

| Area | What is proved |
|---|---|
| Data | At least 500 records; `current_balance` equals the sum of head balances (D2) |
| Triggers | BR1 to BR4 refused with SQLSTATE 45000 and the right code; `auto_close_project` runs without error 1442 |
| Constraints | Eight CHECK constraints refuse bad values by name; `UNIQUE (proposal_id)` |
| Views | No money columns for students; analytics not inflated; the annual report agrees with the view |
| RBAC | Real database accounts are denied what the matrix denies |
| Role guard | No session gives 401; wrong role gives 403; a PI cannot touch another PI's project |
| W1 | An award writes four tables; a failure in the last insert rolls back everything; a second award is refused |
| W2 | Six concurrent approvals on one head: three pass, three refused, no overspend; one expense approved three times at once counts once; the CHECK backstop holds for clients that skip the API |
| W3 | Q1 to Q6 return rows; Q6 recurses past one level; FULLTEXT ranks the right researcher first; scores persist in `MATCHES` |

Result on MySQL 8.0.46: **32 passed, 0 failed.**

## Checks run by hand

These cover what the automated suite does not.

| Check | Method | Result |
|---|---|---|
| One-step install | `mysql < unigrant_schema.sql` on an empty server | Exit 0, 19 tables, 11 CHECKs, 24 foreign keys |
| Events fire | Rescheduled all three to run in one second | Notification written, 77 snapshot rows, expired grant closed |
| Backup and restore | `mysqldump`, restored into a second database | Same expense total; 5 triggers, 2 procedures, 3 events restored |
| W1 through the browser | Signed in as the officer, awarded a grant | ₹16,00,000 consistent across grant, project and 4 heads |
| W2 through the browser | Signed in as the PI and the officer | Refusal text from MySQL on screen; balances updated |
| Role views | Signed in as all four roles | No JavaScript errors; students see no project money |

To repeat the event check, on a scratch copy of the database:

```sql
ALTER EVENT grant_closure_check ON SCHEDULE AT CURRENT_TIMESTAMP + INTERVAL 1 SECOND;
```

This replaces the event's schedule, and one-time events are removed after they run, so reinstall afterwards.

## Not tested

- The Vercel deployment in `vercel.json`, which also needs a hosted MySQL server.
- Load beyond the seed data's size.
