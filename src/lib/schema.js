/**
 * The relational schema as data, transcribed from schema/01_schema_er.sql.
 * The 3D schema scene and the Schema page both read from here, so the picture
 * on screen is the same model the viva is about.
 *
 *   kind:  strong | weak (composite PK borrowing an owner key) | link (M:N relationship table)
 *   area:  which EER view the relation belongs to (docs/images/eer_view*.png)
 *   pos:   hand-placed [x, y, z] so each area forms its own cluster
 */

export const AREAS = {
  people:   { label: "Organisation and people" },
  funding:  { label: "External funding" },
  lifecycle:{ label: "Proposal to project" },
  spending: { label: "Spending and outputs" },
};

export const RELATIONS = [
  { name: "Department", kind: "strong", area: "people", pos: [-7.5, 2.6, -1],
    cols: [["dept_id", "PK"], ["dept_name", "NOT NULL"], ["location"], ["annual_budget", "DEFAULT 0"], ["established_date"]] },
  { name: "User", kind: "strong", area: "people", pos: [-4.2, 0.2, 0.6],
    cols: [["user_id", "PK"], ["ssn", "UNIQUE"], ["first_name"], ["last_name"], ["email", "UNIQUE"], ["password_hash", "SHA-256"], ["role", "ENUM · ISA discriminator"], ["specialization", "FULLTEXT"], ["dept_id", "FK → Department, SET NULL"]] },
  { name: "Dependent", kind: "weak", area: "people", pos: [-8.4, -1.6, 1.2],
    cols: [["user_id", "PK, FK → User, CASCADE"], ["dependent_name", "PK"], ["relationship", "ENUM"], ["date_of_birth"]] },
  { name: "Notification", kind: "strong", area: "people", pos: [-6.4, -3.4, -0.8],
    cols: [["notif_id", "PK"], ["user_id", "FK → User, CASCADE"], ["message", "NOT NULL"], ["is_read"], ["sent_at"]] },
  { name: "SUPERVISES", kind: "link", area: "people", pos: [-2.2, -3.0, 2.4],
    cols: [["supervisor_id", "PK, FK → User"], ["supervisee_id", "PK, FK → User"], ["relationship_type", "ENUM"], ["start_date"]],
    note: "CHECK (supervisor_id != supervisee_id)" },

  { name: "FundingAgency", kind: "strong", area: "funding", pos: [-3.0, 4.6, -2.8],
    cols: [["agency_id", "PK"], ["agency_name", "NOT NULL"], ["contact_person"], ["email"], ["funding_focus_areas"]] },
  { name: "ExternalCall", kind: "strong", area: "funding", pos: [0.4, 3.6, -1.8],
    cols: [["call_id", "PK"], ["title", "NOT NULL"], ["eligibility_criteria"], ["deadline", "NOT NULL"], ["max_budget"], ["agency_id", "FK → FundingAgency, CASCADE"]] },
  { name: "MATCHES", kind: "link", area: "funding", pos: [-0.8, 1.6, 2.2],
    cols: [["call_id", "PK, FK → ExternalCall"], ["user_id", "PK, FK → User"], ["match_score", "CHECK 0–100"], ["match_reason"], ["computed_at"]] },

  { name: "Proposal", kind: "strong", area: "lifecycle", pos: [1.2, -0.6, 0.4],
    cols: [["proposal_id", "PK"], ["title", "NOT NULL"], ["total_budget_requested", "CHECK > 0"], ["duration_months", "CHECK > 0"], ["status", "ENUM, DEFAULT Draft"], ["pi_id", "FK → User, RESTRICT"]] },
  { name: "Grant_", kind: "strong", area: "lifecycle", pos: [4.0, 1.6, -0.6],
    cols: [["grant_id", "PK"], ["grant_title", "NOT NULL"], ["total_amount_awarded", "CHECK > 0"], ["start_date"], ["end_date", "CHECK > start_date"], ["status", "ENUM"], ["proposal_id", "FK → Proposal, SET NULL"]] },
  { name: "Project", kind: "strong", area: "lifecycle", pos: [3.4, -2.2, 0.2],
    cols: [["project_id", "PK"], ["project_title", "NOT NULL"], ["start_date"], ["end_date", "CHECK > start_date"], ["status", "ENUM"], ["current_balance", "CHECK ≥ 0"], ["department_id", "FK → Department"], ["grant_id", "FK → Grant_"], ["pi_id", "FK → User, RESTRICT"]] },
  { name: "WORKS_ON", kind: "link", area: "lifecycle", pos: [0.0, -3.8, 1.8],
    cols: [["user_id", "PK, FK → User"], ["project_id", "PK, FK → Project"], ["role_in_project", "ENUM"], ["hours_per_week"], ["stipend_amount"]] },

  { name: "BudgetHead", kind: "strong", area: "spending", pos: [7.0, -0.4, -1.4],
    cols: [["budgethead_id", "PK"], ["project_id", "FK → Project, CASCADE"], ["category", "ENUM"], ["allocated_amount", "CHECK > 0"], ["spent_amount", "DEFAULT 0"], ["remaining_balance", "GENERATED (allocated − spent)"]] },
  { name: "Expense", kind: "strong", area: "spending", pos: [8.2, -3.0, 0.6],
    cols: [["expense_id", "PK"], ["amount", "CHECK > 0"], ["receipt_reference", "trigger: no duplicates"], ["status", "ENUM, DEFAULT Pending"], ["budgethead_id", "FK → BudgetHead, RESTRICT"], ["project_id", "FK → Project, CASCADE"], ["approved_by", "FK → User, SET NULL"]] },
  { name: "Equipment", kind: "weak", area: "spending", pos: [10.6, -1.6, -0.4],
    cols: [["equipment_id", "PK"], ["expense_id", "PK, FK → Expense, CASCADE"], ["equipment_name", "NOT NULL"], ["serial_number"], ["warranty_until"]] },
  { name: "Milestone", kind: "strong", area: "spending", pos: [5.6, -4.8, -1.2],
    cols: [["milestone_id", "PK"], ["project_id", "FK → Project, CASCADE"], ["title", "NOT NULL"], ["due_date", "NOT NULL"], ["status", "ENUM"], ["priority", "ENUM"]] },
  { name: "ResearchOutput", kind: "strong", area: "spending", pos: [6.2, 2.8, 1.4],
    cols: [["output_id", "PK"], ["project_id", "FK → Project, CASCADE"], ["type", "ENUM"], ["title", "NOT NULL"], ["doi"], ["status", "ENUM"]] },
  { name: "PublicationAuthor", kind: "link", area: "spending", pos: [2.6, 4.4, 2.0],
    cols: [["output_id", "PK, FK → ResearchOutput"], ["user_id", "PK, FK → User"], ["author_position", "NOT NULL"], ["contribution_description"]] },
];

