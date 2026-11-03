/**
 * DBA console (admin_role only): roles, views, triggers, the annual report
 * procedure, the index strategy, and the analytical queries Q1 to Q6.
 *
 * The SQL shown here is imported from schema/*.sql at build time, so what the
 * screen displays is what the database runs.
 */

import { useEffect, useState } from "react";
import { api } from "../api.js";
import { DB, logSQL, inr } from "../lib/db.js";
import { Figure, PageHead, Notice, Code } from "../components/ui.jsx";
import { ROLES } from "../lib/nav.js";
import viewsFile from "../../schema/02_views_indexes.sql?raw";
import triggersFile from "../../schema/03_triggers_integrity.sql?raw";
import rbacFile from "../../schema/04_rbac.sql?raw";
import procsFile from "../../schema/05_stored_procs_events.sql?raw";
import queriesFile from "../../schema/08_queries.sql?raw";

const pick = (text, pattern) => (text.replace(/\r\n/g, "\n").match(pattern) || [""])[0];
const pickAll = (text, pattern) => (text.replace(/\r\n/g, "\n").match(pattern) || []).join("\n");

const TABS = [
  ["roles", "Roles and grants"],
  ["views", "Views"],
  ["triggers", "Triggers and events"],
  ["proc", "Stored procedure"],
  ["indexes", "Indexes"],
  ["queries", "Queries"],
];

const ROLE_ROWS = [
  { key: "Admin", perms: ["ALL PRIVILEGES", "CREATE USER", "GRANT OPTION"], note: "Full DBA" },
  { key: "PI", perms: ["SELECT, INSERT, UPDATE on Proposal", "SELECT, INSERT on Expense"], note: "No CREATE USER or DROP" },
  { key: "Grant_Officer", perms: ["UPDATE (status) on Proposal", "SELECT, UPDATE on Expense", "INSERT on Grant_, Project, BudgetHead"], note: "CREATE USER revoked" },
  { key: "Student", perms: ["SELECT through views"], note: "No table access" },
];

const ROLE_SQL = pickAll(rbacFile, /^(?:CREATE ROLE|GRANT|REVOKE)[^;]*;/gm);

const VIEWS = [
  { name: "Public_Project_View", desc: "For outsiders. No money columns." },
  { name: "PI_Dashboard_View", desc: "A PI's projects with utilisation and open milestones." },
  { name: "Admin_Analytics_View", desc: "Funding, projects and outputs per department." },
  { name: "Student_Project_View", desc: "A student's assignments, without money columns." },
].map(v => ({ ...v, sql: pick(viewsFile, new RegExp(`CREATE OR REPLACE VIEW ${v.name}[\\s\\S]*?;`)) }));

const TRIGGERS = [
  { name: "balance_check_before_expense", desc: "Refuses an expense larger than the head's remaining balance." },
  { name: "update_budget_on_approval", desc: "Moves the money when an expense is approved or reversed." },
  { name: "active_project_limit_pi", desc: "Stops a proposal from a PI with five active projects." },
  { name: "auto_close_project", desc: "Closes a project once its end date has passed." },
  { name: "prevent_duplicate_expense_receipt", desc: "Refuses a receipt already used on the project." },
].map(t => ({ ...t, sql: pick(triggersFile, new RegExp(`CREATE TRIGGER ${t.name}[\\s\\S]*?END //`)).replace(/ \/\/$/, ";") }));

const EVENTS = [
  { name: "milestone_30day_alert", desc: "Scheduled event. Notifies the PI 30 days before a milestone." },
  { name: "monthly_budget_snapshot", desc: "Scheduled event. Archives balances into BudgetSnapshot." },
  { name: "grant_closure_check", desc: "Scheduled event. Closes grants past their end date." },
].map(t => ({ ...t, sql: pick(procsFile, new RegExp(`CREATE EVENT IF NOT EXISTS ${t.name}[\\s\\S]*?;`)) }));

