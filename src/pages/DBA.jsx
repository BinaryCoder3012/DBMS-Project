/**
 * DBA console (admin_role only): roles, views, triggers, the annual report
 * procedure and the index strategy, with the procedure runnable per department.
 */

import { useState } from "react";
import { DB, logSQL, inr } from "../lib/db.js";
import { Figure, PageHead, Notice, Code } from "../components/ui.jsx";
import { ROLES } from "../lib/nav.js";

const TABS = [
  ["roles", "Roles and grants"],
  ["views", "Views"],
  ["triggers", "Triggers and events"],
  ["proc", "Stored procedure"],
  ["indexes", "Indexes"],
];

const ROLE_ROWS = [
  { key: "Admin", perms: ["ALL PRIVILEGES", "CREATE USER", "GRANT OPTION"], note: "Full DBA" },
  { key: "PI", perms: ["SELECT", "INSERT", "UPDATE"], note: "No CREATE USER or DROP" },
  { key: "Grant_Officer", perms: ["SELECT on Proposal", "SELECT, UPDATE on Expense"], note: "CREATE USER revoked" },
  { key: "Student", perms: ["SELECT through views"], note: "Row-level filter" },
];

const ROLE_SQL = `-- Create roles
CREATE ROLE admin_role, pi_role, grant_officer_role, student_role;

-- Admin: full DBA
GRANT ALL PRIVILEGES ON unigrant.* TO admin_role WITH GRANT OPTION;
GRANT CREATE USER ON *.* TO admin_role;

-- PI: read/write on own data, no user management
GRANT SELECT, INSERT, UPDATE ON unigrant.Proposal TO pi_role;
GRANT SELECT, INSERT, UPDATE ON unigrant.Expense   TO pi_role;
GRANT SELECT ON unigrant.Project TO pi_role;
GRANT SELECT ON unigrant.BudgetHead TO pi_role;

-- Grant officer: view proposals, approve expenses only
GRANT SELECT ON unigrant.Proposal TO grant_officer_role;
GRANT SELECT, UPDATE ON unigrant.Expense TO grant_officer_role;
REVOKE CREATE USER ON *.* FROM grant_officer_role;  -- explicitly blocked

-- Student: view-only via restricted views (row-level security)
GRANT SELECT ON unigrant.Public_Project_View TO student_role;
CREATE POLICY student_rows ON Project
  USING (project_id IN (
    SELECT project_id FROM WORKS_ON WHERE user_id = CURRENT_USER_ID()
  ));`;

const VIEWS = [
  { name: "Public_Project_View", desc: "For outsiders. No money columns.",
    sql: `CREATE VIEW Public_Project_View AS\nSELECT\n  p.project_id, p.project_title,\n  CONCAT(u.first_name,' ',u.last_name) AS principal_investigator,\n  g.funding_agency, p.start_date, p.end_date, p.status\nFROM Project p\nJOIN User u ON p.pi_id = u.user_id\nJOIN Grant_ g ON p.grant_id = g.grant_id;\n-- Columns hidden: current_balance, stipend_amount, salaries, internal notes` },
  { name: "PI_Dashboard_View", desc: "A PI's projects with utilisation and open milestones.",
    sql: `CREATE VIEW PI_Dashboard_View AS\nSELECT\n  p.project_title, p.current_balance,\n  COUNT(CASE WHEN m.status='Pending' THEN 1 END) AS pending_milestones,\n  ROUND(SUM(bh.spent_amount)/SUM(bh.allocated_amount)*100,1) AS budget_utilisation_pct,\n  COUNT(DISTINCT wo.user_id) AS team_size\nFROM Project p\nJOIN Milestone m ON p.project_id = m.project_id\nJOIN BudgetHead bh ON p.project_id = bh.project_id\nJOIN WORKS_ON wo ON p.project_id = wo.project_id\nWHERE p.pi_id = CURRENT_USER_ID()\nGROUP BY p.project_id;` },
  { name: "Admin_Analytics_View", desc: "Funding, projects and outputs per department.",
    sql: `CREATE VIEW Admin_Analytics_View AS\nSELECT\n  d.dept_name,\n  SUM(g.total_amount_awarded)       AS total_funding,\n  COUNT(DISTINCT p.project_id)     AS total_projects,\n  COUNT(DISTINCT ro.output_id)     AS total_publications,\n  COUNT(DISTINCT CASE WHEN u.role='Student' THEN u.user_id END) AS students_trained\nFROM Department d\nLEFT JOIN Project p ON d.dept_id = p.department_id\nLEFT JOIN Grant_ g  ON p.grant_id = g.grant_id\nLEFT JOIN ResearchOutput ro ON p.project_id = ro.project_id\nLEFT JOIN WORKS_ON wo ON p.project_id = wo.project_id\nLEFT JOIN User u ON wo.user_id = u.user_id\nGROUP BY d.dept_id;` },
];

