/**
 * Schema explorer: the EER model as a 3D Chen diagram, plus a panel that
 * reads out the selected entity or relationship and the table behind it.
 */

import { useState } from "react";
import SchemaScene from "../components/SchemaScene.jsx";
import { PageHead } from "../components/ui.jsx";
import { RELATIONS } from "../lib/schema.js";
import { ENTITIES, RELATIONSHIPS, ISA, parseAttr, relLabel, readEnd } from "../lib/chen.js";

const ent = name => ENTITIES.find(e => e.name === name);
const rel = id => RELATIONSHIPS.find(r => r.id === id);
const table = name => RELATIONS.find(r => r.name === name);

function Legend() {
  const s = { stroke: "currentColor", strokeWidth: 1.4, fill: "none" };
  return (
    <div className="schema-legend" aria-hidden="true">
      <span><svg width="22" height="12"><rect x="1" y="1" width="20" height="10" {...s} /></svg>Entity</span>
      <span><svg width="22" height="14"><rect x="1" y="1" width="20" height="12" {...s} /><rect x="4" y="4" width="14" height="6" {...s} /></svg>Weak entity</span>
      <span><svg width="22" height="14"><path d="M11 1 21 7 11 13 1 7Z" {...s} /></svg>Relationship</span>
      <span><svg width="22" height="14"><path d="M11 1 21 7 11 13 1 7Z" {...s} /><path d="M11 4 16 7 11 10 6 7Z" {...s} /></svg>Identifying</span>
      <span><svg width="22" height="12"><ellipse cx="11" cy="6" rx="10" ry="5" {...s} /></svg>Attribute</span>
      <span><svg width="22" height="10"><path d="M1 3H21M1 7H21" {...s} /></svg>Total participation</span>
      <span><svg width="22" height="10"><path d="M1 5H21" {...s} /></svg>Partial</span>
    </div>
  );
}

