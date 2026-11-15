/**
 * Read screens: grants, milestones, research outputs, people, departments
 * and the admin analytics built on Admin_Analytics_View.
 */

import { useEffect, useState } from "react";
import { api } from "../api.js";
import { DB, initDB, logSQL, inr, inrShort, fmtDate, daysUntil, fullName } from "../lib/db.js";
import { Status, Figure, PageHead, Avatar, Notice, Modal } from "../components/ui.jsx";
import { ROLES } from "../lib/nav.js";
import { visibleProjects } from "./Dashboard.jsx";

// Runs one write: through the API when live (then reloads from MySQL), or on the
// local copy in the offline preview, where `offline` returns an error text to refuse.
function useWriter() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [, setTick] = useState(0);
  async function run(sql, live, offline, ok) {
    logSQL(sql, ok.title);
    setBusy(true);
    try {
      if (DB.live) { await live(); await initDB(); }
      else {
        const refusal = offline();
        if (refusal) { setMsg({ tone: "bad", title: "MySQL would refuse this.", text: refusal }); return false; }
      }
      setMsg({ tone: "good", ...ok });
      return true;
    } catch (err) {
      setMsg({ tone: "bad", title: "MySQL refused this.", text: err.message });
      return false;
    } finally {
      setBusy(false);
      setTick(t => t + 1);
    }
  }
  return { busy, msg, setMsg, run };
}

const nextId = (rows, key) => Math.max(0, ...rows.map(r => r[key])) + 1;
const today = () => new Date().toISOString().split("T")[0];
const field = (label, input) => <label className="field"><span>{label}</span>{input}</label>;

// Projects a user may add records to: their own as PI, every one as Admin.
const writableProjects = user =>
  user.role === "Admin" ? DB.projects : user.role === "PI" ? DB.projects.filter(p => p.pi_id === user.user_id) : [];

// Two clicks to delete: the first arms the button, the second deletes.
export function DeleteButton({ label = "Delete", onDelete, busy }) {
  const [armed, setArmed] = useState(false);
  return armed
    ? <button className="btn btn-red btn-sm" disabled={busy} onClick={() => { setArmed(false); onDelete(); }} onBlur={() => setArmed(false)} autoFocus>Confirm delete</button>
    : <button className="btn btn-sm" disabled={busy} onClick={() => setArmed(true)}>{label}</button>;
}

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
const EMPTY_MILESTONE = { project_id: "", title: "", due_date: "", priority: "Medium", deliverable_description: "" };

