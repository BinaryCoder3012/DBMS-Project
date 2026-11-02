/**
 * UniGrant root: landing and sign-in until someone logs in, then the app
 * shell with the screens their role is granted.
 *
 * Browser → fetch('/api/...') → Express (server/index.js) → MySQL (schema/*.sql)
 */

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { api } from "./api.js";
import { logSQL } from "./lib/db.js";
import { NAV } from "./lib/nav.js";
import { Mark, QueryLog } from "./components/ui.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Landing from "./pages/Landing.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Proposals from "./pages/Proposals.jsx";
import Projects from "./pages/Projects.jsx";
import Expenses from "./pages/Expenses.jsx";
import DBA from "./pages/DBA.jsx";
import Matcher from "./pages/Matcher.jsx";
import Schema from "./pages/Schema.jsx";
import { Grants, Milestones, Outputs, People, Departments, Analytics } from "./pages/Records.jsx";

export default function UniGrant() {
  const [user, setUser] = useState(null);
  const [active, setActive] = useState("dashboard");
  const [focusId, setFocusId] = useState(null);
  const [menu, setMenu] = useState(false);
  const screen = useRef(null);

  // One move per screen change: the new screen settles into place.
  useGSAP(() => {
    if (!screen.current) return;
    gsap.fromTo(screen.current, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out", clearProps: "transform" });
  }, { dependencies: [active, focusId, user?.user_id] });

  function login(u) {
    logSQL(`SELECT user_id, first_name, last_name, role, dept_id FROM User\nWHERE email='${u.email}' AND password_hash=SHA2('***',256);`, "Successful auth");
    setUser(u); setActive("dashboard");
    window.scrollTo(0, 0);
  }

  function logout() { api.logout(); setUser(null); setActive("dashboard"); setFocusId(null); window.scrollTo(0, 0); }

  function go(id, focus = null) {
    // only allow screens this role is granted
    if (!(NAV[user.role] || []).some(i => i.id === id)) return;
    setActive(id); setFocusId(focus); setMenu(false);
    window.scrollTo({ top: 0 });
  }

  if (!user) return <Landing onLogin={login} />;

  const screens = {
    dashboard:   <Dashboard user={user} go={go} />,
    proposals:   <Proposals user={user} />,
    projects:    <Projects key={focusId ?? "list"} user={user} focusId={focusId} clearFocus={() => setFocusId(null)} />,
    expenses:    <Expenses user={user} />,
    grants:      <Grants />,
    milestones:  <Milestones user={user} />,
    outputs:     <Outputs />,
    dba:         <DBA user={user} />,
    ai:          <Matcher user={user} />,
    analytics:   <Analytics user={user} />,
    users:       <People />,
    departments: <Departments />,
    schema:      <Schema />,
  };

  return (
    <div className="shell">
      <div className="topbar">
        <Mark />
        <button className="btn btn-sm" onClick={() => setMenu(m => !m)} aria-expanded={menu}>Menu</button>
      </div>
      <Sidebar user={user} active={active} go={go} onLogout={logout} open={menu} />
      {menu && <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setMenu(false)} />}
      <main className="main">
        <div ref={screen} className="screen" key={active}>
          {screens[active] || screens.dashboard}
        </div>
      </main>
      <QueryLog />
    </div>
  );
}
