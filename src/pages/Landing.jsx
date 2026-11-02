/**
 * Landing and sign-in.
 *
 * The hero is the schema itself (SchemaScene). Below it, one expense is
 * followed through the real sequence of rows, triggers and the approval
 * transaction, pinned while the reader scrolls.
 */

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import SchemaScene from "../components/SchemaScene.jsx";
import { Mark, Code, Avatar } from "../components/ui.jsx";
import { api } from "../api.js";
import { DB, initDB, logSQL, inr } from "../lib/db.js";
import { RULES, MONEY_PATH, RELATIONS } from "../lib/schema.js";
import { ENTITIES, RELATIONSHIPS } from "../lib/chen.js";
import { DEMO_ACCOUNTS, ROLES } from "../lib/nav.js";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// The expense story uses the Consumables head of project 1 from the seed data.
const HEAD = { project: "Solar-Wind Hybrid Grid", category: "Consumables", allocated: 400000, spent: 165000 };

const STEPS = [
  {
    title: "A proposal is approved",
    body: "Prof. Mehta's proposal for a solar-wind grid in rural Rajasthan moves from Under Review to Approved. The status column is an ENUM, so no other value can be written.",
    rel: ["Proposal"],
    sql: `UPDATE Proposal\nSET status = 'Approved'\nWHERE proposal_id = 1;`,
    ledger: { spent: 0, alloc: 0, phase: "proposal" },
  },
  {
    title: "The grant is awarded",
    body: "A Grant_ row points back at the proposal. CHECK constraints make sure the award is positive and ends after it starts.",
    rel: ["Proposal", "Grant_"],
    sql: `INSERT INTO Grant_ (grant_title, total_amount_awarded,\n  start_date, end_date, proposal_id)\nVALUES ('DST Solar Mission Grant 2024', 2500000,\n  '2024-04-01', '2026-03-31', 1);`,
    ledger: { spent: 0, alloc: 0, phase: "grant" },
  },
  {
    title: "Money is split into budget heads",
    body: "The project gets four heads. remaining_balance is a generated column, so it is always allocated minus spent and can never drift.",
    rel: ["Grant_", "Project", "BudgetHead"],
    sql: `INSERT INTO BudgetHead (project_id, category, allocated_amount)\nVALUES (1, 'Consumables', 400000);\n-- remaining_balance GENERATED ALWAYS AS\n--   (allocated_amount - spent_amount) STORED`,
    ledger: { spent: HEAD.spent, alloc: HEAD.allocated, phase: "heads" },
  },
  {
    title: "An expense asks for too much",
    body: "The PI logs ₹2,80,000 of battery stock against Consumables. Only ₹2,35,000 is left, so the trigger raises SQLSTATE 45000 and the row is never written.",
    rel: ["BudgetHead", "Expense"],
    sql: `INSERT INTO Expense (project_id, budgethead_id, amount, ...)\nVALUES (1, 4, 280000, ...);\n-- balance_check_before_expense:\n-- ERR: Insufficient budget balance in this head`,
    ledger: { spent: HEAD.spent, alloc: HEAD.allocated, ask: 280000, phase: "refused" },
  },
  {
    title: "A smaller claim is approved in one transaction",
    body: "₹1,20,000 fits. The grant officer approves it, and the expense and its budget head change together or not at all.",
    rel: MONEY_PATH,
    sql: `START TRANSACTION;\nUPDATE Expense SET status = 'Approved', approved_by = 4\nWHERE expense_id = 6;\nUPDATE BudgetHead SET spent_amount = spent_amount + 120000\nWHERE budgethead_id = 4;\nCOMMIT;`,
    ledger: { spent: HEAD.spent + 120000, alloc: HEAD.allocated, ask: 120000, phase: "approved" },
  },
];