export function Milestones({ user }) {
  const w = useWriter();
  const [form, setForm] = useState(null);
  const writable = writableProjects(user);
  const canWrite = m => writable.some(p => p.project_id === m.project_id);
  const mine = user.role === "Admin" ? DB.projects : visibleProjects(user);
  const miles = DB.milestones
    .filter(m => mine.some(p => p.project_id === m.project_id))
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  const [showDone, setShowDone] = useState(true);
  const shown = miles.filter(m => showDone || m.status !== "Completed");
  return (
    <div>
      <PageHead title="Milestones" sub="Ordered by due date. A nightly event writes a notification 30 days before each one.">
        {writable.length > 0 && <button className="btn btn-ink" onClick={() => setForm({ ...EMPTY_MILESTONE, project_id: writable[0].project_id })}>Add milestone</button>}
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Show completed
        </label>
      </PageHead>
      {w.msg && <Notice tone={w.msg.tone} title={w.msg.title} onClose={() => w.setMsg(null)}>{w.msg.text}</Notice>}
      <section className="panel">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Milestone</th><th>Project</th><th>Due</th><th>Priority</th><th>Status</th><th>Report</th>{writable.length > 0 && <th>Actions</th>}</tr></thead>
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
                    {writable.length > 0 && <td>{canWrite(m) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {m.status !== "Completed" && <button className="btn btn-green btn-sm" disabled={w.busy} onClick={() => setMilestone(m, { status: "Completed" })}>Mark complete</button>}
                      {m.status === "Pending" && <button className="btn btn-sm" disabled={w.busy} onClick={() => setMilestone(m, { status: "Delayed" })}>Mark delayed</button>}
                      {m.status === "Completed" && !m.report_submitted && <button className="btn btn-sm" disabled={w.busy} onClick={() => setMilestone(m, { report_submitted: true })}>Report submitted</button>}
                      {m.status === "Completed" && <button className="btn btn-sm" disabled={w.busy} onClick={() => setMilestone(m, { status: "Pending" })}>Reopen</button>}
                    </div>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty">No milestones to show.</p>}
        </div>
      </section>

      {form && (
        <Modal title="Add a milestone" onClose={() => setForm(null)}>
          {field("Project", <select className="select" value={form.project_id} onChange={e => setForm({ ...form, project_id: Number(e.target.value) })}>
            {writable.map(p => <option key={p.project_id} value={p.project_id}>{p.project_title}</option>)}
          </select>)}
          {field("Title", <input className="input" autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Field trial at 3 village sites" />)}
          <div className="field-row">
            {field("Due date", <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />)}
            {field("Priority", <select className="select" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
              {["High", "Medium", "Low"].map(x => <option key={x}>{x}</option>)}
            </select>)}
          </div>
          {field("Deliverable", <textarea className="textarea" rows={3} value={form.deliverable_description} onChange={e => setForm({ ...form, deliverable_description: e.target.value })} placeholder="What will be handed in" />)}
          <div className="modal-foot">
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-ink" disabled={w.busy} onClick={addMilestone}>Add milestone</button>
          </div>
        </Modal>
      )}
    </div>
  );

  async function addMilestone() {
    const f = { ...form, project_id: Number(form.project_id) };
    await w.run(
      `INSERT INTO Milestone (project_id, title, due_date, deliverable_description, priority, status)\nVALUES (${f.project_id}, '${f.title}', '${f.due_date}', '...', '${f.priority}', 'Pending');`,
      () => api.createMilestone(f),
      () => {
        if (!f.title || !f.due_date) return "A milestone needs a title and a due date (NOT NULL).";
        DB.milestones.push({ milestone_id: nextId(DB.milestones, "milestone_id"), ...f, completion_date: null, status: "Pending", report_submitted: false });
      },
      { title: "Milestone added.", text: f.title });
    setForm(null);
  }

  function setMilestone(m, change) {
    const sql = change.status
      ? `UPDATE Milestone SET status='${change.status}', completion_date=${change.status === "Completed" ? "CURDATE()" : "NULL"}\nWHERE milestone_id=${m.milestone_id};`
      : `UPDATE Milestone SET report_submitted=TRUE WHERE milestone_id=${m.milestone_id};`;
    w.run(sql, () => api.updateMilestone(m.milestone_id, change), () => {
      const row = DB.milestones.find(x => x.milestone_id === m.milestone_id);
      if (change.status) Object.assign(row, { status: change.status, completion_date: change.status === "Completed" ? today() : null });
      if (change.report_submitted) row.report_submitted = true;
    }, { title: change.status ? `Marked ${change.status}.` : "Report recorded as submitted.", text: m.title });
  }
}

// ─── Research outputs ─────────────────────────────────────────
const OUTPUT_TYPES = ["Publication", "Patent", "Prototype", "Report"];
const OUTPUT_STATUS = ["Submitted", "Accepted", "Published"];
const EMPTY_OUTPUT = { project_id: "", type: "Publication", title: "", authors: "", journal_conference: "", publication_date: "", doi: "", status: "Submitted" };

export function Outputs({ user }) {
  const w = useWriter();
  const [form, setForm] = useState(null);
  const [type, setType] = useState("All");
  const writable = writableProjects(user);
  const canWrite = o => writable.some(p => p.project_id === o.project_id);
  // A PI or student sees the outputs of their own projects; the admin sees all.
  const visible = user.role === "Admin" ? DB.research_outputs
    : DB.research_outputs.filter(o => visibleProjects(user).some(p => p.project_id === o.project_id));
  const types = ["All", ...new Set(visible.map(o => o.type))];
  const shown = visible.filter(o => type === "All" || o.type === type);
  return (
    <div>
      <PageHead title="Research outputs" sub="Papers, patents and prototypes, each tied to the project that produced it.">
        {writable.length > 0 && <button className="btn btn-ink" onClick={() => setForm({ ...EMPTY_OUTPUT, project_id: writable[0].project_id })}>Add research output</button>}
      </PageHead>
      {w.msg && <Notice tone={w.msg.tone} title={w.msg.title} onClose={() => w.setMsg(null)}>{w.msg.text}</Notice>}
      <div className="tabs" role="tablist">
        {types.map(t => <button key={t} role="tab" className="tab" aria-selected={type === t} onClick={() => setType(t)}>{t}</button>)}
      </div>
      <section className="panel">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Title and authors</th><th>Project</th><th>Type</th><th>Venue</th><th>DOI</th><th>Date</th><th>Status</th>{writable.length > 0 && <th>Actions</th>}</tr></thead>
            <tbody>
              {shown.map(o => (
                <tr key={o.output_id}>
                  <td><div className="cell-title">{o.title}</div><div className="cell-sub">{o.authors}</div></td>
                  <td>{DB.projects.find(p => p.project_id === o.project_id)?.project_title || "—"}</td>
                  <td>{o.type}</td>
                  <td>{o.journal_conference}</td>
                  <td className="nowrap"><code style={{ fontSize: 12 }}>{o.doi}</code></td>
                  <td className="nowrap">{fmtDate(o.publication_date)}</td>
                  <td><Status value={o.status} /></td>
                  {writable.length > 0 && <td>{canWrite(o) && <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select className="select" style={{ width: "auto", padding: "4px 8px" }} aria-label="Change status" disabled={w.busy} value={o.status} onChange={e => setOutputStatus(o, e.target.value)}>
                      {OUTPUT_STATUS.map(x => <option key={x}>{x}</option>)}
                    </select>
                    <DeleteButton busy={w.busy} onDelete={() => removeOutput(o)} />
                  </div>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty">No outputs recorded yet.</p>}
        </div>
      </section>

      {form && (
        <Modal title="Add a research output" onClose={() => setForm(null)}>
          {field("Project", <select className="select" value={form.project_id} onChange={e => setForm({ ...form, project_id: Number(e.target.value) })}>
            {writable.map(p => <option key={p.project_id} value={p.project_id}>{p.project_title}</option>)}
          </select>)}
          {field("Title", <input className="input" autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Paper, patent or prototype title" />)}
          <div className="field-row">
            {field("Type", <select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{OUTPUT_TYPES.map(x => <option key={x}>{x}</option>)}</select>)}
            {field("Status", <select className="select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{OUTPUT_STATUS.map(x => <option key={x}>{x}</option>)}</select>)}
          </div>
          {field("Authors", <input className="input" value={form.authors} onChange={e => setForm({ ...form, authors: e.target.value })} placeholder="Mehta A., Verma R." />)}
          <div className="field-row">
            {field("Journal / conference", <input className="input" value={form.journal_conference} onChange={e => setForm({ ...form, journal_conference: e.target.value })} />)}
            {field("Date", <input className="input" type="date" value={form.publication_date} onChange={e => setForm({ ...form, publication_date: e.target.value })} />)}
          </div>
          {field("DOI", <input className="input" value={form.doi} onChange={e => setForm({ ...form, doi: e.target.value })} placeholder="10.1109/..." />)}
          <div className="modal-foot">
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-ink" disabled={w.busy} onClick={addOutput}>Add output</button>
          </div>
        </Modal>
      )}
    </div>
  );

  async function addOutput() {
    const f = { ...form, project_id: Number(form.project_id) };
    await w.run(
      `INSERT INTO ResearchOutput (project_id, type, title, authors, publication_date, journal_conference, doi, status)\nVALUES (${f.project_id}, '${f.type}', '${f.title}', ...);`,
      () => api.createOutput(f),
      () => {
        if (!f.title) return "An output needs a title (NOT NULL).";
        DB.research_outputs.push({ output_id: nextId(DB.research_outputs, "output_id"), ...f, publication_date: f.publication_date || null });
      },
      { title: "Research output added.", text: f.title });
    setForm(null);
  }

  function setOutputStatus(o, status) {
    w.run(`UPDATE ResearchOutput SET status='${status}' WHERE output_id=${o.output_id};`,
      () => api.setOutputStatus(o.output_id, status),
      () => { DB.research_outputs.find(x => x.output_id === o.output_id).status = status; },
      { title: `Marked ${status}.`, text: o.title });
  }

  function removeOutput(o) {
    w.run(`DELETE FROM ResearchOutput WHERE output_id=${o.output_id};`,
      () => api.deleteOutput(o.output_id),
      () => { DB.research_outputs.splice(DB.research_outputs.findIndex(x => x.output_id === o.output_id), 1); },
      { title: "Research output deleted.", text: o.title });
  }
}

// ─── People ───────────────────────────────────────────────────
const EMPTY_PERSON = { first_name: "", last_name: "", email: "", password: "", role: "PI", dept_id: "", specialization: "" };

export function People() {
  const w = useWriter();
  const [form, setForm] = useState(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("All");
  const shown = DB.users
    .filter(u => role === "All" || u.role === role)
    .filter(u => !q || (fullName(u) + " " + u.email + " " + (u.specialization || "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHead title="People" sub="One User table; role is the discriminator for the Admin, PI, Grant officer and Student specialisation.">
        <button className="btn btn-ink" onClick={() => setForm(EMPTY_PERSON)}>Add person</button>
      </PageHead>
      {w.msg && <Notice tone={w.msg.tone} title={w.msg.title} onClose={() => w.setMsg(null)}>{w.msg.text}</Notice>}
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

      {form && (
        <Modal title="Add a person" onClose={() => setForm(null)}>
          <div className="field-row">
            {field("First name", <input className="input" autoFocus value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />)}
            {field("Last name", <input className="input" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} />)}
          </div>
          <div className="field-row">
            {field("Email", <input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@university.edu" />)}
            {field("Password", <input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />)}
          </div>
          <div className="field-row">
            {field("Role", <select className="select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>)}
            {field("Department", <select className="select" value={form.dept_id} onChange={e => setForm({ ...form, dept_id: e.target.value })}>
              <option value="">None</option>
              {DB.departments.map(d => <option key={d.dept_id} value={d.dept_id}>{d.dept_name}</option>)}
            </select>)}
          </div>
          {field("Specialisation", <input className="input" value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })} placeholder="Research areas, comma separated" />)}
          <div className="modal-checks">The password is stored as <code>SHA2(password, 256)</code>; <code>email</code> is UNIQUE.</div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-ink" disabled={w.busy} onClick={addPerson}>Add person</button>
          </div>
        </Modal>
      )}
    </div>
  );

  async function addPerson() {
    const f = { ...form, dept_id: form.dept_id ? Number(form.dept_id) : null };
    await w.run(
      `INSERT INTO User (first_name, last_name, email, password_hash, role, dept_id, specialization, hire_date)\nVALUES ('${f.first_name}', '${f.last_name}', '${f.email}', SHA2('***',256), '${f.role}', ${f.dept_id}, '...', CURDATE());`,
      () => api.createUser(f),
      () => {
        if (!f.first_name || !f.last_name || !f.email || !f.password) return "Name, email and password are required (NOT NULL).";
        if (DB.users.some(u => u.email === f.email)) return `Duplicate entry '${f.email}' for key 'User.email'.`;
        DB.users.push({ user_id: nextId(DB.users, "user_id"), ...f, hire_date: today() });
      },
      { title: "Person added.", text: `${f.first_name} ${f.last_name} can now sign in.` });
    setForm(null);
  }
}

// ─── Departments ──────────────────────────────────────────────
const EMPTY_DEPT = { dept_name: "", location: "", annual_budget: "", established_date: "" };

export function Departments() {
  const w = useWriter();
  const [form, setForm] = useState(null);
  return (
    <div>
      <PageHead title="Departments" sub="Deleting a department sets dept_id to NULL on its people and projects rather than deleting them.">
        <button className="btn btn-ink" onClick={() => setForm(EMPTY_DEPT)}>Add department</button>
      </PageHead>
      {w.msg && <Notice tone={w.msg.tone} title={w.msg.title} onClose={() => w.setMsg(null)}>{w.msg.text}</Notice>}
      <div className="grid-3">
        {DB.departments.map(d => (
          <section className="panel" key={d.dept_id}>
            <div className="panel-body">
              <h2 style={{ fontSize: "var(--fs-m)", fontWeight: 800, letterSpacing: "-0.01em" }}>{d.dept_name}</h2>
              <p style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginBottom: 14 }}>{d.location || "No location"}{d.established_date ? `, since ${new Date(d.established_date).getFullYear()}` : ""}</p>
              <dl className="dl">
                <dt>Annual budget</dt><dd>{inr(d.annual_budget)}</dd>
                <dt>People</dt><dd>{DB.users.filter(u => u.dept_id === d.dept_id).length}</dd>
                <dt>Active projects</dt><dd>{DB.projects.filter(p => p.department_id === d.dept_id && p.status === "Active").length}</dd>
              </dl>
              <div style={{ marginTop: 14 }}><DeleteButton label="Delete department" busy={w.busy} onDelete={() => removeDept(d)} /></div>
            </div>
          </section>
        ))}
      </div>

      {form && (
        <Modal title="Add a department" onClose={() => setForm(null)}>
          {field("Name", <input className="input" autoFocus value={form.dept_name} onChange={e => setForm({ ...form, dept_name: e.target.value })} placeholder="Chemical Engineering" />)}
          {field("Location", <input className="input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Block D" />)}
          <div className="field-row">
            {field("Annual budget (₹)", <input className="input" type="number" min="0" value={form.annual_budget} onChange={e => setForm({ ...form, annual_budget: e.target.value })} />)}
            {field("Established", <input className="input" type="date" value={form.established_date} onChange={e => setForm({ ...form, established_date: e.target.value })} />)}
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-ink" disabled={w.busy} onClick={addDept}>Add department</button>
          </div>
        </Modal>
      )}
    </div>
  );

  async function addDept() {
    const f = { ...form, annual_budget: Number(form.annual_budget) || 0 };
    await w.run(`INSERT INTO Department (dept_name, location, annual_budget, established_date)\nVALUES ('${f.dept_name}', '${f.location}', ${f.annual_budget}, '${f.established_date}');`,
      () => api.createDepartment(f),
      () => {
        if (!f.dept_name) return "A department needs a name (NOT NULL).";
        DB.departments.push({ dept_id: nextId(DB.departments, "dept_id"), ...f, established_date: f.established_date || null });
      },
      { title: "Department added.", text: f.dept_name });
    setForm(null);
  }

  function removeDept(d) {
    w.run(`DELETE FROM Department WHERE dept_id=${d.dept_id};\n-- ON DELETE SET NULL on User.dept_id and Project.department_id`,
      () => api.deleteDepartment(d.dept_id),
      () => {
        DB.users.forEach(u => { if (u.dept_id === d.dept_id) u.dept_id = null; });
        DB.projects.forEach(p => { if (p.department_id === d.dept_id) p.department_id = null; });
        DB.departments.splice(DB.departments.findIndex(x => x.dept_id === d.dept_id), 1);
      },
      { title: "Department deleted.", text: `${d.dept_name}. Its people and projects were kept, with no department.` });
  }
}

// ─── Analytics ────────────────────────────────────────────────
export function Analytics({ user }) {
  const [view, setView] = useState(null);
  useEffect(() => {
    logSQL(`SELECT * FROM Admin_Analytics_View;`, "Cross-department aggregates");
    if (DB.live && user.role === "Admin") api.analytics().then(setView).catch(() => {});
  }, [user.role]);
  if (user.role !== "Admin") return <p className="empty">Analytics is only available to admin_role.</p>;
  const total = DB.grants.reduce((s, g) => s + Number(g.total_amount_awarded), 0);
  // Live rows come from the view; the offline preview computes the same figures.
  const depts = (view
    ? view.map(v => ({ dept_id: v.dept_id, dept_name: v.dept_name, funding: v.total_funding, projects: v.total_projects, outputs: v.total_research_outputs }))
    : DB.departments.map(d => {
        const projects = DB.projects.filter(p => p.department_id === d.dept_id);
        const funding = DB.grants.filter(g => projects.some(p => p.grant_id === g.grant_id)).reduce((s, g) => s + Number(g.total_amount_awarded), 0);
        const outputs = DB.research_outputs.filter(o => projects.some(p => p.project_id === o.project_id)).length;
        return { ...d, funding, projects: projects.length, outputs };
      })
  ).sort((a, b) => b.funding - a.funding);
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
