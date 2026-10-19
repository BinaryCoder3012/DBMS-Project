/**
 * Role-based navigation. Each role sees only the screens its MySQL role has
 * privileges for (schema/04_rbac.sql), so the menu mirrors the GRANTs.
 */

export const NAV = {
  Admin: [
    { section: "Overview" },
    { id: "dashboard", label: "Overview" },
    { id: "analytics", label: "Analytics" },
    { section: "Records" },
    { id: "proposals", label: "Proposals" },
    { id: "grants", label: "Grants" },
    { id: "projects", label: "Projects" },
    { id: "expenses", label: "Expenses" },
    { id: "users", label: "People" },
    { id: "departments", label: "Departments" },
    { section: "Database" },
    { id: "schema", label: "Schema" },
    { id: "dba", label: "DBA console" },
    { id: "ai", label: "Grant matcher" },
  ],
  PI: [
    { section: "Overview" },
    { id: "dashboard", label: "My overview" },
    { section: "Research" },
    { id: "proposals", label: "Proposals" },
    { id: "projects", label: "My projects" },
    { id: "milestones", label: "Milestones" },
    { id: "outputs", label: "Research outputs" },
    { section: "Money" },
    { id: "expenses", label: "Expenses" },
    { section: "Tools" },
    { id: "ai", label: "Grant matcher" },
    { id: "schema", label: "Schema" },
  ],
  Student: [
    { section: "Overview" },
    { id: "dashboard", label: "Overview" },
    { section: "My work" },
    { id: "projects", label: "Assigned projects" },
    { id: "milestones", label: "Milestones" },
    { id: "outputs", label: "Research outputs" },
    { section: "Reference" },
    { id: "schema", label: "Schema" },
  ],
  Grant_Officer: [
    { section: "Overview" },
    { id: "dashboard", label: "Overview" },
    { section: "Money" },
    { id: "expenses", label: "Expense approvals" },
    { id: "grants", label: "Grants" },
    { id: "proposals", label: "Proposals" },
    { section: "Reference" },
    { id: "schema", label: "Schema" },
  ],
};

// Identity hues for each role: pale tint for backgrounds, deep tone for text.
export const ROLES = {
  Admin:         { label: "Admin",         db: "admin_role",         tint: "#E4DFF2", ink: "#3F3380" },
  PI:            { label: "PI",            db: "pi_role",            tint: "#DCE8F0", ink: "#1F4E6E" },
  Grant_Officer: { label: "Grant officer", db: "grant_officer_role", tint: "#F1E6D2", ink: "#7A4B12" },
  Student:       { label: "Student",       db: "student_role",       tint: "#DCEDE2", ink: "#1F5C45" },
};

export const DEMO_ACCOUNTS = [
  { email: "priya@university.edu",  pass: "admin123",   role: "Admin",         name: "Priya Sharma",  can: "Everything, including the DBA console" },
  { email: "arjun@university.edu",  pass: "pi123",      role: "PI",            name: "Prof. Arjun Mehta", can: "Write proposals, log expenses" },
  { email: "sneha@university.edu",  pass: "go123",      role: "Grant_Officer", name: "Sneha Patel",   can: "Approve or reject expenses" },
  { email: "rahul@university.edu",  pass: "student123", role: "Student",       name: "Rahul Verma",   can: "Read assigned projects through a view" },
];
