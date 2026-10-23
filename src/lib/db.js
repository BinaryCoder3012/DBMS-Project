/**
 * UniGrant data layer
 * ───────────────────
 * DB holds every relation the UI reads. It starts with a small local copy so
 * the app can be demonstrated without MySQL, and initDB() replaces it with
 * real rows from the Express API (server/index.js) after a successful login.
 *
 * logSQL() records the SQL each screen runs so the query log can show it.
 */

import { api } from "../api.js";

export const DB = {
  users: [
    { user_id: 1, first_name: "Arjun", last_name: "Mehta", email: "arjun@university.edu", password: "pi123", role: "PI", dept_id: 1, specialization: "Renewable Energy, Solar Photovoltaics, Grid Storage, Wind Energy", phone: "+91-98765-43210", hire_date: "2018-07-01" },
    { user_id: 2, first_name: "Priya", last_name: "Sharma", email: "priya@university.edu", password: "admin123", role: "Admin", dept_id: 3, specialization: "Administration, Policy", phone: "+91-98765-43211", hire_date: "2015-03-15" },
    { user_id: 3, first_name: "Rahul", last_name: "Verma", email: "rahul@university.edu", password: "student123", role: "Student", dept_id: 1, specialization: "Power Systems, MPPT Algorithms", phone: "+91-98765-43212", hire_date: "2022-08-01" },
    { user_id: 4, first_name: "Sneha", last_name: "Patel", email: "sneha@university.edu", password: "go123", role: "Grant_Officer", dept_id: 3, specialization: "Finance, Grant Compliance", phone: "+91-98765-43213", hire_date: "2019-01-10" },
    { user_id: 5, first_name: "Vikram", last_name: "Singh", email: "vikram@university.edu", password: "pi456", role: "PI", dept_id: 2, specialization: "Artificial Intelligence, Deep Learning, Computer Vision, NLP", phone: "+91-98765-43214", hire_date: "2017-06-01" },
    { user_id: 6, first_name: "Anjali", last_name: "Nair", email: "anjali@university.edu", password: "student456", role: "Student", dept_id: 2, specialization: "Machine Learning, PyTorch", phone: "+91-98765-43215", hire_date: "2023-08-01" },
  ],
  departments: [
    { dept_id: 1, dept_name: "Electrical Engineering", location: "Block A, Lab 101–104", annual_budget: 5000000, established_date: "1985-07-01" },
    { dept_id: 2, dept_name: "Computer Science & AI", location: "Block B, Lab 201–206", annual_budget: 4500000, established_date: "1990-01-01" },
    { dept_id: 3, dept_name: "Finance & Administration", location: "Admin Block, Floor 2", annual_budget: 2000000, established_date: "1985-07-01" },
  ],
  proposals: [
    { proposal_id: 1, title: "Solar-Wind Hybrid Grid for Rural India", abstract: "This project deploys a 5 MW hybrid renewable energy grid combining solar PV with wind turbines in rural Rajasthan, focusing on storage optimisation and off-grid stability for 12 villages.", total_budget_requested: 2500000, duration_months: 24, submission_date: "2024-01-15", status: "Approved", eligibility_check_passed: true, pi_id: 1 },
    { proposal_id: 2, title: "AI-Driven Crop Disease Detection via UAV", abstract: "Deep learning models using CNNs to detect crop diseases from drone imagery, enabling early intervention for 10,000+ farmers across Maharashtra's Vidarbha region.", total_budget_requested: 1800000, duration_months: 18, submission_date: "2024-03-20", status: "Under Review", eligibility_check_passed: true, pi_id: 5 },
    { proposal_id: 3, title: "Quantum Algorithms for Drug Discovery", abstract: "Leveraging variational quantum eigensolver algorithms to simulate molecular interactions for accelerated pharmaceutical research targeting oncology drug candidates.", total_budget_requested: 3200000, duration_months: 36, submission_date: "2024-05-10", status: "Draft", eligibility_check_passed: false, pi_id: 1 },
    { proposal_id: 4, title: "Federated Learning for Healthcare Privacy", abstract: "Training hospital-grade diagnostic models without sharing patient data across institutions, preserving HIPAA compliance while improving model accuracy.", total_budget_requested: 2100000, duration_months: 30, submission_date: "2024-06-01", status: "Submitted", eligibility_check_passed: true, pi_id: 5 },
  ],
  grants: [
    { grant_id: 1, grant_title: "DST Solar Mission Grant 2024", total_amount_awarded: 2500000, start_date: "2024-04-01", end_date: "2026-03-31", status: "Active", funding_agency: "Dept. of Science & Technology", agency_contact_info: "grants@dst.gov.in", reporting_frequency: "Quarterly" },
    { grant_id: 2, grant_title: "ICMR AI in Healthcare 2022", total_amount_awarded: 1200000, start_date: "2022-06-01", end_date: "2024-05-31", status: "Closed", funding_agency: "Indian Council of Medical Research", agency_contact_info: "extramural@icmr.org.in", reporting_frequency: "Biannual" },
  ],
  projects: [
    { project_id: 1, project_title: "Solar-Wind Hybrid Grid", description: "5 MW hybrid renewable energy deployment across 12 villages in Rajasthan.", start_date: "2024-04-01", end_date: "2026-03-31", status: "Active", current_balance: 1820000, department_id: 1, grant_id: 1, pi_id: 1 },
    { project_id: 2, project_title: "AI Crop Disease Detector", description: "CNN-based UAV imagery analysis for early crop disease detection.", start_date: "2022-06-01", end_date: "2024-05-31", status: "Completed", current_balance: 48000, department_id: 2, grant_id: 2, pi_id: 5 },
  ],
  budget_heads: [
    { budgethead_id: 1, project_id: 1, category: "Equipment", allocated_amount: 1000000, spent_amount: 380000, remaining_balance: 620000 },
    { budgethead_id: 2, project_id: 1, category: "Travel", allocated_amount: 300000, spent_amount: 95000, remaining_balance: 205000 },
    { budgethead_id: 3, project_id: 1, category: "Manpower", allocated_amount: 800000, spent_amount: 240000, remaining_balance: 560000 },
    { budgethead_id: 4, project_id: 1, category: "Consumables", allocated_amount: 400000, spent_amount: 165000, remaining_balance: 235000 },
    { budgethead_id: 5, project_id: 2, category: "Equipment", allocated_amount: 600000, spent_amount: 597000, remaining_balance: 3000 },
    { budgethead_id: 6, project_id: 2, category: "Manpower", allocated_amount: 600000, spent_amount: 555000, remaining_balance: 45000 },
  ],
  expenses: [
    { expense_id: 1, project_id: 1, budgethead_id: 1, amount: 280000, date: "2024-05-15", description: "Solar panel procurement — 50 kW mono-PERC modules", receipt_reference: "RCP-2024-001", status: "Approved", approved_by: 4 },
    { expense_id: 2, project_id: 1, budgethead_id: 1, amount: 100000, date: "2024-07-20", description: "Wind turbine hub & blade assembly", receipt_reference: "RCP-2024-002", status: "Approved", approved_by: 4 },
    { expense_id: 3, project_id: 1, budgethead_id: 2, amount: 95000, date: "2024-08-10", description: "Field visit — Rajasthan site survey (4 members, 7 days)", receipt_reference: "RCP-2024-003", status: "Pending", approved_by: null },
    { expense_id: 4, project_id: 1, budgethead_id: 3, amount: 240000, date: "2024-06-01", description: "Research team stipends — Q1 2024–25", receipt_reference: "RCP-2024-004", status: "Approved", approved_by: 4 },
    { expense_id: 5, project_id: 1, budgethead_id: 4, amount: 165000, date: "2024-09-05", description: "Battery cells, wiring & BMS components", receipt_reference: "RCP-2024-005", status: "Pending", approved_by: null },
  ],
  milestones: [
    { milestone_id: 1, project_id: 1, title: "Site Survey & Foundation", due_date: "2024-06-30", completion_date: "2024-06-28", deliverable_description: "Geological survey and grid foundation work for 12 village sites", status: "Completed", report_submitted: true, priority: "High" },
    { milestone_id: 2, project_id: 1, title: "Solar Array Installation", due_date: "2024-11-30", completion_date: null, deliverable_description: "Install and commission 50 kW solar array with MPPT controllers", status: "Pending", report_submitted: false, priority: "High" },
    { milestone_id: 3, project_id: 1, title: "Wind Turbine Erection", due_date: "2025-03-31", completion_date: null, deliverable_description: "Erect 3 × 1.5 MW turbines and run 30-day calibration", status: "Pending", report_submitted: false, priority: "Medium" },
    { milestone_id: 4, project_id: 1, title: "Grid Integration & Live Test", due_date: "2025-09-30", completion_date: null, deliverable_description: "Connect hybrid system to rural grid and run 90-day performance test", status: "Pending", report_submitted: false, priority: "High" },
    { milestone_id: 5, project_id: 2, title: "Dataset Collection", due_date: "2022-12-31", completion_date: "2022-12-20", deliverable_description: "Collect 50,000 UAV images across wheat, rice, and cotton fields", status: "Completed", report_submitted: true, priority: "High" },
    { milestone_id: 6, project_id: 2, title: "Model Training & Validation", due_date: "2023-09-30", completion_date: "2023-09-25", deliverable_description: "Train ResNet-50 and EfficientNet-B4 models; validate at >92% accuracy", status: "Completed", report_submitted: true, priority: "High" },
  ],
  research_outputs: [
    { output_id: 1, project_id: 1, type: "Publication", title: "Hybrid Renewable Microgrids: Optimal Scheduling for Rural Electrification", authors: "Mehta A., Kumar R., Iyer S.", publication_date: "2024-08-01", journal_conference: "IEEE Transactions on Energy Conversion", doi: "10.1109/TEC.2024.0012", status: "Published" },
    { output_id: 2, project_id: 2, type: "Publication", title: "Multi-Scale CNN for Aerial Crop Disease Segmentation", authors: "Singh V., Verma R., Nair A.", publication_date: "2024-01-15", journal_conference: "Nature Food", doi: "10.1038/nfood.2024.012", status: "Published" },
    { output_id: 3, project_id: 2, type: "Patent", title: "Autonomous UAV Pathfinding System for Agricultural Monitoring", authors: "Singh V., Nair A.", publication_date: "2024-03-10", journal_conference: "Indian Patent Office", doi: "IN-PAT-2024-00418", status: "Accepted" },
  ],
  external_calls: [
    { call_id: 1, title: "DST Solar Mission 2025 — Phase II", description: "Funding for grid-scale solar storage and rural electrification; preference for hybrid systems.", deadline: "2025-03-31", max_budget: 5000000, focus: "Solar Energy, Grid Storage, Renewable Energy, Rural Electrification, Wind Energy" },
    { call_id: 2, title: "BIRAC AI in Healthcare Grant", description: "Supporting AI/ML research in diagnostics, drug discovery, and healthcare delivery.", deadline: "2025-02-28", max_budget: 3000000, focus: "Artificial Intelligence, Deep Learning, Healthcare, Drug Discovery, NLP" },
    { call_id: 3, title: "SERB National Science Fellowship", description: "Fundamental research in renewable energy, materials science, and clean technology.", deadline: "2025-04-15", max_budget: 2000000, focus: "Renewable Energy, Materials Science, Clean Technology, Solar Photovoltaics" },
    { call_id: 4, title: "MeitY Quantum Computing Initiative", description: "Quantum computing for optimisation, cryptography, and molecular simulation.", deadline: "2025-05-31", max_budget: 4500000, focus: "Quantum Computing, Optimization, Drug Discovery, Cryptography, Algorithms" },
    { call_id: 5, title: "ICAR Smart Agriculture Grant", description: "AI-driven precision agriculture, crop monitoring, and yield prediction systems.", deadline: "2025-01-31", max_budget: 1800000, focus: "Artificial Intelligence, Computer Vision, Agriculture, Deep Learning, UAV" },
  ],
  works_on: [
    { user_id: 3, project_id: 1, role_in_project: "Research Assistant", hours_per_week: 20, stipend_amount: 35000 },
    { user_id: 6, project_id: 2, role_in_project: "Research Assistant", hours_per_week: 25, stipend_amount: 38000 },
    { user_id: 1, project_id: 1, role_in_project: "Lead Researcher", hours_per_week: 12, stipend_amount: 0 },
    { user_id: 5, project_id: 2, role_in_project: "Lead Researcher", hours_per_week: 14, stipend_amount: 0 },
  ],
};