const TRIGGERS = [
  { name: "balance_check_before_expense", desc: "Refuses an expense larger than the head's remaining balance.",
    sql: `CREATE TRIGGER balance_check_before_expense\nBEFORE INSERT ON Expense FOR EACH ROW\nBEGIN\n  DECLARE avail DECIMAL(15,2);\n  SELECT remaining_balance INTO avail\n  FROM BudgetHead WHERE budgethead_id = NEW.budgethead_id;\n  IF NEW.amount > avail THEN\n    SIGNAL SQLSTATE '45000'\n    SET MESSAGE_TEXT = 'ERR: Insufficient budget balance in this head';\n  END IF;\nEND;` },
  { name: "active_project_limit_pi", desc: "Stops a sixth active project for one PI.",
    sql: `CREATE TRIGGER active_project_limit_pi\nBEFORE INSERT ON Proposal FOR EACH ROW\nBEGIN\n  DECLARE cnt INT;\n  SELECT COUNT(*) INTO cnt FROM Project\n  WHERE pi_id = NEW.pi_id AND status = 'Active';\n  IF cnt >= 5 THEN\n    SIGNAL SQLSTATE '45000'\n    SET MESSAGE_TEXT = 'ERR: PI already has 5 active projects';\n  END IF;\nEND;` },
  { name: "auto_close_project", desc: "Closes a project once its end date has passed.",
    sql: `CREATE TRIGGER auto_close_project\nAFTER UPDATE ON Project FOR EACH ROW\nBEGIN\n  IF CURDATE() > NEW.end_date AND NEW.status = 'Active' THEN\n    SET NEW.status = 'Closed';\n  END IF;\nEND;` },
  { name: "milestone_30day_alert", desc: "Scheduled event. Notifies the PI 30 days before a milestone.",
    sql: `CREATE EVENT milestone_30day_alert\nON SCHEDULE EVERY 1 DAY STARTS CURDATE()\nDO\n  INSERT INTO Notification(user_id, message, sent_at)\n  SELECT p.pi_id,\n    CONCAT('Milestone due in 30 days: ', m.title,\n           ' | Project: ', p.project_title),\n    NOW()\n  FROM Milestone m\n  JOIN Project p ON m.project_id = p.project_id\n  WHERE m.status = 'Pending'\n    AND m.due_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY);` },
];

const PROC_SQL = `CREATE PROCEDURE generate_annual_report(IN p_dept_id INT)
BEGIN
  SELECT
    d.dept_name,
    SUM(g.total_amount_awarded)         AS total_funds_received,
    COUNT(DISTINCT p.project_id)       AS total_projects,
    SUM(CASE WHEN p.status='Active' THEN 1 ELSE 0 END) AS active_projects,
    COUNT(DISTINCT ro.output_id)       AS total_research_outputs,
    SUM(CASE WHEN ro.type='Publication' THEN 1 ELSE 0 END) AS publications,
    SUM(CASE WHEN ro.type='Patent' THEN 1 ELSE 0 END)      AS patents,
    COUNT(DISTINCT CASE WHEN u.role='Student' THEN u.user_id END) AS students_supported
  FROM Department d
  LEFT JOIN Project p        ON d.dept_id = p.department_id
  LEFT JOIN Grant_ g         ON p.grant_id = g.grant_id
  LEFT JOIN ResearchOutput ro ON p.project_id = ro.project_id
  LEFT JOIN WORKS_ON wo      ON p.project_id = wo.project_id
  LEFT JOIN User u           ON wo.user_id = u.user_id
  WHERE d.dept_id = p_dept_id
    AND YEAR(IFNULL(g.start_date, CURDATE())) = YEAR(CURDATE())
  GROUP BY d.dept_id, d.dept_name;
END //`;

