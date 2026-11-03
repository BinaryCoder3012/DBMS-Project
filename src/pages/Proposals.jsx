/**
 * Proposals, the start of workflow W1.
 *   A PI drafts and submits a proposal; active_project_limit_pi and the CHECK
 *   constraints guard the insert.
 *   A grant officer reviews it, then rejects it or awards a grant. The award is
 *   one transaction over Proposal, Grant_, Project and BudgetHead.
 */

import { useMemo, useState } from "react";
import { api } from "../api.js";
import { DB, initDB, logSQL, inr, fmtDate, fullName } from "../lib/db.js";
import { Status, PageHead, Notice, Modal } from "../components/ui.jsx";

const LIFECYCLE = ["Draft", "Submitted", "Under Review", "Approved", "Rejected"];
const EMPTY = { title: "", abstract: "", total_budget_requested: "", duration_months: "" };
const HEAD_SPLIT = [["Equipment", 0.4], ["Travel", 0.1], ["Manpower", 0.35], ["Consumables", 0.15]];

// Prefills the award form from what the proposal asked for.
function awardDraft(p) {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + Number(p.duration_months));
  const iso = d => d.toISOString().split("T")[0];
  return {
    proposal: p, funding_agency: "", agency_contact_info: "", reporting_frequency: "Quarterly",
    start_date: iso(start), end_date: iso(end),
    heads: HEAD_SPLIT.map(([category, share]) => ({ category, allocated_amount: Math.round(p.total_budget_requested * share) })),
  };
}