function Attrs({ list }) {
  return (
    <ul className="chen-attrs">
      {list.map(parseAttr).map(a => (
        <li key={a.name}>
          <code className={a.key ? "is-key" : a.partial ? "is-partial" : ""}>{a.name}</code>
          <span>
            {a.key ? "key" : a.partial ? "partial key" : a.derived ? "derived" : a.parts ? `composite: ${a.parts.join(", ")}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Columns({ name }) {
  const t = table(name);
  if (!t) return null;
  return <>
    <h3 className="rel-h3">Table {t.name}</h3>
    <ul className="rel-cols">
      {t.cols.map(([c, note]) => <li key={c} className={note?.startsWith("PK") ? "pk" : ""}><code>{c}</code><span>{note}</span></li>)}
    </ul>
    {t.note && <p style={{ marginTop: 10, fontSize: "var(--fs-xs)" }}><code>{t.note}</code></p>}
  </>;
}

function ratio(r) { return r.ends.map(e => e[1]).join(" : "); }

function EntityCard({ e, go }) {
  const parts = RELATIONSHIPS.filter(r => r.ends.some(([n]) => n === e.name));
  const owner = e.weak && parts.find(r => r.identifying);
  return (
    <div className="panel-body">
      <h2>{e.name}</h2>
      <p className="rel-kind">
        {e.weak ? <>Weak entity, identified by <button className="linkish" onClick={() => go(owner.ends[0][0])}>{owner.ends[0][0]}</button> through <button className="linkish" onClick={() => go(owner.id)}>{relLabel(owner)}</button></> : "Strong entity"}
      </p>
      <h3 className="rel-h3">Attributes</h3>
      <Attrs list={e.attrs} />
      {e.name === ISA.superclass && (
        <p className="rel-note">Specialised on <code>{ISA.on}</code> into {ISA.subclasses.join(", ")}: disjoint and total, because <code>role</code> is a NOT NULL ENUM.</p>
      )}
      <h3 className="rel-h3">Takes part in</h3>
      <div className="rel-links">
        {parts.map(r => {
          const me = r.ends.filter(([n]) => n === e.name);
          const total = me.some(m => m[2]);
          return (
            <button key={r.id} onClick={() => go(r.id)}>
              {relLabel(r)} <span style={{ color: "var(--ink-3)" }}>{ratio(r)}{total ? ", total" : ""}</span>
            </button>
          );
        })}
      </div>
      <Columns name={e.name} />
    </div>
  );
}

function RelCard({ r, go }) {
  const recursive = r.ends[0][0] === r.ends[1][0];
  return (
    <div className="panel-body">
      <h2>{relLabel(r)}</h2>
      <p className="rel-kind">
        {r.identifying ? "Identifying relationship" : recursive ? "Recursive relationship" : "Binary relationship"}, cardinality {ratio(r)}
      </p>
      <table className="chen-ends">
        <thead><tr><th>Entity</th><th>Card.</th><th>Participation</th></tr></thead>
        <tbody>
          {r.ends.map(([n, card, total, role], i) => (
            <tr key={i}>
              <td><button className="linkish" onClick={() => go(n)}>{n}</button>{role && <em> as {role}</em>}</td>
              <td>{card}</td>
              <td>{total ? "total" : "partial"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="chen-read">{readEnd(r).map(s => <li key={s}>{s}.</li>)}</ul>
      {r.attrs && <><h3 className="rel-h3">Relationship attributes</h3><Attrs list={r.attrs} /></>}
      <h3 className="rel-h3">How the DDL enforces it</h3>
      <p className="rel-note"><code>{r.via}</code></p>
      {r.table && <Columns name={r.table} />}
    </div>
  );
}

export default function Schema() {
  const [sel, setSel] = useState(null);
  const e = sel && ent(sel), r = sel && rel(sel);

  return (
    <div>
      <PageHead title="Schema" sub={`The EER model in Chen notation: ${ENTITIES.length} entity sets and ${RELATIONSHIPS.length} relationships, mapped to ${RELATIONS.length} tables in 01_schema_er.sql. Click a rectangle or diamond to open it; drag to turn.`} />
      <div className="schema-wrap">
        <div className="schema-stage">
          <SchemaScene mode="explore" selected={sel} onSelect={setSel} />
          <Legend />
          <p className="schema-hint">
            {sel ? "Click empty space or press Esc for the whole diagram." : "1, N and M sit next to the diamond on each line."}
          </p>
        </div>

        <aside className="panel rel-card">
          {e ? <EntityCard e={e} go={setSel} /> : r ? <RelCard r={r} go={setSel} /> : (
            <div className="panel-body">
              <h2>Reading the diagram</h2>
              <ul className="chen-read">
                <li>Rectangles are entity sets. A double rectangle is a weak entity: its key includes its owner's key (Dependent, Equipment).</li>
                <li>Diamonds are relationships. A double diamond identifies a weak entity.</li>
                <li>The 1, N or M on a line says how many of that entity one instance on the other side relates to.</li>
                <li>A double line means total participation: every row must take part, because the foreign key is NOT NULL.</li>
                <li>Select anything to see its attributes as ovals. Underlined is the key; dashed underline is a partial key; a dashed oval is derived.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><h2>Everything in the diagram</h2><span>same items as the model, for keyboard and screen readers</span></div>
        <div className="panel-body rel-index">
          <div>
            <h3 className="rel-h3" style={{ marginTop: 0 }}>Entity sets</h3>
            <div className="rel-links">
              {ENTITIES.map(x => <button key={x.name} onClick={() => setSel(x.name)} aria-pressed={sel === x.name}>{x.name}{x.weak ? " (weak)" : ""}</button>)}
            </div>
          </div>
          <div>
            <h3 className="rel-h3" style={{ marginTop: 0 }}>Relationships</h3>
            <div className="rel-links">
              {RELATIONSHIPS.map(x => <button key={x.id} onClick={() => setSel(x.id)} aria-pressed={sel === x.id}>{relLabel(x)} <span style={{ color: "var(--ink-3)" }}>{ratio(x)}</span></button>)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