const INDEX_SQL = `-- B-tree composite: search and filter on the projects screen
CREATE INDEX IDX_Project_Title_Status
  ON Project(project_title, status);

-- Name lookup
CREATE INDEX IDX_User_Name
  ON User(last_name, first_name);

-- Expense timeline queries
CREATE INDEX IDX_Expense_Date_Project
  ON Expense(date, project_id);

-- Milestones due soon (used by milestone_30day_alert)
CREATE INDEX IDX_Milestone_Status_DueDate
  ON Milestone(status, due_date);

-- Full-text: grant matcher and proposal search
CREATE FULLTEXT INDEX FT_Proposal
  ON Proposal(abstract, title);
CREATE FULLTEXT INDEX FT_User_Specialization
  ON User(specialization);`;

export default function DBA({ user }) {
  const [tab, setTab] = useState("roles");
  const [deptId, setDeptId] = useState(DB.departments[0]?.dept_id ?? 1);
  const [procResult, setProcResult] = useState(null);

  if (user.role !== "Admin") return <p className="empty">The DBA console is only available to admin_role.</p>;

  function runProc() {
    logSQL(`CALL generate_annual_report(${deptId});`, "Stored procedure execution");
    const dept = DB.departments.find(d => d.dept_id === deptId);
    const dProjects = DB.projects.filter(p => p.department_id === deptId);
    const dGrants = dProjects.map(p => DB.grants.find(g => g.grant_id === p.grant_id)).filter(Boolean);
    const dOutputs = DB.research_outputs.filter(o => dProjects.some(p => p.project_id === o.project_id));
    setProcResult({ dept: dept?.dept_name, totalFunding: dGrants.reduce((s, g) => s + Number(g.total_amount_awarded), 0), active: dProjects.filter(p => p.status === "Active").length, total: dProjects.length, pubs: dOutputs.filter(o => o.type === "Publication").length, patents: dOutputs.filter(o => o.type === "Patent").length });
  }

  return (
    <div>
      <PageHead title="DBA console" sub="The database objects behind the screens, exactly as they are defined in schema/*.sql." />
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {tab === "roles" && (
        <div className="stack">
          <section className="panel">
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>MySQL role</th><th>Signs in as</th><th>Privileges</th><th>Limit</th></tr></thead>
                <tbody>
                  {ROLE_ROWS.map(r => (
                    <tr key={r.key}>
                      <td className="nowrap"><code style={{ fontWeight: 700, color: ROLES[r.key].ink }}>{ROLES[r.key].db}</code></td>
                      <td>{ROLES[r.key].label}</td>
                      <td>{r.perms.map(p => <span key={p} className="chip" style={{ marginRight: 6 }}>{p}</span>)}</td>
                      <td>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <Code>{ROLE_SQL}</Code>
        </div>
      )}

      {tab === "views" && (
        <div className="stack">
          {VIEWS.map(v => (
            <section key={v.name}>
              <h2 className="sql-title"><code>{v.name}</code><span>{v.desc}</span></h2>
              <Code>{v.sql}</Code>
            </section>
          ))}
        </div>
      )}

      {tab === "triggers" && (
        <div className="stack">
          {TRIGGERS.map(t => (
            <section key={t.name}>
              <h2 className="sql-title"><code>{t.name}</code><span>{t.desc}</span></h2>
              <Code>{t.sql}</Code>
            </section>
          ))}
        </div>
      )}

      {tab === "proc" && (
        <div className="grid-main">
          <Code>{PROC_SQL}</Code>
          <section className="panel" style={{ alignSelf: "start" }}>
            <div className="panel-head"><h2>Run it</h2></div>
            <div className="panel-body">
              <label className="field"><span>Department</span>
                <select className="select" value={deptId} onChange={e => setDeptId(Number(e.target.value))}>
                  {DB.departments.map(d => <option key={d.dept_id} value={d.dept_id}>{d.dept_name}</option>)}
                </select>
              </label>
              <button className="btn btn-ink btn-block" onClick={runProc}>CALL generate_annual_report({deptId})</button>
              {procResult && (
                <div style={{ marginTop: 20 }}>
                  <Notice tone="good" title="Procedure returned one row">for {procResult.dept}.</Notice>
                  <div className="figures" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
                    <Figure value={inr(procResult.totalFunding)} label="Funds received" />
                    <Figure value={procResult.total} label="Projects" sub={`${procResult.active} active`} />
                    <Figure value={procResult.pubs} label="Publications" />
                    <Figure value={procResult.patents} label="Patents" />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === "indexes" && <Code>{INDEX_SQL}</Code>}
    </div>
  );
}
