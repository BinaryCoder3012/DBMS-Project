/**
 * Overview per role. Aggregates mirror the dashboard queries logged below
 * (COUNT of active projects, SUM of awards, milestones due in 30 days).
 */

import { useEffect } from "react";
import { DB, logSQL, inr, inrShort, fmtDate, daysUntil, fullName } from "../lib/db.js";
import { Status, Figure, PageHead, Notice } from "../components/ui.jsx";

export function visibleProjects(user) {
  if (user.role === "PI") return DB.projects.filter(p => p.pi_id === user.user_id);
  if (user.role === "Student") return DB.projects.filter(p => DB.works_on.some(w => w.user_id === user.user_id && w.project_id === p.project_id));
  return DB.projects;
}

export function projectMoney(p) {
  const heads = DB.budget_heads.filter(b => b.project_id === p.project_id);
  const alloc = heads.reduce((s, b) => s + Number(b.allocated_amount), 0);
  const spent = heads.reduce((s, b) => s + Number(b.spent_amount), 0);
  const pending = DB.expenses.filter(e => e.project_id === p.project_id && e.status === "Pending").reduce((s, e) => s + Number(e.amount), 0);
  return { alloc, spent, pending };
}

export function SplitBar({ alloc, spent, pending }) {
  const sp = alloc ? Math.min(100, (spent / alloc) * 100) : 0;
  const pe = alloc ? Math.min(100 - sp, (pending / alloc) * 100) : 0;
  return (
    <div className="split" role="img" aria-label={`${Math.round(sp)}% spent, ${Math.round(pe)}% awaiting approval`}>
      <i className="s-spent" style={{ width: `${sp}%` }} />
      <i className="s-pend" style={{ width: `${pe}%` }} />
    </div>
  );
}

