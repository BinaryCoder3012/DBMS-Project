/**
 * Sidebar: product mark, the signed-in person's MySQL role, and the screens
 * that role is granted (lib/nav.js).
 */

import { Mark, Avatar } from "./ui.jsx";
import { NAV, ROLES } from "../lib/nav.js";
import { fullName } from "../lib/db.js";

export default function Sidebar({ user, active, go, onLogout, open }) {
  const items = NAV[user.role] || NAV.Student;
  const role = ROLES[user.role];
  return (
    <aside className={`side ${open ? "is-open" : ""}`} aria-label="Main">
      <div className="side-top">
        <Mark />
        <p className="side-scope">Research grants, signed in through <code>{role?.db}</code></p>
      </div>
      <nav className="side-nav">
        {items.map((item, i) => item.section
          ? <div key={i} className="side-group">{item.section}</div>
          : <button key={item.id} className="side-link" aria-current={active === item.id ? "page" : undefined} onClick={() => go(item.id)}>{item.label}</button>
        )}
      </nav>
      <div className="side-user">
        <Avatar user={user} />
        <div style={{ minWidth: 0 }}>
          <div className="side-user-name">{fullName(user)}</div>
          <div className="side-user-role">{role?.label}</div>
        </div>
        <button className="side-out" onClick={onLogout}>Sign out</button>
      </div>
    </aside>
  );
}
