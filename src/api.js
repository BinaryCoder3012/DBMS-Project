/**
 * UniGrant — Frontend API Client
 * ────────────────────────────────
 * Thin fetch wrapper that talks to the Express backend at /api/*.
 * Vite proxies all /api requests to http://localhost:3001 in dev.
 *
 * HOW IT WORKS:
 *   Browser → fetch('/api/...') → Vite proxy → Express (port 3001) → MySQL
 *
 * Every function returns a Promise that resolves to parsed JSON,
 * or rejects with an Error whose message comes from the server.
 */

const BASE = "/api";

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // Calls POST /api/auth/login → server checks email + SHA2(password,256) in MySQL
  login: (email, password) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),

  // ── Data loaders (GET all rows for each table) ─────────────────────────────
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

  // ── Mutations ─────────────────────────────────────────────────────────────
  createProposal: (data) =>
    req("/proposals", { method: "POST", body: JSON.stringify(data) }),

  createExpense: (data) =>
    req("/expenses", { method: "POST", body: JSON.stringify(data) }),

  approveExpense: (id, approved_by) =>
    req(`/expenses/${id}/approve`, {
      method: "PATCH",
      body: JSON.stringify({ approved_by }),
    }),

  rejectExpense: (id) =>
    req(`/expenses/${id}/reject`, { method: "PATCH", body: JSON.stringify({}) }),
};
