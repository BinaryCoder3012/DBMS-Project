/**
 * Read screens: grants, milestones, research outputs, people, departments
 * and the admin analytics built on Admin_Analytics_View.
 */

import { useEffect, useState } from "react";
import { DB, logSQL, inr, inrShort, fmtDate, daysUntil, fullName } from "../lib/db.js";
import { Status, Figure, PageHead, Avatar } from "../components/ui.jsx";
import { ROLES } from "../lib/nav.js";
import { visibleProjects } from "./Dashboard.jsx";

// ─── Grants ───────────────────────────────────────────────────
export function Grants() {
  useEffect(() => { logSQL(`SELECT g.*, p.project_title FROM Grant_ g\nLEFT JOIN Project p ON g.grant_id = p.grant_id\nORDER BY g.status, g.start_date DESC;`, "Fetch all grants"); }, []);
  const total = DB.grants.reduce((s, g) => s + Number(g.total_amount_awarded), 0);
  return (
    <div>
      <PageHead title="Grants" sub={`${DB.grants.length} grants worth ${inr(total)}. Each one points back at the proposal it funded.`} />
      <section className="panel">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Grant</th><th>Agency</th><th className="num">Awarded</th><th>Period</th><th>Reports</th><th>Status</th></tr></thead>
            <tbody>
              {DB.grants.map(g => {
                const proj = DB.projects.find(p => p.grant_id === g.grant_id);
                return (
                  <tr key={g.grant_id}>
                    <td><div className="cell-title">{g.grant_title}</div>{proj && <div className="cell-sub">Funds {proj.project_title}</div>}</td>
                    <td>{g.funding_agency}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{inr(g.total_amount_awarded)}</td>
                    <td className="nowrap">{fmtDate(g.start_date)} to {fmtDate(g.end_date)}</td>
                    <td>{g.reporting_frequency}</td>
                    <td><Status value={g.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {DB.grants.length === 0 && <p className="empty">No grants awarded yet.</p>}
        </div>
      </section>
    </div>
  );
}

// ─── Milestones ───────────────────────────────────────────────
export function Milestones({ user }) {
  const mine = user.role === "Admin" ? DB.projects : visibleProjects(user);
  const miles = DB.milestones
    .filter(m => mine.some(p => p.project_id === m.project_id))
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  const [showDone, setShowDone] = useState(true);
  const shown = miles.filter(m => showDone || m.status !== "Completed");
  return (
    <div>
      <PageHead title="Milestones" sub="Ordered by due date. A nightly event writes a notification 30 days before each one.">
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show completed
        </label>
      </PageHead>
      <section className="panel">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Milestone</th><th>Project</th><th>Due</th><th>Priority</th><th>Status</th><th>Report</th></tr></thead>
            <tbody>
              {shown.map(m => {
                const proj = DB.projects.find(p => p.project_id === m.project_id);
                const days = daysUntil(m.due_date);
                return (
                  <tr key={m.milestone_id}>
                    <td><div className="cell-title">{m.title}</div><div className="cell-sub">{m.deliverable_description}</div></td>
                    <td>{proj?.project_title}</td>
                    <td className="nowrap">
                      <div>{fmtDate(m.due_date)}</div>
                      {m.status === "Pending" && <div className="cell-sub" style={{ color: days < 0 ? "var(--red)" : days <= 30 ? "var(--ochre)" : undefined, fontWeight: 600 }}>
                        {days > 0 ? `in ${days} days` : days === 0 ? "today" : `${-days} days late`}
                      </div>}
                    </td>
                    <td><Status value={m.priority} /></td>
                    <td><Status value={m.status} /></td>
                    <td>{m.report_submitted ? "Submitted" : <span style={{ color: "var(--ink-3)" }}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty">No milestones to show.</p>}
        </div>
      </section>
    </div>
  );
}

// ─── Research outputs ─────────────────────────────────────────
export function Outputs() {
  const [type, setType] = useState("All");
  const types = ["All", ...new Set(DB.research_outputs.map(o => o.type))];
  const shown = DB.research_outputs.filter(o => type === "All" || o.type === type);
  return (
    <div>
      <PageHead title="Research outputs" sub="Papers, patents and prototypes, each tied to the project that produced it." />
      <div className="tabs" role="tablist">
        {types.map(t => <button key={t} role="tab" className="tab" aria-selected={type === t} onClick={() => setType(t)}>{t}</button>)}
      </div>
      <section className="panel">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Title and authors</th><th>Type</th><th>Venue</th><th>DOI</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map(o => (
                <tr key={o.output_id}>
                  <td><div className="cell-title">{o.title}</div><div className="cell-sub">{o.authors}</div></td>
                  <td>{o.type}</td>
                  <td>{o.journal_conference}</td>
                  <td className="nowrap"><code style={{ fontSize: 12 }}>{o.doi}</code></td>
                  <td className="nowrap">{fmtDate(o.publication_date)}</td>
                  <td><Status value={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty">No outputs recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}

// ─── People ───────────────────────────────────────────────────
export function People() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("All");
  const shown = DB.users
    .filter(u => role === "All" || u.role === role)
    .filter(u => !q || (fullName(u) + " " + u.email + " " + (u.specialization || "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHead title="People" sub="One User table; role is the discriminator for the Admin, PI, Grant officer and Student specialisation." />
      <div className="toolbar">
        <input className="input" type="search" placeholder="Search by name, email or specialisation" value={q} onChange={e => setQ(e.target.value)} aria-label="Search people" />
        <select className="select" style={{ width: "auto" }} value={role} onChange={e => setRole(e.target.value)} aria-label="Filter by role">
          <option value="All">Every role</option>
          {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
        </select>
      </div>
      <section className="panel">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Specialisation</th><th>Joined</th></tr></thead>
            <tbody>
              {shown.map(u => (
                <tr key={u.user_id}>
                  <td><div className="who"><Avatar user={u} /><div><div className="who-name">{fullName(u)}</div><div className="who-sub">{u.email}</div></div></div></td>
                  <td className="nowrap">{ROLES[u.role]?.label || u.role}</td>
                  <td>{DB.departments.find(d => d.dept_id === u.dept_id)?.dept_name || "—"}</td>
                  <td><div className="cell-sub" style={{ marginTop: 0 }}>{u.specialization}</div></td>
                  <td className="nowrap">{fmtDate(u.hire_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty">Nobody matches that search.</p>}
        </div>
      </section>
    </div>
  );
}

// ─── Departments ──────────────────────────────────────────────
export function Departments() {
  return (
    <div>
      <PageHead title="Departments" sub="Deleting a department sets dept_id to NULL on its people and projects rather than deleting them." />
      <div className="grid-3">
        {DB.departments.map(d => (
          <section className="panel" key={d.dept_id}>
            <div className="panel-body">
              <h2 style={{ fontSize: "var(--fs-m)", fontWeight: 800, letterSpacing: "-0.01em" }}>{d.dept_name}</h2>
              <p style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginBottom: 14 }}>{d.location}, since {new Date(d.established_date).getFullYear()}</p>
              <dl className="dl">
                <dt>Annual budget</dt><dd>{inr(d.annual_budget)}</dd>
                <dt>People</dt><dd>{DB.users.filter(u => u.dept_id === d.dept_id).length}</dd>
                <dt>Active projects</dt><dd>{DB.projects.filter(p => p.department_id === d.dept_id && p.status === "Active").length}</dd>
              </dl>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────
export function Analytics({ user }) {
  useEffect(() => { logSQL(`SELECT * FROM Admin_Analytics_View;`, "Cross-department aggregates"); }, []);
  if (user.role !== "Admin") return <p className="empty">Analytics is only available to admin_role.</p>;
  const total = DB.grants.reduce((s, g) => s + Number(g.total_amount_awarded), 0);
  const depts = DB.departments.map(d => {
    const projects = DB.projects.filter(p => p.department_id === d.dept_id);
    const funding = projects.map(p => DB.grants.find(g => g.grant_id === p.grant_id)).filter(Boolean).reduce((s, g) => s + Number(g.total_amount_awarded), 0);
    const outputs = DB.research_outputs.filter(o => projects.some(p => p.project_id === o.project_id)).length;
    return { ...d, funding, projects: projects.length, outputs };
  }).sort((a, b) => b.funding - a.funding);
  const maxF = Math.max(1, ...depts.map(d => d.funding));
  const cats = ["Equipment", "Travel", "Manpower", "Consumables"].map(cat => {
    const heads = DB.budget_heads.filter(b => b.category === cat);
    return { cat, spent: heads.reduce((s, b) => s + Number(b.spent_amount), 0), alloc: heads.reduce((s, b) => s + Number(b.allocated_amount), 0) };
  });
  const maxA = Math.max(1, ...cats.map(c => c.alloc));

  return (
    <div>
      <PageHead title="Analytics" sub="Read from Admin_Analytics_View, which groups grants, projects and outputs by department." />
      <div className="figures">
        <Figure value={inrShort(total)} label="Awarded across grants" sub={inr(total)} />
        <Figure value={DB.projects.filter(p => p.status === "Active").length} label="Active projects" />
        <Figure value={DB.users.filter(u => u.role === "PI").length} label="Principal investigators" />
        <Figure value={DB.research_outputs.length} label="Research outputs" />
      </div>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>Funding by department</h2><span>SUM(total_amount_awarded) GROUP BY dept</span></div>
          <div className="panel-body">
            {depts.map(d => (
              <div key={d.dept_id} className="hbar">
                <div className="meter-line"><strong>{d.dept_name}</strong><span>{inr(d.funding)}</span></div>
                <div className="hbar-track"><i style={{ width: `${(d.funding / maxF) * 100}%` }} /></div>
                <div className="meter-line" style={{ marginTop: 4 }}><span>{d.projects} projects, {d.outputs} outputs</span></div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Spending by category</h2><span>bar = allocated, fill = spent</span></div>
          <div className="panel-body">
            {cats.map(c => (
              <div key={c.cat} className="hbar">
                <div className="meter-line"><strong>{c.cat}</strong><span>{inr(c.spent)} of {inr(c.alloc)}</span></div>
                <div className="hbar-track" style={{ width: `${(c.alloc / maxA) * 100}%` }}>
                  <i style={{ width: `${c.alloc ? (c.spent / c.alloc) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
