/**
 * The conceptual (EER) model in Chen notation, transcribed from
 * schema/01_schema_er.sql. Same model as docs/images/eer_chen_notation.png.
 *
 * Entity attributes leave out foreign keys: in Chen notation those are the
 * relationships. Attribute prefixes:
 *   *name   key attribute (solid underline)
 *   ~name   partial key of a weak entity (dashed underline)
 *   /name   derived attribute (dashed oval)
 *   name(a,b,c)  composite attribute
 *
 * Relationship ends are [entity, cardinality, total participation, role].
 * The cardinality on an end says how many of THAT entity one instance of the
 * other entity relates to (Department 1 · employs · N User: each user has one
 * department). Total participation = the foreign key is NOT NULL.
 */

export const ENTITIES = [
  { name: "User", pos: [-6, 0, 0],
    attrs: ["*user_id", "ssn", "name(first_name,middle_initial,last_name)", "email", "password_hash", "role", "phone", "address", "date_of_birth", "hire_date", "specialization"] },
  { name: "Project", pos: [6, 0, 0],
    attrs: ["*project_id", "project_title", "description", "start_date", "end_date", "status", "current_balance"] },
  { name: "Proposal", pos: [-2.2, 5.6, -1],
    attrs: ["*proposal_id", "title", "abstract", "total_budget_requested", "duration_months", "submission_date", "status", "eligibility_check_passed"] },
  { name: "Grant_", pos: [3.4, 5.6, -1],
    attrs: ["*grant_id", "grant_title", "total_amount_awarded", "start_date", "end_date", "status", "funding_agency", "agency_contact_info", "reporting_frequency"] },
  { name: "ResearchOutput", pos: [0.9, 2.8, -0.5],
    attrs: ["*output_id", "type", "title", "authors", "publication_date", "journal_conference", "doi", "status"] },
  { name: "Department", pos: [0, -3.1, 0.5],
    attrs: ["*dept_id", "dept_name", "location", "annual_budget", "established_date"] },
  { name: "Expense", pos: [0, -5.7, 1],
    attrs: ["*expense_id", "amount", "date", "description", "receipt_reference", "status", "approval_date"] },
  { name: "BudgetHead", pos: [7.2, -6.4, 1],
    attrs: ["*budgethead_id", "category", "allocated_amount", "spent_amount", "/remaining_balance", "fiscal_year"] },
  { name: "Equipment", weak: true, pos: [-6.6, -7.6, 1],
    attrs: ["~equipment_id", "equipment_name", "serial_number", "warranty_until", "location"] },
  { name: "ExternalCall", pos: [-8.8, 5.6, -1],
    attrs: ["*call_id", "title", "description", "eligibility_criteria", "deadline", "max_budget"] },
  { name: "FundingAgency", pos: [-12.6, 8.2, -1.5],
    attrs: ["*agency_id", "agency_name", "contact_person", "email", "phone", "address", "website", "funding_focus_areas"] },
  { name: "Dependent", weak: true, pos: [-12.4, 1.8, 0],
    attrs: ["~dependent_name", "relationship", "date_of_birth", "phone"] },
  { name: "Notification", pos: [-12.4, -1.4, 0],
    attrs: ["*notif_id", "message", "is_read", "sent_at"] },
  { name: "Milestone", pos: [11.4, 0, 0],
    attrs: ["*milestone_id", "title", "due_date", "completion_date", "deliverable_description", "status", "report_submitted", "priority"] },
];

