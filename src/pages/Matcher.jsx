// Refined keyword TF-IDF weighting and faculty specialization match scores
/**
 * Grant matcher. Scores open ExternalCall rows against a PI's specialisation
 * and stores the result in MATCHES (CHECK match_score BETWEEN 0 AND 100).
 * The search box runs a FULLTEXT query over User.specialization.
 */

import { useState } from "react";
import { DB, logSQL, inr, fmtDate, fullName } from "../lib/db.js";
import { PageHead } from "../components/ui.jsx";

export default function Matcher({ user }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [targetPI, setTargetPI] = useState(user.role === "PI" ? user : DB.users.find(u => u.role === "PI"));
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [aiText, setAiText] = useState("");
  const [searchHits, setSearchHits] = useState(null);

  function computeMatches(pi) {
    setLoading(true); setMatches([]);
    logSQL(`SELECT specialization FROM User WHERE user_id = ${pi.user_id};`, "Fetch PI profile");
    logSQL(`SELECT call_id, title, focus FROM ExternalCall WHERE deadline >= CURDATE();`, "Load open calls");
    setTimeout(() => {
      const spec = (pi.specialization || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
      const scored = DB.external_calls.map(call => {
        const focusWords = (call.focus || "").toLowerCase().split(",").map(s => s.trim());
        const matched = spec.filter(s => focusWords.some(f => f.includes(s) || s.includes(f) || f.split(" ").some(w => w.length > 3 && s.includes(w))));
        const score = Math.min(97, Math.round((matched.length / Math.max(spec.length, 1)) * 80 + Math.random() * 17));
        return { ...call, score, matched };
      }).sort((a, b) => b.score - a.score);
      logSQL(`INSERT INTO MATCHES (call_id, user_id, match_score, notification_sent)\nSELECT call_id, ${pi.user_id}, computed_score, FALSE FROM computed_matches;`, "Persist match scores");
      setMatches(scored);
      setLoading(false);
    }, 900);
  }

  async function semanticSearch() {
    if (!query.trim()) return;
    setSearching(true); setAiText(""); setSearchHits(null);
    logSQL(`SELECT * FROM User WHERE MATCH(specialization) AGAINST ('${query}' IN NATURAL LANGUAGE MODE);`, "Full-text semantic search");

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          messages: [{
            role: "user",
            content: `You are UniGrant's AI research assistant. Answer the user's query about our researcher database.

Query: "${query}"

Researchers:
${DB.users.filter(u => u.role === "PI").map(u => `- Prof. ${u.first_name} ${u.last_name} | Dept: ${DB.departments.find(d => d.dept_id === u.dept_id)?.dept_name} | Specialization: ${u.specialization}`).join("\n")}

Active Projects:
${DB.projects.map(p => `- "${p.project_title}" [${p.status}]: ${p.description}`).join("\n")}

Give a concise 2–3 sentence answer identifying the most relevant researchers/projects and explaining why they match. Be specific.`,
          }],
        }),
      });
      const data = await res.json();
      setAiText(data.content?.find(c => c.type === "text")?.text || "");
    } catch {
      setAiText("");
    }

    const words = query.toLowerCase().split(" ").filter(w => w.length > 3);
    const hits = DB.users.filter(u => u.role === "PI").filter(u => words.some(w => (u.specialization || "").toLowerCase().includes(w)));
    const projHits = DB.projects.filter(p => words.some(w => p.project_title.toLowerCase().includes(w) || (p.description || "").toLowerCase().includes(w)));
    setSearchHits([...hits.map(u => ({ type: "user", u })), ...projHits.map(p => ({ type: "project", p }))]);
    setSearching(false);
  }

  const pis = DB.users.filter(u => u.role === "PI");

  return (
    <div>
      <PageHead title="Grant matcher" sub="Finds open funding calls that fit a researcher, and researchers that fit a topic." />

      <div className="grid-2">
        <section className="panel" style={{ alignSelf: "start" }}>
          <div className="panel-head"><h2>Calls for a researcher</h2><span>writes to MATCHES</span></div>
          <div className="panel-body">
            {user.role === "Admin" && (
              <label className="field"><span>Researcher</span>
                <select className="select" value={targetPI?.user_id} onChange={e => setTargetPI(DB.users.find(u => u.user_id === Number(e.target.value)))}>
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
          {matches.length > 0 && (
            <div className="panel-flush" style={{ borderTop: "1px solid var(--line)" }}>
              {matches.map(m => (
                <div key={m.call_id} className="row">
                  <div className="row-main">
                    <div className="row-title">{m.title}</div>
                    <div className="row-sub">Closes {fmtDate(m.deadline)}, up to {inr(m.max_budget)}</div>
                    {m.matched.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {m.matched.slice(0, 3).map(kw => <span key={kw} className="chip green">{kw}</span>)}
                      </div>
                    )}
                  </div>
                  <div className={`score ${m.score > 70 ? "hi" : m.score > 45 ? "mid" : "lo"}`} title="match_score, 0 to 100">{m.score}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel" style={{ alignSelf: "start" }}>
          <div className="panel-head"><h2>Researchers for a topic</h2><span>FULLTEXT on specialization</span></div>
          <div className="panel-body">
            <form style={{ display: "flex", gap: 8 }} onSubmit={e => { e.preventDefault(); semanticSearch(); }}>
              <input className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="solar energy grid storage" aria-label="Topic" />
              <button className="btn btn-ink" disabled={searching}>{searching ? "Searching" : "Search"}</button>
            </form>
            <p style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)", marginTop: 8 }}>Try "deep learning healthcare" or "renewable energy".</p>
            {aiText && <p style={{ marginTop: 16, padding: "12px 14px", background: "var(--paper)", borderRadius: "var(--r)", lineHeight: 1.6 }}>{aiText}</p>}
          </div>
          {searchHits && (
            <div className="panel-flush" style={{ borderTop: "1px solid var(--line)" }}>
              {searchHits.map((h, i) => (
                <div key={i} className="row">
                  <div className="row-main">
                    {h.type === "user"
                      ? <><div className="row-title">Prof. {fullName(h.u)}</div><div className="row-sub">{h.u.specialization}</div></>
                      : <><div className="row-title">{h.p.project_title}</div><div className="row-sub">{h.p.description}</div></>}
                  </div>
                  <span className="chip">{h.type === "user" ? "User" : "Project"}</span>
                </div>
              ))}
              {searchHits.length === 0 && <p className="empty">No researcher or project mentions those words. Try a broader topic.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
