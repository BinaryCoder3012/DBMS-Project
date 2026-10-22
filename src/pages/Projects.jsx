/**
 * Projects list and detail. The detail screen joins Project with Grant_,
 * BudgetHead, WORKS_ON, Milestone and ResearchOutput.
 */

import { useState } from "react";
import { DB, logSQL, inr, fmtDate, fullName } from "../lib/db.js";
import { Status, Meter, Figure, PageHead, Notice, Avatar } from "../components/ui.jsx";
import { visibleProjects, projectMoney, SplitBar } from "./Dashboard.jsx";

export default function Projects({ user, focusId, clearFocus }) {
  const [selectedId, setSelectedId] = useState(focusId || null);
  const [q, setQ] = useState("");
  const isReadOnly = user.role === "Student";
  const mine = visibleProjects(user);

  function openProject(p) {
    logSQL(`SELECT p.*, g.grant_title, g.funding_agency FROM Project p\nLEFT JOIN Grant_ g ON p.grant_id = g.grant_id\nWHERE p.project_id = ${p.project_id};`, "Project detail fetch");
    logSQL(`SELECT bh.* FROM BudgetHead bh WHERE bh.project_id = ${p.project_id};`, "Budget heads");
    setSelectedId(p.project_id);
  }

  const selected = mine.find(p => p.project_id === selectedId);
  if (selected) return <ProjectDetail p={selected} isReadOnly={isReadOnly} onBack={() => { setSelectedId(null); clearFocus?.(); }} />;

  const shown = mine.filter(p => !q || (p.project_title + " " + p.description).toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHead
        title={user.role === "Student" ? "Assigned projects" : user.role === "Admin" ? "Projects" : "My projects"}
        sub="Open a project to see its budget heads, team, milestones and outputs."
      />
      {isReadOnly && <Notice title="Through a view.">Money columns such as stipends and balances are not in <code>Student_Project_View</code>, so they don't appear here.</Notice>}

      <div className="toolbar">
        <input className="input" type="search" placeholder="Search projects (uses IDX_Project_Title_Status)" value={q} onChange={e => setQ(e.target.value)} aria-label="Search projects" />
      </div>

      <section className="panel">
        <div className="panel-flush">
          {shown.map(p => {
            const m = projectMoney(p);
            const pi = DB.users.find(u => u.user_id === p.pi_id);
            return (
              <button key={p.project_id} className="row is-link" onClick={() => openProject(p)} style={{ display: "block", width: "100%", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
                  <span className="row-title" style={{ fontSize: 16 }}>{p.project_title}</span>
                  <Status value={p.status} />
                </div>
                <p style={{ color: "var(--ink-2)", margin: "4px 0 10px", maxWidth: "75ch" }}>{p.description}</p>
                {!isReadOnly && <SplitBar {...m} />}
                <div className="meta" style={{ marginTop: 8 }}>
                  <span>PI {fullName(pi)}</span>
                  {!isReadOnly && <span>{inr(p.current_balance)} balance</span>}
                  <span>{fmtDate(p.start_date)} to {fmtDate(p.end_date)}</span>
                </div>
              </button>
            );
          })}
          {shown.length === 0 && <p className="empty">{mine.length ? "No project matches that search." : "No projects assigned to you yet."}</p>}
        </div>
      </section>
    </div>
  );
}

function ProjectDetail({ p, isReadOnly, onBack }) {
  const heads = DB.budget_heads.filter(b => b.project_id === p.project_id);
  const miles = DB.milestones.filter(m => m.project_id === p.project_id);
  const outputs = DB.research_outputs.filter(o => o.project_id === p.project_id);
  const team = DB.works_on.filter(w => w.project_id === p.project_id);
  const grant = DB.grants.find(g => g.grant_id === p.grant_id);
  const m = projectMoney(p);

  return (
    <div>
      <button className="link-btn" onClick={onBack} style={{ marginBottom: 16 }}>Back to projects</button>
      <PageHead title={p.project_title} sub={p.description}><Status value={p.status} /></PageHead>

      <div className="figures">
        {!isReadOnly && <Figure value={inr(p.current_balance)} label="Current balance" sub="CHECK (current_balance ≥ 0)" />}
        {!isReadOnly && <Figure value={inr(m.alloc - m.spent)} label="Left across heads" sub={`${inr(m.spent)} spent of ${inr(m.alloc)}`} />}
        <Figure value={grant?.funding_agency || "—"} label="Funding agency" sub={grant?.grant_title} />
        <Figure value={fmtDate(p.end_date)} label="Ends" sub={`Started ${fmtDate(p.start_date)}`} />
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {!isReadOnly && (
          <section className="panel">
            <div className="panel-head"><h2>Budget heads</h2><span>remaining = allocated − spent (generated)</span></div>
            <div className="panel-body">
              {heads.map(h => (
                <div key={h.budgethead_id} style={{ marginBottom: 16 }}>
                  <div className="meter-line"><strong>{h.category}</strong><span>{inr(h.spent_amount)} of {inr(h.allocated_amount)}</span></div>
                  <Meter value={Number(h.spent_amount)} max={Number(h.allocated_amount)} />
                  <div className="meter-line" style={{ marginTop: 4 }}><span>{inr(h.remaining_balance)} left</span></div>
                </div>
              ))}
              {heads.length === 0 && <p className="empty" style={{ padding: 0 }}>No budget heads allocated yet.</p>}
            </div>
          </section>
        )}
        <section className="panel">
          <div className="panel-head"><h2>Team</h2><span>WORKS_ON</span></div>
          <div className="panel-flush">
            {team.map(w => {
              const u = DB.users.find(x => x.user_id === w.user_id);
              if (!u) return null;
              return (
                <div key={w.user_id} className="row">
                  <div className="who">
                    <Avatar user={u} />
                    <div><div className="who-name">{fullName(u)}</div><div className="who-sub">{w.role_in_project}, {w.hours_per_week} h a week</div></div>
                  </div>
                  {!isReadOnly && <span style={{ fontWeight: 600 }}>{Number(w.stipend_amount) ? `${inr(w.stipend_amount)} a month` : "No stipend"}</span>}
                </div>
              );
            })}
            {team.length === 0 && <p className="empty">Nobody is assigned to this project yet.</p>}
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head"><h2>Milestones</h2></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Milestone</th><th>Due</th><th>Priority</th><th>Status</th><th>Report</th></tr></thead>
            <tbody>
              {miles.map(ms => (
                <tr key={ms.milestone_id}>
                  <td><div className="cell-title">{ms.title}</div><div className="cell-sub">{ms.deliverable_description}</div></td>
                  <td className="nowrap">{fmtDate(ms.due_date)}</td>
                  <td><Status value={ms.priority} /></td>
                  <td><Status value={ms.status} /></td>
                  <td className="nowrap">{ms.report_submitted ? "Submitted" : <span style={{ color: "var(--ink-3)" }}>Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {miles.length === 0 && <p className="empty">No milestones set.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Research outputs</h2></div>
        <div className="tbl-wrap">
          {outputs.length ? (
            <table className="tbl">
              <thead><tr><th>Title</th><th>Type</th><th>Venue</th><th>DOI</th><th>Status</th></tr></thead>
              <tbody>
                {outputs.map(o => (
                  <tr key={o.output_id}>
                    <td><div className="cell-title">{o.title}</div><div className="cell-sub">{o.authors}</div></td>
                    <td>{o.type}</td>
                    <td>{o.journal_conference}</td>
                    <td className="nowrap"><code style={{ fontSize: 12 }}>{o.doi}</code></td>
                    <td><Status value={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">No outputs linked yet. Papers and patents appear here once they're recorded.</p>}
        </div>
      </section>
    </div>
  );
}
