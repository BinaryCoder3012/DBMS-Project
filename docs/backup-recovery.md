# Backup and recovery

The commands are also recorded in [`schema/05_stored_procs_events.sql`](../schema/05_stored_procs_events.sql).

## Full backup

```bash
mysqldump -u root -p unigrant \
  --single-transaction --routines --triggers --events --hex-blob \
  > unigrant_$(date +%Y%m%d_%H%M%S).sql
```

| Flag | Why |
|---|---|
| `--single-transaction` | Consistent InnoDB snapshot, no table locks |
| `--routines` | Includes stored procedures |
| `--triggers` | Includes triggers |
| `--events` | Includes scheduled events |

Roles and users live in the `mysql` system database, so restoring onto a new server needs `schema/04_rbac.sql` as well.

## Restore

```bash
mysql -u root -p -e "CREATE DATABASE unigrant_restore"
mysql -u root -p unigrant_restore < unigrant_20261108_120000.sql
```

This path was tested: the restored database had the same expense total, 5 triggers, 2 procedures and 3 events.

## Point-in-time recovery

Enable the binary log:

```ini
[mysqld]
log_bin = /var/log/mysql/binlog
binlog_format = ROW
```

Restore the last full dump, then replay changes up to just before the failure:

```bash
mysqlbinlog --start-datetime="2026-11-01 00:00:00" \
            --stop-datetime="2026-11-08 14:30:00" \
            /var/log/mysql/binlog.000001 | mysql -u root -p unigrant
```

This part is documented, not tested.

## Suggested schedule

| Task | Frequency |
|---|---|
| Full `mysqldump` | Nightly |
| Binary logs | Continuous, kept for 7 days |
| Restore to a test instance and compare row counts | Weekly |

The `monthly_budget_snapshot` event separately keeps a month-by-month history of budget balances in `BudgetSnapshot`, which supports audits without restoring a backup.