export default function Proposals({ user }) {
  const [proposals, setProposals] = useState(DB.proposals);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState(null);
  const [q, setQ] = useState("");
  const [fresh, setFresh] = useState(null);
  const [award, setAward] = useState(null);
  const [busy, setBusy] = useState(false);
  const canEdit = user.role === "PI" || user.role === "Admin";
  const isOffice = user.role === "Grant_Officer" || user.role === "Admin";

  const mine = isOffice ? proposals : proposals.filter(p => p.pi_id === user.user_id);
  const shown = useMemo(() => mine
    .filter(p => !filter || p.status === filter)
    .filter(p => !q || (p.title + " " + (p.abstract || "")).toLowerCase().includes(q.toLowerCase())),
  [mine, filter, q]);

  // Runs a write against MySQL, then reloads the screen from what it stored.
  async function write(call) {
    setBusy(true);
    try {
      const result = await call();
      await initDB();
      setProposals(DB.proposals);
      return result ?? true;
    } catch (err) {
      setMsg({ tone: "bad", title: "MySQL refused this.", text: err.message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    logSQL(`INSERT INTO Proposal (title, abstract, total_budget_requested, duration_months, submission_date, status, eligibility_check_passed, pi_id)\nVALUES ('${form.title}', '...', ${form.total_budget_requested}, ${form.duration_months}, CURDATE(), 'Draft', TRUE, ${user.user_id});\n-- BEFORE INSERT: active_project_limit_pi`, "New proposal insert");
    const saved = () => {
      setMsg({ tone: "good", title: "Proposal saved as a draft.", text: "Submit it when it is ready for review." });
      setShowForm(false);
      setForm(EMPTY);
    };

    if (DB.live) {
      const result = await write(() => api.createProposal({
        title: form.title, abstract: form.abstract,
        total_budget_requested: Number(form.total_budget_requested),
        duration_months: Number(form.duration_months), pi_id: user.user_id,
      }));
      if (result) { setFresh(result.proposal_id); saved(); } else setShowForm(false);
      return;
    }

    // Offline preview: mirror the database's checks on the local copy.
    const activeCount = DB.projects.filter(p => p.pi_id === user.user_id && p.status === "Active").length;
    if (activeCount >= 5) {
      setMsg({ tone: "bad", title: "MySQL would refuse this.", text: "ERR-PI001: PI already has 5 active projects; cannot submit new proposal" });
      setShowForm(false); return;
    }
    if (!form.title || !(Number(form.total_budget_requested) > 0) || !(Number(form.duration_months) > 0)) {
      setMsg({ tone: "bad", title: "MySQL would refuse this.", text: "The title can't be empty, and budget and duration must be more than zero (chk_proposal_budget, chk_proposal_duration)." });
      setShowForm(false); return;
    }
    const np = { proposal_id: proposals.length + 1, ...form, total_budget_requested: Number(form.total_budget_requested), duration_months: Number(form.duration_months), submission_date: new Date().toISOString().split("T")[0], status: "Draft", eligibility_check_passed: true, pi_id: user.user_id };
    DB.proposals.push(np);
    setProposals([...DB.proposals]);
    setFresh(np.proposal_id);
    saved();
  }

  async function move(p, status) {
    logSQL(`UPDATE Proposal SET status='${status}' WHERE proposal_id=${p.proposal_id};`, "Proposal life cycle");
    if (DB.live) {
      if (await write(() => api.setProposalStatus(p.proposal_id, status))) {
        setMsg({ tone: status === "Rejected" ? "" : "good", title: `Moved to ${status}.`, text: p.title });
      }
      return;
    }
    Object.assign(DB.proposals.find(x => x.proposal_id === p.proposal_id), { status });
    setProposals([...DB.proposals]);
    setMsg({ tone: "", title: `Moved to ${status}.`, text: p.title });
  }

  async function confirmAward() {
    const { proposal, heads, ...fields } = award;
    logSQL(`START TRANSACTION;\nSELECT status FROM Proposal WHERE proposal_id=${proposal.proposal_id} FOR UPDATE;\nINSERT INTO Grant_ (...) VALUES (...);\nINSERT INTO Project (...) VALUES (...);\nINSERT INTO BudgetHead (...) VALUES (...); -- one per category\nUPDATE Proposal SET status='Approved' WHERE proposal_id=${proposal.proposal_id};\nCOMMIT;`, "W1: multi-table award transaction");
    const result = await write(() => api.awardGrant({
      proposal_id: proposal.proposal_id, ...fields,
      budget_heads: heads.filter(h => Number(h.allocated_amount) !== 0),
    }));
    setAward(null);
    if (result) setMsg({ tone: "good", title: `Grant awarded, ${inr(result.total)} in total.`, text: "The proposal, grant, project and budget heads were written in one committed transaction." });
  }

  return (
    <div>
      <PageHead title="Proposals" sub="Each proposal moves through five states, stored as an ENUM on Proposal.status.">
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
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {p.status === "Draft" && canEdit && <button className="btn btn-sm" disabled={busy} onClick={() => move(p, "Submitted")}>Submit for review</button>}
                  {p.status === "Submitted" && isOffice && <button className="btn btn-sm" disabled={busy} onClick={() => move(p, "Under Review")}>Start review</button>}
                  {["Submitted", "Under Review"].includes(p.status) && isOffice && DB.live && <button className="btn btn-green btn-sm" disabled={busy} onClick={() => setAward(awardDraft(p))}>Award grant</button>}
                  {["Submitted", "Under Review"].includes(p.status) && isOffice && <button className="btn btn-red btn-sm" disabled={busy} onClick={() => move(p, "Rejected")}>Reject</button>}
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
            <button className="btn btn-ink" disabled={busy} onClick={submit}>Save draft</button>
          </div>
        </Modal>
      )}

      {award && (
        <Modal title="Award a grant" onClose={() => setAward(null)}>
          <p style={{ color: "var(--ink-2)", marginBottom: 14 }}><strong style={{ color: "var(--ink)" }}>{award.proposal.title}</strong> asked for {inr(award.proposal.total_budget_requested)}.</p>
          <div className="field-row">
            <label className="field"><span>Funding agency</span>
              <input className="input" autoFocus value={award.funding_agency} onChange={e => setAward({ ...award, funding_agency: e.target.value })} placeholder="Dept. of Science & Technology" />
            </label>
            <label className="field"><span>Agency contact</span>
              <input className="input" value={award.agency_contact_info} onChange={e => setAward({ ...award, agency_contact_info: e.target.value })} placeholder="grants@dst.gov.in" />
            </label>
          </div>
          <div className="field-row">
            <label className="field"><span>Start date</span>
              <input className="input" type="date" value={award.start_date} onChange={e => setAward({ ...award, start_date: e.target.value })} />
            </label>
            <label className="field"><span>End date</span>
              <input className="input" type="date" value={award.end_date} onChange={e => setAward({ ...award, end_date: e.target.value })} />
            </label>
          </div>
          <div className="field-row">
            {award.heads.slice(0, 2).map(h => <HeadInput key={h.category} head={h} award={award} setAward={setAward} />)}
          </div>
          <div className="field-row">
            {award.heads.slice(2).map(h => <HeadInput key={h.category} head={h} award={award} setAward={setAward} />)}
          </div>
          <div className="modal-checks">
            One transaction writes <code>Grant_</code>, <code>Project</code> and <code>BudgetHead</code> and approves the proposal. If any row is refused, none of them stay.
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setAward(null)}>Cancel</button>
            <button className="btn btn-green" disabled={busy} onClick={confirmAward}>Award {inr(award.heads.reduce((t, h) => t + Number(h.allocated_amount), 0))}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function HeadInput({ head, award, setAward }) {
  const change = value => setAward({
    ...award,
    heads: award.heads.map(h => h.category === head.category ? { ...h, allocated_amount: value } : h),
  });
  return (
    <label className="field"><span>{head.category} (₹)</span>
      <input className="input" type="number" value={head.allocated_amount} onChange={e => change(e.target.value)} />
    </label>
  );
}
