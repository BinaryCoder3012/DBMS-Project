/**
 * UniGrant — Frontend API Client
 * ────────────────────────────────
 * Thin fetch wrapper that talks to the Express backend at /api/*.
 * Vite proxies all /api requests to http://localhost:3001 in dev.
 *
 * HOW IT WORKS:
 *   Browser → fetch('/api/...') → Vite proxy → Express (port 3001) → MySQL
 *
 * Every function returns a Promise that resolves to parsed JSON, or rejects
 * with an Error carrying the server's message and HTTP status. A rejection
 * with no status means the server could not be reached at all.
 */

const BASE = "/api";
let token = null;

async function req(path, options = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new Error("The server could not be reached.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const send = (method, path, body = {}) => req(path, { method, body: JSON.stringify(body) });

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // Calls POST /api/auth/login → server checks email + SHA2(password,256) in MySQL
  login: async (email, password) => {
    const user = await send("POST", "/auth/login", { email, password });
    token = user.token;
    return user;
  },
  logout: () => { token = null; },

  // ── Data loaders ──────────────────────────────────────────────────────────
  getUsers:           () => req("/users"),
  getDepartments:     () => req("/departments"),
  getProposals:       () => req("/proposals"),
  getGrants:          () => req("/grants"),
  getProjects:        () => req("/projects"),
  getBudgetHeads:     () => req("/budget-heads"),
  getExpenses:        () => req("/expenses"),
  getMilestones:      () => req("/milestones"),
  getResearchOutputs: () => req("/research-outputs"),
  getExternalCalls:   () => req("/external-calls"),
  getWorksOn:         () => req("/works-on"),

  // ── Workflow W1: proposals and awards ─────────────────────────────────────
  createProposal: data => send("POST", "/proposals", data),
  setProposalStatus: (id, status) => send("PATCH", `/proposals/${id}/status`, { status }),
  awardGrant: data => send("POST", "/grants/award", data),
  updateProposal: (id, data) => send("PATCH", `/proposals/${id}`, data),
  setEligibility: (id, eligible) => send("PATCH", `/proposals/${id}/eligibility`, { eligible }),
  deleteProposal: id => send("DELETE", `/proposals/${id}`),

  // ── Project records ───────────────────────────────────────────────────────
  createMilestone: data => send("POST", "/milestones", data),
  updateMilestone: (id, data) => send("PATCH", `/milestones/${id}`, data),
  createOutput: data => send("POST", "/research-outputs", data),
  setOutputStatus: (id, status) => send("PATCH", `/research-outputs/${id}`, { status }),
  deleteOutput: id => send("DELETE", `/research-outputs/${id}`),

  // ── Admin: people and departments ─────────────────────────────────────────
  createUser: data => send("POST", "/users", data),
  createDepartment: data => send("POST", "/departments", data),
  deleteDepartment: id => send("DELETE", `/departments/${id}`),

  // ── Workflow W2: expenses ─────────────────────────────────────────────────
  createExpense: data => send("POST", "/expenses", data),
  approveExpense: id => send("PATCH", `/expenses/${id}/approve`),
  rejectExpense: id => send("PATCH", `/expenses/${id}/reject`),
  withdrawExpense: id => send("DELETE", `/expenses/${id}`),

  // ── Team and notifications ────────────────────────────────────────────────
  addTeamMember: (projectId, data) => send("POST", `/projects/${projectId}/team`, data),
  removeTeamMember: (projectId, userId) => send("DELETE", `/projects/${projectId}/team/${userId}`),
  getNotifications: () => req("/notifications"),
  markNotificationsRead: () => send("PATCH", "/notifications/read"),

  // ── Workflow W3: search and reports ───────────────────────────────────────
  search: q => req(`/search?q=${encodeURIComponent(q)}`),
  matchCalls: userId => send("POST", `/match/${userId}`),
  analytics: () => req("/reports/analytics"),
  departmentReport: id => req(`/reports/department/${id}`),
  reportQueries: () => req("/reports/queries"),
  runQuery: (id, term = "") => req(`/reports/queries/${id}?term=${encodeURIComponent(term)}`),
};