// Every foreign key in the DDL, child → parent, with its ON DELETE action.
export const FKS = [
  ["User", "Department", "SET NULL"],
  ["Dependent", "User", "CASCADE"],
  ["Notification", "User", "CASCADE"],
  ["SUPERVISES", "User", "CASCADE"],
  ["ExternalCall", "FundingAgency", "CASCADE"],
  ["MATCHES", "ExternalCall", "CASCADE"],
  ["MATCHES", "User", "CASCADE"],
  ["Proposal", "User", "RESTRICT"],
  ["Grant_", "Proposal", "SET NULL"],
  ["Project", "Department", "SET NULL"],
  ["Project", "Grant_", "SET NULL"],
  ["Project", "User", "RESTRICT"],
  ["WORKS_ON", "User", "CASCADE"],
  ["WORKS_ON", "Project", "CASCADE"],
  ["BudgetHead", "Project", "CASCADE"],
  ["Expense", "BudgetHead", "RESTRICT"],
  ["Expense", "Project", "CASCADE"],
  ["Expense", "User", "SET NULL"],
  ["Equipment", "Expense", "CASCADE"],
  ["Milestone", "Project", "CASCADE"],
  ["ResearchOutput", "Project", "CASCADE"],
  ["PublicationAuthor", "ResearchOutput", "CASCADE"],
  ["PublicationAuthor", "User", "CASCADE"],
];

// The path money takes, used by the landing page's "follow one expense" scene.
export const MONEY_PATH = ["Proposal", "Grant_", "Project", "BudgetHead", "Expense"];

// Business rules and the database object that enforces each one.
export const RULES = [
  { rule: "An expense can never exceed what is left in its budget head", object: "balance_check_before_expense", kind: "BEFORE INSERT trigger" },
  { rule: "Approving an expense moves money in the same transaction", object: "update_budget_on_approval", kind: "AFTER UPDATE trigger" },
  { rule: "A PI may lead at most five active projects", object: "active_project_limit_pi", kind: "BEFORE INSERT trigger" },
  { rule: "The same receipt cannot be claimed twice", object: "prevent_duplicate_expense_receipt", kind: "BEFORE INSERT trigger" },
  { rule: "Nobody supervises themselves", object: "chk_no_self_supervise", kind: "CHECK constraint" },
  { rule: "Grants and projects end after they start", object: "chk_grant_dates, chk_project_dates", kind: "CHECK constraint" },
  { rule: "Remaining balance is always allocated minus spent", object: "BudgetHead.remaining_balance", kind: "Generated column" },
  { rule: "Projects past their end date close themselves", object: "auto_close_project", kind: "Trigger + nightly event" },
];