const PROC_SQL = pick(procsFile, /CREATE PROCEDURE generate_annual_report[\s\S]*?END \/\//).replace(/ \/\/$/, ";");
const INDEX_SQL = pickAll(viewsFile, /^CREATE (?:FULLTEXT )?INDEX[\s\S]*?;/gm);

function ResultTable({ rows }) {
  if (!rows.length) return <p className="empty">The query returned no rows.</p>;
  const columns = Object.keys(rows[0]);
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{columns.map(c => <td key={c}>{String(r[c] ?? "—")}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Queries() {
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [term, setTerm] = useState("renewable energy solar storage");

  useEffect(() => {
    if (DB.live) api.reportQueries().then(setList).catch(err => setError(err.message));
  }, []);

  async function run(query) {
    setActive(query); setRows(null); setError(null);
    logSQL(query.sql, `${query.id}: ${query.concept}`);
    try {
      setRows(await api.runQuery(query.id, query.id === "Q5" ? term : ""));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!DB.live) return (
    <div className="stack">
      <Notice tone="wait" title="Connect to MySQL to run these.">The text below is schema/08_queries.sql.</Notice>
      <Code>{queriesFile}</Code>
    </div>
  );

  return (
    <div className="stack">
      {error && <Notice tone="bad" title="MySQL refused this.">{error}</Notice>}
      <section className="panel">
        <div className="panel-flush">
          {list.map(q => (
            <div key={q.id} className="row">
              <div className="row-main">
                <div className="row-title">{q.id}. {q.title}</div>
                <div className="row-sub">{q.purpose}</div>
              </div>
              <span className="chip">{q.concept}</span>
              <button className="btn btn-ink btn-sm" onClick={() => run(q)}>Run</button>
            </div>
          ))}
        </div>
      </section>
      {active?.id === "Q5" && (
        <form style={{ display: "flex", gap: 8 }} onSubmit={e => { e.preventDefault(); run(active); }}>
          <input className="input" value={term} onChange={e => setTerm(e.target.value)} aria-label="Search term" />
          <button className="btn btn-ink">Search</button>
        </form>
      )}
      {active && <Code>{active.sql}</Code>}
      {rows && <section className="panel"><ResultTable rows={rows} /></section>}
    </div>
  );
}

export default function DBA({ user }) {
  const [tab, setTab] = useState("roles");
  const [deptId, setDeptId] = useState(DB.departments[0]?.dept_id ?? 1);
  const [procResult, setProcResult] = useState(null);

  if (user.role !== "Admin") return <p className="empty">The DBA console is only available to admin_role.</p>;

  async function runProc() {
    logSQL(`CALL generate_annual_report(${deptId});`, "Stored procedure execution");
    if (DB.live) {
      const r = await api.departmentReport(deptId);
      setProcResult({ dept: r.dept_name, totalFunding: r.total_funds_received, active: r.active_projects, total: r.total_projects, pubs: r.publications, patents: r.patents, spent: r.total_expenditure, used: r.budget_utilisation_pct });
      return;
    }
    const dept = DB.departments.find(d => d.dept_id === deptId);
    const dProjects = DB.projects.filter(p => p.department_id === deptId);
    const dGrants = DB.grants.filter(g => dProjects.some(p => p.grant_id === g.grant_id));
    const dOutputs = DB.research_outputs.filter(o => dProjects.some(p => p.project_id === o.project_id));
    setProcResult({ dept: dept?.dept_name, totalFunding: dGrants.reduce((s, g) => s + Number(g.total_amount_awarded), 0), active: dProjects.filter(p => p.status === "Active").length, total: dProjects.length, pubs: dOutputs.filter(o => o.type === "Publication").length, patents: dOutputs.filter(o => o.type === "Patent").length });
  }

  return (
    <div>
      <PageHead title="DBA console" sub="The database objects behind the screens, exactly as they are defined in schema/*.sql." />
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {tab === "roles" && (
        <div className="stack">
          <section className="panel">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>MySQL role</th><th>Signs in as</th><th>Privileges</th><th>Limit</th></tr></thead>
                <tbody>
                  {ROLE_ROWS.map(r => (
                    <tr key={r.key}>
                      <td className="nowrap"><code style={{ fontWeight: 700, color: ROLES[r.key].ink }}>{ROLES[r.key].db}</code></td>
                      <td>{ROLES[r.key].label}</td>
                      <td>{r.perms.map(p => <span key={p} className="chip" style={{ marginRight: 6 }}>{p}</span>)}</td>
                      <td>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <Code>{ROLE_SQL}</Code>
        </div>
      )}

      {tab === "views" && (
        <div className="stack">
          {VIEWS.map(v => (
            <section key={v.name}>
              <h2 className="sql-title"><code>{v.name}</code><span>{v.desc}</span></h2>
              <Code>{v.sql}</Code>
            </section>
          ))}
        </div>
      )}

      {tab === "triggers" && (
        <div className="stack">
          {[...TRIGGERS, ...EVENTS].map(t => (
            <section key={t.name}>
              <h2 className="sql-title"><code>{t.name}</code><span>{t.desc}</span></h2>
              <Code>{t.sql}</Code>
            </section>
          ))}
        </div>
      )}

      {tab === "proc" && (
        <div className="grid-main">
          <Code>{PROC_SQL}</Code>
          <section className="panel" style={{ alignSelf: "start" }}>
            <div className="panel-head"><h2>Run it</h2></div>
            <div className="panel-body">
              <label className="field"><span>Department</span>
                <select className="select" value={deptId} onChange={e => setDeptId(Number(e.target.value))}>
                  {DB.departments.map(d => <option key={d.dept_id} value={d.dept_id}>{d.dept_name}</option>)}
                </select>
              </label>
              <button className="btn btn-ink btn-block" onClick={runProc}>CALL generate_annual_report({deptId})</button>
              {procResult && (
                <div style={{ marginTop: 20 }}>
                  <Notice tone="good" title="Procedure returned one row">for {procResult.dept}.</Notice>
                  <div className="figures" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
                    <Figure value={inr(procResult.totalFunding)} label="Funds received" />
                    <Figure value={procResult.total} label="Projects" sub={`${procResult.active} active`} />
                    <Figure value={procResult.pubs} label="Publications" />
                    <Figure value={procResult.patents} label="Patents" />
                    {procResult.spent !== undefined && <Figure value={inr(procResult.spent)} label="Approved spending" sub={`${procResult.used ?? 0}% of funds`} />}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "indexes" && <Code>{INDEX_SQL}</Code>}

      {tab === "queries" && <Queries />}
    </div>
  );
}