/* ═══════════════════════════════════════════════════════════════
   DB HYDRATION — replaces mock data with real rows from the API
   Called once after a successful login.
═══════════════════════════════════════════════════════════════ */
export async function initDB() {
  const [users, departments, proposals, grants, projects,
         budgetHeads, expenses, milestones, researchOutputs,
         externalCalls, worksOn] = await Promise.all([
    api.getUsers(), api.getDepartments(), api.getProposals(),
    api.getGrants(), api.getProjects(), api.getBudgetHeads(),
    api.getExpenses(), api.getMilestones(), api.getResearchOutputs(),
    api.getExternalCalls(), api.getWorksOn(),
  ]);
  DB.users            = users;
  DB.departments      = departments;
  DB.proposals        = proposals;
  DB.grants           = grants;
  DB.projects         = projects;
  DB.budget_heads     = budgetHeads;
  DB.expenses         = expenses;
  DB.milestones       = milestones;
  DB.research_outputs = researchOutputs;
  DB.external_calls   = externalCalls;
  DB.works_on         = worksOn;
}

/* ═══════════════════════════════════════════════════════════════
   SQL AUDIT LOG  (subscribable, so the query log re-renders on write)
═══════════════════════════════════════════════════════════════ */
export const sqlLog = [];
const listeners = new Set();

export function logSQL(query, comment = "") {
  sqlLog.unshift({ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString("en-IN", { hour12: false }), query, comment });
  if (sqlLog.length > 30) sqlLog.pop();
  listeners.forEach(fn => fn());
}

export function subscribeSQL(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS  (mirror SQL formatting: FORMAT, DATE_FORMAT, DATEDIFF)
═══════════════════════════════════════════════════════════════ */
export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");
export const inrShort = n => {
  const v = Number(n || 0);
  if (v >= 1e7) return "₹" + (v / 1e7).toFixed(2).replace(/\.?0+$/, "") + " Cr";
  if (v >= 1e5) return "₹" + (v / 1e5).toFixed(2).replace(/\.?0+$/, "") + " L";
  return inr(v);
};
export const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const daysUntil = d => Math.round((new Date(d) - Date.now()) / 86400000);
export const fullName = u => u ? `${u.first_name} ${u.last_name}` : "—";
export const initials = u => u ? (u.first_name?.[0] || "") + (u.last_name?.[0] || "") : "";
