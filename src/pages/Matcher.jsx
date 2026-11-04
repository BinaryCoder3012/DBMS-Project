/**
 * Grant matcher, part of workflow W3. Both panels run on MySQL FULLTEXT:
 *   Calls for a researcher: scores open ExternalCall rows against a PI's
 *     specialisation and stores them in MATCHES (CHECK 0 to 100).
 *   Researchers for a topic: MATCH ... AGAINST over User.specialization and
 *     Proposal(abstract, title).
 * The offline preview falls back to counting shared keywords.
 */

import { useState } from "react";
import { api } from "../api.js";
import { DB, logSQL, inr, fmtDate, fullName } from "../lib/db.js";
import { PageHead, Notice } from "../components/ui.jsx";

const words = text => (text || "").toLowerCase().match(/[a-z]{4,}/g) || [];

function previewMatches(pi) {
  const spec = new Set(words(pi.specialization));
  const today = new Date().toISOString().split("T")[0];
  const scored = DB.external_calls
    .filter(c => c.deadline >= today)
    .map(c => ({ ...c, hits: [...new Set(words(`${c.title} ${c.description} ${c.focus}`))].filter(w => spec.has(w)).length }))
    .filter(c => c.hits > 0);
  const best = Math.max(1, ...scored.map(c => c.hits));
  return scored.map(c => ({ ...c, score: Math.round((c.hits / best) * 100) })).sort((a, b) => b.score - a.score);
}

function previewSearch(query) {
  const terms = words(query);
  const has = text => terms.some(t => (text || "").toLowerCase().includes(t));
  return {
    researchers: DB.users.filter(u => u.role === "PI" && has(u.specialization)),
    proposals: DB.proposals.filter(p => has(`${p.title} ${p.abstract}`)),
  };
}

export default function Matcher({ user }) {
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetPI, setTargetPI] = useState(user.role === "PI" ? user : DB.users.find(u => u.role === "PI"));
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState(null);
  const [error, setError] = useState(null);

  async function computeMatches(pi) {
    setLoading(true); setMatches(null); setError(null);
    logSQL(`SELECT call_id, title FROM ExternalCall WHERE deadline >= CURDATE();\nSELECT MATCH(specialization) AGAINST (:call_text IN NATURAL LANGUAGE MODE)\nFROM User WHERE user_id = ${pi.user_id};`, "Score open calls");
    try {
      const rows = DB.live ? await api.matchCalls(pi.user_id) : previewMatches(pi);
      logSQL(`INSERT INTO MATCHES (call_id, user_id, match_score, match_reason) VALUES (...)\nON DUPLICATE KEY UPDATE match_score = VALUES(match_score);`, "Persist match scores");
      setMatches(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true); setHits(null); setError(null);
    logSQL(`SELECT * FROM User WHERE MATCH(specialization) AGAINST ('${q}' IN NATURAL LANGUAGE MODE);\nSELECT * FROM Proposal WHERE MATCH(abstract, title) AGAINST ('${q}' IN NATURAL LANGUAGE MODE);`, "Full-text search");
    try {
      setHits(DB.live ? await api.search(q) : previewSearch(q));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  const pis = DB.users.filter(u => u.role === "PI");
  const nothing = hits && hits.researchers.length === 0 && hits.proposals.length === 0;

  return (
    <div>
      <PageHead title="Grant matcher" sub="Finds open funding calls that fit a researcher, and researchers that fit a topic." />
      {error && <Notice tone="bad" title="MySQL refused this." onClose={() => setError(null)}>{error}</Notice>}

      <div className="grid-2">
        <section className="panel" style={{ alignSelf: "start" }}>
          <div className="panel-head"><h2>Calls for a researcher</h2><span>writes to MATCHES</span></div>
          <div className="panel-body">
            {user.role === "Admin" && (
              <label className="field"><span>Researcher</span>
                <select className="select" value={targetPI?.user_id} onChange={e => { setTargetPI(DB.users.find(u => u.user_id === Number(e.target.value))); setMatches(null); }}>
                  {pis.map(p => <option key={p.user_id} value={p.user_id}>Prof. {fullName(p)}</option>)}
                </select>
              </label>
            )}
            {targetPI && (
              <p style={{ color: "var(--ink-2)", marginBottom: 14 }}>
                <strong style={{ color: "var(--ink)" }}>Prof. {fullName(targetPI)}</strong> works on {targetPI.specialization}.
              </p>
            )}
            <button className="btn btn-ink btn-block" onClick={() => targetPI && computeMatches(targetPI)} disabled={loading}>
              {loading ? "Scoring open calls" : "Find matching calls"}
            </button>
          </div>
          {matches && (
            <div className="panel-flush" style={{ borderTop: "1px solid var(--line)" }}>
              {matches.map(m => (
                <div key={m.call_id} className="row">
                  <div className="row-main">
                    <div className="row-title">{m.title}</div>
                    <div className="row-sub">Closes {fmtDate(m.deadline)}, up to {inr(m.max_budget)}</div>
                    {m.focus && <div className="row-sub">{m.focus}</div>}
                  </div>
                  <div className={`score ${m.score > 70 ? "hi" : m.score > 45 ? "mid" : "lo"}`} title="match_score, 0 to 100">{m.score}</div>
                </div>
              ))}
              {matches.length === 0 && <p className="empty">No open call shares a term with this profile.</p>}
            </div>
          )}
        </section>

        <section className="panel" style={{ alignSelf: "start" }}>
          <div className="panel-head"><h2>Researchers for a topic</h2><span>FULLTEXT on specialization</span></div>
          <div className="panel-body">
            <form style={{ display: "flex", gap: 8 }} onSubmit={e => { e.preventDefault(); search(); }}>
              <input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="solar energy grid storage" aria-label="Topic" />
              <button className="btn btn-ink" disabled={searching}>{searching ? "Searching" : "Search"}</button>
            </form>
            <p style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginTop: 8 }}>Try "drug discovery" or "renewable energy".</p>
          </div>
          {hits && (
            <div className="panel-flush" style={{ borderTop: "1px solid var(--line)" }}>
              {hits.researchers.map(u => (
                <div key={`u${u.user_id}`} className="row">
                  <div className="row-main">
                    <div className="row-title">Prof. {fullName(u)}</div>
                    <div className="row-sub">{u.specialization}</div>
                  </div>
                  <span className="chip">Researcher</span>
                </div>
              ))}
              {hits.proposals.map(p => (
                <div key={`p${p.proposal_id}`} className="row">
                  <div className="row-main">
                    <div className="row-title">{p.title}</div>
                    <div className="row-sub">{p.status}</div>
                  </div>
                  <span className="chip">Proposal</span>
                </div>
              ))}
              {nothing && <p className="empty">Nothing matches those words. Try a broader topic.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
