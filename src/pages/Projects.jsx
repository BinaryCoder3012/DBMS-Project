/**
 * Projects list and detail. The detail screen joins Project with Grant_,
 * BudgetHead, WORKS_ON, Milestone and ResearchOutput.
 */

import { useState } from "react";
import { api } from "../api.js";
import { DB, initDB, logSQL, inr, fmtDate, fullName, notifyLocal } from "../lib/db.js";
import { Status, Meter, Figure, PageHead, Notice, Avatar, Modal } from "../components/ui.jsx";
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
  if (selected) return <ProjectDetail p={selected} user={user} isReadOnly={isReadOnly} onBack={() => { setSelectedId(null); clearFocus?.(); }} />;

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

const ROLES_IN_PROJECT = ["Research Assistant", "Team Member", "Lead Researcher"];

function ProjectDetail({ p, user, isReadOnly, onBack }) {
  const canManage = user.role === "Admin" || (user.role === "PI" && p.pi_id === user.user_id);
  const [, setTick] = useState(0);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(sql, live, offline, ok) {
    logSQL(sql, ok.title);
    setBusy(true);
    try {
      if (DB.live) { await live(); await initDB(); }
      else { const refusal = offline(); if (refusal) { setMsg({ tone: "bad", title: "MySQL would refuse this.", text: refusal }); return; } }
      setMsg({ tone: "good", ...ok });
    } catch (err) {
      setMsg({ tone: "bad", title: "MySQL refused this.", text: err.message });
    } finally { setBusy(false); setTick(t => t + 1); }
  }

  function addMember() {
    const f = { user_id: Number(form.user_id), role_in_project: form.role_in_project, hours_per_week: Number(form.hours_per_week) || null, stipend_amount: Number(form.stipend_amount) || 0 };
    const who = DB.users.find(u => u.user_id === f.user_id);
    run(`INSERT INTO WORKS_ON (user_id, project_id, role_in_project, hours_per_week, stipend_amount)\nVALUES (${f.user_id}, ${p.project_id}, '${f.role_in_project}', ${f.hours_per_week}, ${f.stipend_amount});`,
      () => api.addTeamMember(p.project_id, f),
      () => {
        if (!f.user_id) return "Choose a person.";
        if (DB.works_on.some(w => w.user_id === f.user_id && w.project_id === p.project_id)) return `Duplicate entry '${f.user_id}-${p.project_id}' for key 'WORKS_ON.PRIMARY'.`;
        DB.works_on.push({ ...f, project_id: p.project_id });
        notifyLocal([f.user_id], `You were added to the project "${p.project_title}".`);
      },
      { title: "Added to the team.", text: `${fullName(who)} now sees this project.` });
    setForm(null);
  }

  function removeMember(w) {
    const who = DB.users.find(u => u.user_id === w.user_id);
    run(`DELETE FROM WORKS_ON WHERE project_id=${p.project_id} AND user_id=${w.user_id};`,
      () => api.removeTeamMember(p.project_id, w.user_id),
      () => { DB.works_on.splice(DB.works_on.findIndex(x => x.user_id === w.user_id && x.project_id === p.project_id), 1); },
      { title: "Removed from the team.", text: fullName(who) });
  }

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

      {msg && <Notice tone={msg.tone} title={msg.title} onClose={() => setMsg(null)}>{msg.text}</Notice>}
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
          <div className="panel-head"><h2>Team</h2>{canManage
            ? <button className="btn btn-sm" onClick={() => setForm({ user_id: "", role_in_project: "Research Assistant", hours_per_week: "10", stipend_amount: "" })}>Add team member</button>
            : <span>WORKS_ON</span>}</div>
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
                  <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                    {!isReadOnly && <span style={{ fontWeight: 600 }}>{Number(w.stipend_amount) ? `${inr(w.stipend_amount)} a month` : "No stipend"}</span>}
                    {canManage && w.user_id !== p.pi_id && <button className="btn btn-sm" disabled={busy} onClick={() => removeMember(w)}>Remove</button>}
                  </span>
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

      {form && (
        <Modal title="Add a team member" onClose={() => setForm(null)}>
          <label className="field"><span>Person</span>
            <select className="select" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}>
              <option value="">Choose a student or researcher</option>
              {DB.users.filter(u => ["Student", "PI"].includes(u.role) && !team.some(w => w.user_id === u.user_id))
                .map(u => <option key={u.user_id} value={u.user_id}>{fullName(u)} ({u.role === "PI" ? "PI" : "Student"})</option>)}
            </select>
          </label>
          <label className="field"><span>Role in project</span>
            <select className="select" value={form.role_in_project} onChange={e => setForm({ ...form, role_in_project: e.target.value })}>
              {ROLES_IN_PROJECT.map(r => <option key={r}>{r}</option>)}
            </select>
          </label>
          <div className="field-row">
            <label className="field"><span>Hours a week</span><input className="input" type="number" min="1" value={form.hours_per_week} onChange={e => setForm({ ...form, hours_per_week: e.target.value })} /></label>
            <label className="field"><span>Monthly stipend</span><input className="input" type="number" min="0" value={form.stipend_amount} onChange={e => setForm({ ...form, stipend_amount: e.target.value })} /></label>
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-ink" disabled={busy || !form.user_id} onClick={addMember}>Add to team</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