export default function Landing({ onLogin }) {
  const root = useRef(null);
  const [step, setStep] = useState(0);
  const [heroRel, setHeroRel] = useState([]);

  useGSAP(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      // The one load sequence: title lines lift out of a mask, then the rest.
      gsap.timeline({ delay: 0.25 })
        .from(".hero-line > span", { yPercent: 110, duration: 1.1, ease: "power4.out", stagger: 0.12 })
        .from(".hero-copy, .hero-cta", { autoAlpha: 0, y: 12, duration: 0.6, stagger: 0.08 }, "-=0.5")
        .from(".hero-caption", { autoAlpha: 0, duration: 0.8 }, "-=0.2");
    }

    // Follow-one-expense: each step sets which part of the ledger is shown.
    gsap.utils.toArray(".story-step").forEach((el, i) => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: self => self.isActive && setStep(i),
      });
    });

    // Light up the money path in the hero scene as the reader leaves the hero.
    ScrollTrigger.create({
      trigger: ".hero",
      start: "bottom 85%",
      onEnter: () => setHeroRel(MONEY_PATH),
      onLeaveBack: () => setHeroRel([]),
    });
  }, { scope: root });

  return (
    <div ref={root} className="landing">
      <section className="hero">
        <SchemaScene mode="ambient" highlight={heroRel} className="hero-scene" />
        <nav className="hero-bar">
          <Mark light />
          <a className="hero-signin" href="#sign-in">Sign in</a>
        </nav>
        <div className="hero-text">
          <h1>
            <span className="hero-line"><span>Every rupee,</span></span>
            <span className="hero-line"><span>traced.</span></span>
          </h1>
          <p className="hero-copy">
            UniGrant keeps a university research grant in one MySQL database, from the first proposal to the last receipt.
            The rules that matter live in the database, so they hold whichever screen touches the data.
          </p>
          <div className="hero-cta">
            <a className="btn btn-light" href="#sign-in">Open the demo</a>
            <a className="hero-more" href="#story">Follow one expense</a>
          </div>
        </div>
        <p className="hero-caption">
          The UniGrant EER model in Chen notation: {ENTITIES.length} entity sets in rectangles (double for weak), {RELATIONSHIPS.length} relationships
          in diamonds, 1 / N / M on every line, double lines for total participation.
        </p>
      </section>

      <section className="story" id="story">
        <div className="story-inner">
          <div className="story-steps">
            <h2 className="l-h2">Follow one expense</h2>
            <p className="l-lede">Five rows, two triggers and one transaction, in the order they happen.</p>
            <ol>
              {STEPS.map((s, i) => (
                <li key={s.title} className={`story-step ${step === i ? "is-on" : ""}`}>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="story-stage">
            <Ledger s={STEPS[step]} />
          </div>
        </div>
      </section>

      <section className="rules">
        <div className="l-wrap">
          <h2 className="l-h2">What the database refuses to do</h2>
          <p className="l-lede">Each rule is enforced in MySQL, not in React, so a request from any client gets the same answer.</p>
          <div className="rules-table">
            {RULES.map(r => (
              <div className="rules-row" key={r.object}>
                <p>{r.rule}</p>
                <code>{r.object}</code>
                <span>{r.kind}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="stack-sec">
        <div className="l-wrap">
          <h2 className="l-h2">How a click reaches a row</h2>
          <div className="pipe">
            <div className="pipe-node">
              <h3>React 19 + Vite</h3>
              <p>Screens per role. Every write calls the API and shows the SQL it caused in the query log.</p>
              <code>src/</code>
            </div>
            <div className="pipe-node">
              <h3>Express + mysql2</h3>
              <p>REST routes over a connection pool. Trigger errors come back as readable messages.</p>
              <code>server/index.js</code>
            </div>
            <div className="pipe-node">
              <h3>MySQL 8</h3>
              <p>{RELATIONS.length} relations, 4 views, 5 triggers, 2 procedures, 3 scheduled events, 4 roles.</p>
              <code>schema/01–06_*.sql</code>
            </div>
          </div>
        </div>
      </section>

      <SignIn onLogin={onLogin} />

      <footer className="l-foot">
        <div className="l-wrap">
          <Mark />
          <p>Research grant lifecycle management. A course project, not an official university system.</p>
        </div>
      </footer>
    </div>
  );
}

// ─── The ledger page shown beside the steps ───────────────────
function Ledger({ s }) {
  const ref = useRef(null);
  const { ledger } = s;
  const remaining = ledger.alloc - ledger.spent;
  const refused = ledger.phase === "refused";
  const approved = ledger.phase === "approved";

  useGSAP(() => {
    gsap.from(".ledger-sql", { autoAlpha: 0, y: 8, duration: 0.4, ease: "power2.out" });
    if (refused) gsap.fromTo(".ledger-ask", { x: -10 }, { x: 0, duration: 0.6, ease: "elastic.out(1.1, 0.3)" });
    if (approved) gsap.from(".ledger .stamp", { scale: 2.4, autoAlpha: 0, rotate: -20, duration: 0.45, ease: "back.out(2)" });
  }, { dependencies: [s.title], scope: ref });

  return (
    <div ref={ref} className="ledger">
      <div className="ledger-head">
        <span>{HEAD.project}</span>
        <span>{s.rel.join("  →  ")}</span>
      </div>

      {ledger.alloc === 0 ? (
        <div className="ledger-big">
          <div className="ledger-figure">{inr(2500000)}</div>
          <div className="ledger-cap">{ledger.phase === "proposal" ? "requested over 24 months" : "awarded by the Dept. of Science & Technology"}</div>
        </div>
      ) : (
        <div className="ledger-big">
          <div className="ledger-cap">{HEAD.category} head, remaining</div>
          <div className={`ledger-figure ${remaining < 150000 ? "is-low" : ""}`}>{inr(remaining)}</div>
          <div className="split" aria-hidden="true">
            <i className="s-spent" style={{ width: `${(ledger.spent / ledger.alloc) * 100}%` }} />
          </div>
          <div className="ledger-cap">{inr(ledger.spent)} spent of {inr(ledger.alloc)} allocated</div>
          {ledger.ask && (
            <div className={`ledger-ask ${refused ? "is-refused" : ""}`}>
              <span>Expense of {inr(ledger.ask)}</span>
              {refused ? <span className="stamp rejected">REFUSED BY TRIGGER</span> : <span className="stamp">APPROVED</span>}
            </div>
          )}
        </div>
      )}
      <div className="ledger-sql"><Code>{s.sql}</Code></div>
    </div>
  );
}

// ─── Sign in ──────────────────────────────────────────────────
function SignIn({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(null);

  async function handleLogin(loginEmail, loginPass, source) {
    setErr(""); setBusy(source);
    logSQL(
      `SELECT user_id, first_name, last_name, role, dept_id\nFROM User\nWHERE email = '${loginEmail}'\nAND password_hash = SHA2('***', 256);`,
      "Authentication query"
    );
    try {
      const u = await api.login(loginEmail, loginPass);   // POST /api/auth/login → MySQL
      await initDB();                                     // fetch all tables into DB.*
      onLogin(u);
    } catch (err) {
      // A real refusal from the server stops here. Only an unreachable server
      // or database falls back to the local preview copy.
      if (err.status && err.status < 500) {
        setErr("That email and password don't match a user. Pick one of the demo accounts above, or check for typos.");
        setBusy(null);
        return;
      }
      const mockUser = DB.users.find(
        u => u.email.toLowerCase() === loginEmail.trim().toLowerCase() && (u.password === loginPass.trim() || !loginPass)
      );
      if (mockUser) onLogin(mockUser);
      else { setErr("That email and password don't match a user. Pick one of the demo accounts above, or check for typos."); setBusy(null); }
    }
  }

  return (
    <section className="signin" id="sign-in">
      <div className="l-wrap signin-grid">
        <div>
          <h2 className="l-h2">Sign in as someone</h2>
          <p className="l-lede">Each account maps to a MySQL role, so what you can see and change is decided by its GRANTs.</p>
          <div className="accounts">
            {DEMO_ACCOUNTS.map(d => {
              const r = ROLES[d.role];
              return (
                <button key={d.email} className="account" style={{ "--tint": r.tint, "--ink-r": r.ink }}
                  onClick={() => { setEmail(d.email); setPass(d.pass); handleLogin(d.email, d.pass, d.email); }}
                  disabled={!!busy}>
                  <Avatar user={{ first_name: d.name.replace("Prof. ", ""), last_name: d.name.split(" ").pop(), role: d.role }} size="lg" />
                  <span className="account-text">
                    <strong>{d.name}</strong>
                    <span>{r.label} · <code>{r.db}</code></span>
                    <span className="account-can">{d.can}</span>
                  </span>
                  <span className="account-go">{busy === d.email ? "Signing in" : "Sign in"}</span>
                </button>
              );
            })}
          </div>
        </div>
        <form className="signin-form" onSubmit={e => { e.preventDefault(); handleLogin(email, pass, "form"); }}>
          <h3>Or use an email</h3>
          <label className="field"><span>Email</span>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@university.edu" autoComplete="username" required />
          </label>
          <label className="field"><span>Password</span>
            <input className="input" type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete="current-password" />
          </label>
          {err && <p className="signin-err" role="alert">{err}</p>}
          <button className="btn btn-ink btn-block" disabled={!!busy}>{busy === "form" ? "Signing in" : "Sign in"}</button>
          <p className="signin-note">Passwords are checked with <code>SHA2(password, 256)</code> against <code>User.password_hash</code>.</p>
        </form>
      </div>
    </section>
  );
}
