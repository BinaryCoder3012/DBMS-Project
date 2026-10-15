/**
 * Shared UI primitives. Each one maps to a kind of database value:
 *   Status  → ENUM status columns (Proposal.status, Expense.status, …)
 *   Meter   → BudgetHead.spent_amount / allocated_amount
 *   Figure  → single aggregate (COUNT, SUM)
 *   Code    → SQL shown exactly as it lives in schema/*.sql
 *   QueryLog→ the SQL each screen ran this session
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { sqlLog, subscribeSQL, initials } from "../lib/db.js";
import { ROLES } from "../lib/nav.js";

gsap.registerPlugin(useGSAP);

// ─── Brand mark: three offset slabs, the same shape as a table in the 3D schema
export function Mark({ size = 26, light = false, label = true }) {
  const ink = light ? "#E3EAE4" : "#1A1E1C";
  return (
    <span className="mark" style={{ color: ink }}>
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect x="3" y="18" width="20" height="9" rx="1.5" fill={light ? "#2E7A5D" : "#1F5C45"} />
        <rect x="6" y="11" width="20" height="9" rx="1.5" fill="none" stroke={ink} strokeWidth="2" />
        <rect x="9" y="4" width="20" height="9" rx="1.5" fill={ink} />
      </svg>
      {label && "UniGrant"}
    </span>
  );
}

// ─── Status: one square swatch, colour carries good / waiting / refused
const TONE = {
  Active: "good", Approved: "good", Completed: "good", Published: "good", Accepted: "good",
  Pending: "wait", "Under Review": "wait", Submitted: "wait", Planning: "wait", "On Hold": "wait", Medium: "wait",
  Rejected: "bad", Delayed: "bad", Suspended: "bad", High: "bad",
  Draft: "quiet", Closed: "quiet", Low: "quiet",
};
export function Status({ value }) {
  return <span className={`status ${TONE[value] || ""}`}>{value}</span>;
}

// ─── Meter
export function Meter({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const cls = pct > 90 ? "over" : pct > 70 ? "warn" : "";
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <i className={cls} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Figure (KPI as type)
export function Figure({ value, label, sub, bad }) {
  return (
    <div className="figure">
      <div className={`figure-value ${bad ? "is-bad" : ""}`}>{value}</div>
      <div className="figure-label">{label}</div>
      {sub && <div className="figure-sub">{sub}</div>}
    </div>
  );
}

// ─── Page header
export function PageHead({ title, sub, children }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

// ─── Notice: RBAC notes and trigger outcomes. A refused write shakes once.
export function Notice({ tone = "", title, children, onClose }) {
  const ref = useRef(null);
  useGSAP(() => {
    if (tone === "bad") gsap.fromTo(ref.current, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1.2, 0.3)" });
    else gsap.from(ref.current, { autoAlpha: 0, y: -6, duration: 0.3, ease: "power2.out" });
  }, { dependencies: [title, tone], scope: ref });
  return (
    <div ref={ref} className={`notice ${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <p>{title && <strong>{title} </strong>}{children}</p>
      {onClose && <button className="notice-close" onClick={onClose} aria-label="Dismiss">×</button>}
    </div>
  );
}

// ─── Avatar: stable pale tint from the person's role
export function Avatar({ user, size }) {
  const r = ROLES[user?.role] || { tint: "#DDE1D8", ink: "#4A524D" };
  return <span className={`avatar ${size || ""}`} style={{ background: r.tint, color: r.ink }}>{initials(user)}</span>;
}

// ─── Modal
export function Modal({ title, onClose, children }) {
  const back = useRef(null);
  useGSAP(() => {
    gsap.from(back.current, { autoAlpha: 0, duration: 0.2 });
    gsap.from(".modal", { y: 24, autoAlpha: 0, duration: 0.35, ease: "power3.out" });
  }, { scope: back });
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div ref={back} className="modal-back" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="notice-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── SQL with light highlighting (keywords, comments, strings, numbers)
const KW = /\b(SELECT|FROM|WHERE|JOIN|LEFT|ON|AND|OR|NOT|IN|AS|GROUP BY|ORDER BY|INSERT INTO|VALUES|UPDATE|SET|DELETE|CREATE|ROLE|VIEW|TRIGGER|PROCEDURE|EVENT|INDEX|FULLTEXT|BEFORE|AFTER|FOR EACH ROW|BEGIN|END|IF|THEN|DECLARE|INTO|SIGNAL|SQLSTATE|MESSAGE_TEXT|GRANT|REVOKE|TO|WITH GRANT OPTION|ALL PRIVILEGES|COUNT|SUM|ROUND|CASE|WHEN|ELSE|DISTINCT|CALL|COMMIT|ROLLBACK|IN NATURAL LANGUAGE MODE|MATCH|AGAINST|ON SCHEDULE|EVERY|STARTS|DO|ALTER TABLE|PARTITION BY RANGE|PARTITION|LESS THAN|MAXVALUE|CONCAT|NOW|CURDATE|INTERVAL|DAY|IS|NULL|DESC|LIMIT|POLICY|USING|EXISTS)\b/g;
function highlight(sql) {
  const out = [];
  sql.split("\n").forEach((line, li) => {
    const ci = line.indexOf("--");
    const code = ci >= 0 ? line.slice(0, ci) : line;
    const parts = code.split(/('[^']*')/g);
    parts.forEach((p, pi) => {
      if (p.startsWith("'")) { out.push(<span key={`${li}-${pi}`} className="st">{p}</span>); return; }
      const bits = p.split(KW);
      bits.forEach((b, bi) => {
        if (!b) return;
        if (bi % 2 === 1) out.push(<span key={`${li}-${pi}-${bi}`} className="kw">{b}</span>);
        else b.split(/(\b\d+(?:\.\d+)?\b)/g).forEach((n, ni) =>
          n && out.push(ni % 2 ? <span key={`${li}-${pi}-${bi}-${ni}`} className="nm">{n}</span> : n));
      });
    });
    if (ci >= 0) out.push(<span key={`${li}-c`} className="cm">{line.slice(ci)}</span>);
    out.push("\n");
  });
  return out;
}
export function Code({ children, style }) {
  return <pre className="code" style={style}><code>{highlight(String(children).trim())}</code></pre>;
}

// ─── Query log dock
export function QueryLog() {
  const [open, setOpen] = useState(false);
  const count = useSyncExternalStore(subscribeSQL, () => sqlLog.length ? sqlLog[0].id : 0);
  const panel = useRef(null);
  useGSAP(() => {
    if (open && panel.current) gsap.from(panel.current, { y: 16, autoAlpha: 0, duration: 0.3, ease: "power3.out" });
  }, { dependencies: [open] });
  return (
    <div className="qlog">
      {open && (
        <div ref={panel} className="qlog-panel" aria-live="polite">
          <div className="qlog-head"><span>SQL run this session, newest first</span><span>{sqlLog.length} of last 30</span></div>
          {sqlLog.length === 0 && <div className="qlog-item">Nothing has run yet.</div>}
          {sqlLog.map((l, i) => (
            <div key={l.id} className={`qlog-item ${i === 0 && count ? "is-fresh" : ""}`}>
              <div className="qlog-meta"><span>{l.time}</span>{l.comment && <span>{l.comment}</span>}</div>
              <pre>{l.query}</pre>
            </div>
          ))}
        </div>
      )}
      <button className="qlog-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? "Hide query log" : "Query log"}
        <span className="qlog-count">{sqlLog.length}</span>
      </button>
    </div>
  );
}
