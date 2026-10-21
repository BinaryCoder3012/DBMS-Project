/**
 * Proposals. Workflow: a PI drafts a proposal; the active_project_limit_pi
 * trigger and the CHECK constraints on budget and duration guard the insert.
 */

import { useMemo, useState } from "react";
import { api } from "../api.js";
import { DB, logSQL, inr, fmtDate, fullName } from "../lib/db.js";
import { Status, PageHead, Notice, Modal } from "../components/ui.jsx";

const LIFECYCLE = ["Draft", "Submitted", "Under Review", "Approved", "Rejected"];
const EMPTY = { title: "", abstract: "", total_budget_requested: "", duration_months: "" };

export default function Proposals({ user }) {
  const [proposals, setProposals] = useState(DB.proposals);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState(null);
  const [q, setQ] = useState("");
  const [fresh, setFresh] = useState(null);
  const canEdit = user.role === "PI" || user.role === "Admin";
  const readOnly = user.role === "Grant_Officer";

  const mine = user.role === "Admin" || readOnly ? proposals : proposals.filter(p => p.pi_id === user.user_id);
  const shown = useMemo(() => mine
    .filter(p => !filter || p.status === filter)
    .filter(p => !q || (p.title + " " + (p.abstract || "")).toLowerCase().includes(q.toLowerCase())),
  [mine, filter, q]);

  function submit() {
    const activeCount = DB.projects.filter(p => p.pi_id === user.user_id && p.status === "Active").length;
    logSQL(`SELECT COUNT(*) FROM Project WHERE pi_id = ${user.user_id} AND status = 'Active';`, "Trigger: active project limit check");
    if (activeCount >= 5) {
      setMsg({ tone: "bad", title: "Refused by active_project_limit_pi.", text: "You already lead five active projects, so a new proposal can't be inserted until one closes." });
      setShowForm(false); return;
    }
    if (!form.title || Number(form.total_budget_requested) <= 0) {
      setMsg({ tone: "bad", title: "Refused by a CHECK constraint.", text: "The title can't be empty and the budget must be more than zero (chk_proposal_budget)." });
      return;
    }
    const np = { proposal_id: proposals.length + 1, ...form, total_budget_requested: Number(form.total_budget_requested), duration_months: Number(form.duration_months), submission_date: new Date().toISOString().split("T")[0], status: "Draft", eligibility_check_passed: true, pi_id: user.user_id };
    logSQL(`INSERT INTO Proposal (title, abstract, total_budget_requested, duration_months, submission_date, status, eligibility_check_passed, pi_id)\nVALUES ('${form.title}', '...', ${form.total_budget_requested}, ${form.duration_months}, NOW(), 'Draft', TRUE, ${user.user_id});`, "New proposal insert");
    api.createProposal({
      title: form.title, abstract: form.abstract,
      total_budget_requested: Number(form.total_budget_requested),
      duration_months: Number(form.duration_months), pi_id: user.user_id,
    }).catch(() => {});
    DB.proposals.push(np);
    setProposals([...DB.proposals]);
    setFresh(np.proposal_id);
    setMsg({ tone: "good", title: "Proposal saved as a draft.", text: "It's at the top of the Draft stage below." });
    setShowForm(false);
    setForm(EMPTY);
  }

  return (
    <div>
      <PageHead title="Proposals" sub={readOnly ? "Read only. grant_officer_role has SELECT on Proposal and nothing else." : "Each proposal moves through five states, stored as an ENUM on Proposal.status."}>
        {canEdit && <button className="btn btn-ink" onClick={() => setShowForm(true)}>Write a proposal</button>}
      </PageHead>

      {msg && <Notice tone={msg.tone} title={msg.title} onClose={() => setMsg(null)}>{msg.text}</Notice>}

      <div className="lifecycle" role="tablist" aria-label="Filter by status">
        <button role="tab" aria-selected={!filter} className="life-step" onClick={() => setFilter(null)}>
          <strong>{mine.length}</strong><span>All</span>
        </button>
        {LIFECYCLE.map(s => (
          <button key={s} role="tab" aria-selected={filter === s} className={`life-step ${s === "Rejected" ? "is-branch" : ""}`} onClick={() => setFilter(filter === s ? null : s)}>
            <strong>{mine.filter(p => p.status === s).length}</strong><span>{s}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input className="input" type="search" placeholder="Search titles and abstracts" value={q} onChange={e => setQ(e.target.value)} aria-label="Search proposals" />
      </div>

      <section className="panel">
        <div className="panel-flush">
          {[...shown].reverse().map(p => {
            const pi = DB.users.find(u => u.user_id === p.pi_id);
            return (
              <article key={p.proposal_id} className={`row ${fresh === p.proposal_id ? "is-new" : ""}`} style={{ display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
                  <h3 className="row-title" style={{ fontSize: 16 }}>{p.title}</h3>
                  <Status value={p.status} />
                </div>
                {p.abstract && <p style={{ color: "var(--ink-2)", margin: "6px 0 10px", maxWidth: "75ch" }}>{p.abstract.length > 200 ? p.abstract.slice(0, 200) + "…" : p.abstract}</p>}
                <div className="meta">
                  <span>{fullName(pi)}</span>
                  <span>{inr(p.total_budget_requested)}</span>
                  <span>{p.duration_months} months</span>
                  <span>Submitted {fmtDate(p.submission_date)}</span>
                  {p.eligibility_check_passed ? <span className="chip green">Eligible</span> : <span className="chip red">Not eligible</span>}
                </div>
              </article>
            );
          })}
          {shown.length === 0 && <p className="empty">{mine.length ? "No proposal matches that filter." : "No proposals yet. Write one to start a grant."}</p>}
        </div>
      </section>

      {showForm && (
        <Modal title="Write a proposal" onClose={() => setShowForm(false)}>
          <label className="field"><span>Title</span>
            <input className="input" autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Smart grid optimisation with reinforcement learning" />
          </label>
          <div className="field-row">
            <label className="field"><span>Budget requested (₹)</span>
              <input className="input" type="number" min="1" value={form.total_budget_requested} onChange={e => setForm({ ...form, total_budget_requested: e.target.value })} placeholder="2500000" />
            </label>
            <label className="field"><span>Duration (months)</span>
              <input className="input" type="number" min="1" value={form.duration_months} onChange={e => setForm({ ...form, duration_months: e.target.value })} placeholder="24" />
            </label>
          </div>
          <label className="field"><span>Abstract</span>
            <textarea className="textarea" rows={4} value={form.abstract} onChange={e => setForm({ ...form, abstract: e.target.value })} placeholder="Objectives, method and expected impact" />
          </label>
          <div className="modal-checks">
            On save the database checks that you lead fewer than five active projects (<code>active_project_limit_pi</code>) and that budget and duration are above zero (<code>chk_proposal_budget</code>, <code>chk_proposal_duration</code>).
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-ink" onClick={submit}>Save draft</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