export const RELATIONSHIPS = [
  { id: "issues", pos: [-10.9, 7.0, -1.2],
    ends: [["FundingAgency", "1"], ["ExternalCall", "N", true]],
    via: "ExternalCall.agency_id NOT NULL → FundingAgency, ON DELETE CASCADE" },
  { id: "MATCHES", pos: [-7.6, 3.0, -0.5], table: "MATCHES",
    ends: [["ExternalCall", "M"], ["User", "N"]],
    attrs: ["match_score", "match_reason", "notification_sent", "computed_at"],
    via: "table MATCHES, PK (call_id, user_id)" },
  { id: "has", identifying: true, pos: [-9.3, 1.1, 0],
    ends: [["User", "1"], ["Dependent", "N", true]],
    via: "Dependent.user_id is part of PK (user_id, dependent_name), ON DELETE CASCADE" },
  { id: "receives", pos: [-9.3, -0.9, 0],
    ends: [["User", "1"], ["Notification", "N", true]],
    via: "Notification.user_id NOT NULL → User, ON DELETE CASCADE" },
  { id: "SUPERVISES", pos: [-8.4, -3.9, 1.4], table: "SUPERVISES",
    ends: [["User", "M", false, "supervisor"], ["User", "N", false, "supervisee"]],
    attrs: ["relationship_type", "start_date"],
    via: "table SUPERVISES, PK (supervisor_id, supervisee_id), CHECK supervisor_id <> supervisee_id" },
  { id: "employs", pos: [-3.4, -2.4, 0.3],
    ends: [["Department", "1"], ["User", "N"]],
    via: "User.dept_id NULL → Department, ON DELETE SET NULL" },
  { id: "submits", pos: [-4.6, 3.2, -0.5],
    ends: [["User", "1"], ["Proposal", "N", true]],
    via: "Proposal.pi_id NOT NULL → User, ON DELETE RESTRICT" },
  { id: "becomes", pos: [0.6, 5.6, -1],
    ends: [["Proposal", "1"], ["Grant_", "1"]],
    via: "Grant_.proposal_id NULL, UNIQUE → Proposal, ON DELETE SET NULL" },
  { id: "funds", pos: [5.2, 3.1, -0.5],
    ends: [["Grant_", "1"], ["Project", "N"]],
    via: "Project.grant_id NULL → Grant_, ON DELETE SET NULL" },
  { id: "PublicationAuthor", label: "PUBLICATION_\nAUTHOR", pos: [-2.9, 2.0, -0.3], table: "PublicationAuthor",
    ends: [["User", "M"], ["ResearchOutput", "N"]],
    attrs: ["author_position", "contribution_description"],
    via: "table PublicationAuthor, PK (output_id, user_id)" },
  { id: "produces", pos: [4.0, 1.9, -0.3],
    ends: [["Project", "1"], ["ResearchOutput", "N", true]],
    via: "ResearchOutput.project_id NOT NULL → Project, ON DELETE CASCADE" },
  { id: "leads", pos: [0, 0.75, 0],
    ends: [["User", "1"], ["Project", "N", true]],
    via: "Project.pi_id NOT NULL → User, ON DELETE RESTRICT" },
  { id: "WORKS_ON", pos: [0, -0.95, 0], table: "WORKS_ON",
    ends: [["User", "M"], ["Project", "N"]],
    attrs: ["role_in_project", "hours_per_week", "stipend_amount"],
    via: "table WORKS_ON, PK (user_id, project_id)" },
  { id: "hosts", pos: [3.4, -2.4, 0.3],
    ends: [["Department", "1"], ["Project", "N"]],
    via: "Project.department_id NULL → Department, ON DELETE SET NULL" },
  { id: "tracks", pos: [8.7, 0, 0],
    ends: [["Project", "1"], ["Milestone", "N", true]],
    via: "Milestone.project_id NOT NULL → Project, ON DELETE CASCADE" },
  { id: "allocates", pos: [7.8, -3.3, 0.6],
    ends: [["Project", "1"], ["BudgetHead", "N", true]],
    via: "BudgetHead.project_id NOT NULL → Project, ON DELETE CASCADE" },
  { id: "incurs", pos: [3.2, -3.9, 0.6],
    ends: [["Project", "1"], ["Expense", "N", true]],
    via: "Expense.project_id NOT NULL → Project, ON DELETE CASCADE" },
  { id: "charged_to", label: "charged to", pos: [3.6, -6.1, 1],
    ends: [["BudgetHead", "1"], ["Expense", "N", true]],
    via: "Expense.budgethead_id NOT NULL → BudgetHead, ON DELETE RESTRICT" },
  { id: "approves", pos: [-4.2, -4.6, 0.6],
    ends: [["User", "1", false, "approver"], ["Expense", "N"]],
    via: "Expense.approved_by NULL → User, ON DELETE SET NULL" },
  { id: "buys", identifying: true, pos: [-3.3, -7.4, 1],
    ends: [["Expense", "1"], ["Equipment", "N", true]],
    via: "Equipment.expense_id is part of PK (equipment_id, expense_id), ON DELETE CASCADE" },
];

// User specialisation: single-table inheritance on role ENUM NOT NULL,
// so it is disjoint (one value) and total (never NULL).
export const ISA = { superclass: "User", on: "role", disjoint: true, total: true, subclasses: ["Admin", "PI", "Student", "Grant_Officer"] };

export function parseAttr(a) {
  const m = a.match(/^([*~/]?)(\w+)(?:\((.*)\))?$/);
  return {
    name: m[2],
    key: m[1] === "*",
    partial: m[1] === "~",
    derived: m[1] === "/",
    parts: m[3] ? m[3].split(",") : null,
  };
}

export const relLabel = r => (r.label || r.id).replace("\n", "");

// "(min, max)" reading of one end, from the point of view of the OTHER entity.
export function readEnd(r) {
  const [[ea, ca, ta, ra], [eb, cb, tb, rb]] = r.ends;
  const a = ra && r.ends[0][0] === r.ends[1][0] ? ra : ea;
  const b = rb && r.ends[0][0] === r.ends[1][0] ? rb : eb;
  const phrase = (card, total) => card === "1" ? (total ? "exactly one" : "at most one") : (total ? "one or more" : "zero or more");
  return [
    `Each ${a} relates to ${phrase(cb, ta)} ${b}`,
    `Each ${b} relates to ${phrase(ca, tb)} ${a}`,
  ];
}