export default function Dashboard({ user, go }) {
  const mine = visibleProjects(user);
  const isAdmin = user.role === "Admin";
  const totalFunding = DB.grants.reduce((s, g) => s + Number(g.total_amount_awarded), 0);
  const pendingExpenses = DB.expenses.filter(e => e.status === "Pending");
  const pendingMilestones = DB.milestones.filter(m => m.status === "Pending" && (isAdmin || user.role === "Grant_Officer" || mine.some(p => p.project_id === m.project_id)));
  const dueSoon = [...pendingMilestones].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  useEffect(() => {
    logSQL(`SELECT COUNT(*) FROM Project WHERE status='Active';\nSELECT SUM(total_amount_awarded) FROM Grant_;\nSELECT * FROM Milestone WHERE status='Pending' AND due_date <= CURDATE() + INTERVAL 30 DAY;`, "Dashboard aggregates");
  }, []);

  const title = isAdmin ? "University overview"
    : user.role === "PI" ? `Prof. ${user.last_name}'s projects`
    : user.role === "Student" ? `${user.first_name}'s assignments`
    : "Approvals and grants";

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <PageHead title={title} sub={today}>
        {user.role === "Grant_Officer" && pendingExpenses.length > 0 && (
          <button className="btn btn-ink" onClick={() => go("expenses")}>Review {pendingExpenses.length} pending</button>
        )}
        {user.role === "PI" && <button className="btn btn-ink" onClick={() => go("proposals")}>Write a proposal</button>}
      </PageHead>

      {user.role === "Grant_Officer" && (
        <Notice tone="wait" title="Grant officer access.">
          You can read proposals and grants, and approve or reject expenses. Creating users is blocked by <code>REVOKE CREATE USER ON *.* FROM grant_officer_role</code>.
        </Notice>
      )}
      {user.role === "Student" && (
        <Notice title="Read-only access.">
          You see projects through <code>Student_Project_View</code>, which only returns rows for projects you work on and hides money columns.
        </Notice>
      )}

      <div className="figures">
        {isAdmin && <>
          <Figure value={DB.projects.filter(p => p.status === "Active").length} label="Active projects" sub="University-wide" />
          <Figure value={inrShort(totalFunding)} label="Awarded across grants" sub={inr(totalFunding)} />
          <Figure value={DB.proposals.length} label="Proposals" sub={`${DB.proposals.filter(p => p.status === "Approved").length} approved`} />
          <Figure value={pendingExpenses.length} label="Expenses waiting" sub="Need a grant officer" />
        </>}
        {user.role === "PI" && <>
          <Figure value={`${mine.filter(p => p.status === "Active").length} of 5`} label="Active projects" sub="Trigger caps a PI at five" />
          <Figure value={inrShort(mine.reduce((s, p) => s + Number(p.current_balance), 0))} label="Balance across projects" />
          <Figure value={pendingMilestones.length} label="Milestones open" />
          <Figure value={DB.research_outputs.filter(o => mine.some(p => p.project_id === o.project_id)).length} label="Research outputs" />
        </>}
        {user.role === "Student" && <>
          <Figure value={mine.length} label="Assigned projects" />
          <Figure value={inr(DB.works_on.filter(w => w.user_id === user.user_id).reduce((s, w) => s + Number(w.stipend_amount), 0))} label="Monthly stipend" />
          <Figure value={pendingMilestones.length} label="Milestones open" />
        </>}
        {user.role === "Grant_Officer" && <>
          <Figure value={pendingExpenses.length} label="Expenses waiting for you" bad={pendingExpenses.length > 0} sub={inr(pendingExpenses.reduce((s, e) => s + Number(e.amount), 0))} />
          <Figure value={DB.grants.filter(g => g.status === "Active").length} label="Active grants" />
          <Figure value={DB.proposals.length} label="Proposals on file" sub="Read only" />
        </>}
      </div>

      <div className="grid-main">
        <section className="panel">
          <div className="panel-head">
            <h2>Where the money is</h2>
            <div className="legend">
              <span><i style={{ background: "var(--green)" }} />Spent</span>
              <span><i style={{ boxShadow: "inset 0 0 0 1px var(--ochre)", background: "repeating-linear-gradient(135deg,var(--ochre) 0 2px,transparent 2px 4px)" }} />Awaiting approval</span>
              <span><i style={{ background: "var(--paper-down)" }} />Left</span>
            </div>
          </div>
          <div className="panel-flush">
            {mine.map(p => {
              const m = projectMoney(p);
              const pi = DB.users.find(u => u.user_id === p.pi_id);
              const dept = DB.departments.find(d => d.dept_id === p.department_id);
              return (
                <div key={p.project_id} className="row is-link" onClick={() => go("projects", p.project_id)} style={{ display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
                    <div className="row-main">
                      <div className="row-title">{p.project_title}</div>
                      <div className="row-sub">{fullName(pi)}, {dept?.dept_name}</div>
                    </div>
                    <Status value={p.status} />
                  </div>
                  {user.role !== "Student" && <>
                    <SplitBar {...m} />
                    <div className="meter-line" style={{ marginTop: 6 }}>
                      <span>{inr(m.spent)} spent{m.pending ? `, ${inr(m.pending)} waiting` : ""}</span>
                      <span>{inr(m.alloc - m.spent)} left of {inr(m.alloc)}</span>
                    </div>
                  </>}
                </div>
              );
            })}
            {mine.length === 0 && <p className="empty">No projects yet. Projects appear here once a proposal is funded.</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2>Due next</h2><span>milestone_30day_alert runs nightly</span></div>
          <div className="panel-flush">
            {dueSoon.slice(0, 6).map(m => {
              const proj = DB.projects.find(p => p.project_id === m.project_id);
              const days = daysUntil(m.due_date);
              return (
                <div key={m.milestone_id} className="row">
                  <div className="row-main">
                    <div className="row-title">{m.title}</div>
                    <div className="row-sub">{proj?.project_title}, due {fmtDate(m.due_date)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: days < 0 ? "var(--red)" : days <= 30 ? "var(--ochre)" : "var(--ink-2)" }}>
                      {days > 0 ? `${days} days` : days === 0 ? "Today" : `${-days} days late`}
                    </div>
                    <Status value={m.priority} />
                  </div>
                </div>
              );
            })}
            {dueSoon.length === 0 && <p className="empty">Nothing open. Every milestone is complete.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
