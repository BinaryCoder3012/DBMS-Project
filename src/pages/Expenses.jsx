// Real-time budget balance validation and SQLSTATE 45000 alert handling
/**
 * Expenses. Two workflows meet here:
 *   PI logs an expense  → balance_check_before_expense may refuse it
 *   Officer approves it → Expense and BudgetHead change in one transaction
 */

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { api } from "../api.js";
import { DB, logSQL, inr, fmtDate } from "../lib/db.js";
import { Status, PageHead, Notice, Modal } from "../components/ui.jsx";

const FILTERS = ["All", "Pending", "Approved", "Rejected"];

export default function Expenses({ user }) {
  const [expenses, setExpenses] = useState([...DB.expenses]);
  const [budgetHeads, setBudgetHeads] = useState([...DB.budget_heads]);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState("All");
  const [acted, setActed] = useState(null);
  const projectOptions = user.role === "Admin" ? DB.projects : DB.projects.filter(p => p.pi_id === user.user_id);
  const firstProject = projectOptions[0]?.project_id ?? 1;
  const firstHead = budgetHeads.find(b => b.project_id === firstProject)?.budgethead_id ?? 1;
  const [form, setForm] = useState({ project_id: firstProject, budgethead_id: firstHead, amount: "", description: "", receipt_reference: "" });
  const table = useRef(null);

  const canApprove = user.role === "Grant_Officer" || user.role === "Admin";
  const canCreate = user.role === "PI" || user.role === "Admin";

  const visible = canApprove
    ? expenses
    : expenses.filter(e => DB.projects.find(p => p.project_id === e.project_id && p.pi_id === user.user_id));
  const shown = visible.filter(e => filter === "All" || e.status === filter);

  useGSAP(() => {
    if (!acted) return;
    gsap.from(`[data-stamp="${acted}"]`, { scale: 2.6, rotate: -24, autoAlpha: 0, duration: 0.45, ease: "back.out(2.2)" });
  }, { dependencies: [acted], scope: table });

  function approve(id) {
    const exp = expenses.find(e => e.expense_id === id);
    api.approveExpense(id, user.user_id).catch(() => {});
    logSQL(`BEGIN;\nUPDATE Expense SET status='Approved', approved_by=${user.user_id}, approval_date=NOW() WHERE expense_id=${id};\nUPDATE BudgetHead SET spent_amount=spent_amount+${exp.amount}, remaining_balance=remaining_balance-${exp.amount} WHERE budgethead_id=${exp.budgethead_id};\nCOMMIT;`, "ACID: Expense approval transaction");
    // Update the shared copy first so every screen sees the new balance,
    // then mirror it into local state.
    const dbExp = DB.expenses.find(e => e.expense_id === id);
    if (dbExp) Object.assign(dbExp, { status: "Approved", approved_by: user.user_id });
    const dbHead = DB.budget_heads.find(b => b.budgethead_id === exp.budgethead_id);
    if (dbHead) Object.assign(dbHead, { spent_amount: Number(dbHead.spent_amount) + Number(exp.amount), remaining_balance: Number(dbHead.remaining_balance) - Number(exp.amount) });
    setExpenses(prev => prev.map(e => e.expense_id === id ? { ...e, status: "Approved", approved_by: user.user_id } : e));
    setBudgetHeads(DB.budget_heads.map(b => ({ ...b })));
    setActed(id);
    setMsg({ tone: "good", title: `Expense ${exp.receipt_reference || "#" + id} approved.`, text: "The expense and its budget head were updated in one committed transaction." });
  }

  function reject(id) {
    api.rejectExpense(id).catch(() => {});
    logSQL(`UPDATE Expense SET status='Rejected' WHERE expense_id=${id};`, "Reject expense");
    setExpenses(prev => prev.map(e => e.expense_id === id ? { ...e, status: "Rejected" } : e));
    const dbExp = DB.expenses.find(e => e.expense_id === id);
    if (dbExp) dbExp.status = "Rejected";
    setActed(id);
    setMsg({ tone: "", title: `Expense #${id} rejected.`, text: "No money moved. The budget head is unchanged." });
  }

  function submitExpense() {
    const bh = budgetHeads.find(b => b.budgethead_id === Number(form.budgethead_id));
    const amt = Number(form.amount);
    logSQL(`SELECT remaining_balance FROM BudgetHead WHERE budgethead_id=${form.budgethead_id};\n-- Returns: ${bh?.remaining_balance}`, "Trigger: balance_check_before_expense");
    if (!bh || amt > Number(bh.remaining_balance)) {
      setMsg({ tone: "bad", title: "Refused by balance_check_before_expense.", text: `You asked for ${inr(amt)} but only ${inr(bh?.remaining_balance || 0)} is left in ${bh?.category || "this head"}. Lower the amount or charge a different head.` });
      setShowForm(false); return;
    }
    if (!(amt > 0) || !form.description.trim()) {
      setMsg({ tone: "bad", title: "Refused by a CHECK constraint.", text: "The amount must be more than zero (chk_expense_amount) and the expense needs a description." });
      return;
    }
    const ne = { expense_id: expenses.length + 1, ...form, amount: amt, budgethead_id: Number(form.budgethead_id), date: new Date().toISOString().split("T")[0], status: "Pending", approved_by: null };
    logSQL(`INSERT INTO Expense (project_id, budgethead_id, amount, description, receipt_reference, status, date)\nVALUES (${form.project_id}, ${form.budgethead_id}, ${amt}, '${form.description}', '${form.receipt_reference}', 'Pending', NOW());`, "Insert expense");
    api.createExpense({
      project_id: ne.project_id, budgethead_id: ne.budgethead_id,
      amount: ne.amount, description: ne.description, receipt_reference: ne.receipt_reference,
    }).catch(() => {});
    DB.expenses.push(ne);
    setExpenses([...DB.expenses]);
    setMsg({ tone: "good", title: "Expense logged.", text: "It now waits for a grant officer to approve it." });
    setShowForm(false);
  }

  const headOptions = budgetHeads.filter(b => b.project_id === Number(form.project_id));
  const pendingTotal = visible.filter(e => e.status === "Pending").reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <PageHead
        title={canApprove ? "Expense approvals" : "Expenses"}
        sub={`${visible.filter(e => e.status === "Pending").length} waiting, worth ${inr(pendingTotal)}. Every new expense is checked against what's left in its budget head.`}
      >
        {canCreate && <button className="btn btn-ink" onClick={() => setShowForm(true)}>Log an expense</button>}
      </PageHead>

      {user.role === "Grant_Officer" && !msg && <Notice tone="wait" title="You can approve and reject.">grant_officer_role has <code>SELECT, UPDATE</code> on Expense. It cannot create users or tables.</Notice>}
      {msg && <Notice tone={msg.tone} title={msg.title} onClose={() => setMsg(null)}>{msg.text}</Notice>}

      <div className="tabs" role="tablist">
        {FILTERS.map(f => (
          <button key={f} role="tab" className="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
            {f} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{f === "All" ? visible.length : visible.filter(e => e.status === f).length}</span>
          </button>
        ))}
      </div>

      <section className="panel" ref={table}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Receipt</th><th>What it was for</th><th>Project and head</th><th className="num">Amount</th><th>Date</th><th>Status</th>{canApprove && <th></th>}</tr>
            </thead>
            <tbody>
              {shown.map(e => {
                const proj = DB.projects.find(p => p.project_id === e.project_id);
                const head = budgetHeads.find(b => b.budgethead_id === e.budgethead_id);
                return (
                  <tr key={e.expense_id}>
                    <td className="nowrap"><code style={{ fontSize: 12 }}>{e.receipt_reference || `#${e.expense_id}`}</code></td>
                    <td><div className="cell-title">{e.description}</div></td>
                    <td><div>{proj?.project_title}</div><div className="cell-sub">{head?.category}{head ? `, ${inr(head.remaining_balance)} left` : ""}</div></td>
                    <td className="num" style={{ fontWeight: 700 }}>{inr(e.amount)}</td>
                    <td className="nowrap">{fmtDate(e.date)}</td>
                    <td><Status value={e.status} /></td>
                    {canApprove && (
                      <td className="nowrap" style={{ textAlign: "right" }}>
                        {e.status === "Pending" ? (
                          <span style={{ display: "inline-flex", gap: 6 }}>
                            <button className="btn btn-green btn-sm" onClick={() => approve(e.expense_id)}>Approve</button>
                            <button className="btn btn-red btn-sm" onClick={() => reject(e.expense_id)}>Reject</button>
                          </span>
                        ) : acted === e.expense_id ? (
                          <span data-stamp={e.expense_id} className={`stamp ${e.status === "Rejected" ? "rejected" : ""}`}>{e.status.toUpperCase()}</span>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="empty">{filter === "All" ? "No expenses logged yet." : `No ${filter.toLowerCase()} expenses.`}</p>}
        </div>
      </section>

      {showForm && (
        <Modal title="Log an expense" onClose={() => setShowForm(false)}>
          <label className="field"><span>Project</span>
            <select className="select" value={form.project_id} onChange={e => {
              const pid = Number(e.target.value);
              setForm({ ...form, project_id: pid, budgethead_id: budgetHeads.find(b => b.project_id === pid)?.budgethead_id ?? 1 });
            }}>
              {projectOptions.map(p => <option key={p.project_id} value={p.project_id}>{p.project_title}</option>)}
            </select>
          </label>
          <label className="field"><span>Budget head</span>
            <select className="select" value={form.budgethead_id} onChange={e => setForm({ ...form, budgethead_id: Number(e.target.value) })}>
              {headOptions.map(b => <option key={b.budgethead_id} value={b.budgethead_id}>{b.category}, {inr(b.remaining_balance)} left</option>)}
            </select>
          </label>
          <div className="field-row">
            <label className="field"><span>Amount (₹)</span>
              <input className="input" type="number" min="1" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="150000" />
            </label>
            <label className="field"><span>Receipt reference</span>
              <input className="input" value={form.receipt_reference} onChange={e => setForm({ ...form, receipt_reference: e.target.value })} placeholder="RCP-2025-001" />
              <small>Must be unique. A trigger blocks duplicates.</small>
            </label>
          </div>
          <label className="field"><span>What it was for</span>
            <input className="input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Second batch of solar panels" />
          </label>
          <div className="modal-checks">
            Before the row is written, <code>balance_check_before_expense</code> compares the amount with the head's <code>remaining_balance</code>. Try more than is left to see it refuse.
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-ink" onClick={submitExpense}>Log expense</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
