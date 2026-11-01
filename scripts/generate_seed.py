#!/usr/bin/env python3
"""Generate schema/07_seed_bulk.sql, the volume data on top of 06_seed_data.sql.

Run from the repository root:  python scripts/generate_seed.py

The output is deterministic (fixed random seed), so re-running it produces the
same file. The rules that shape the data are the project's business rules:

* no PI leads more than 5 active projects (BR3)
* expenses are inserted as Pending, then approved by UPDATE, so the triggers
  produce spent_amount and current_balance instead of the seed typing them in
* approved expenses never exceed a head's allocation (BR1)
* receipt references are unique within a project (BR4)
* every grant comes from an Approved proposal (at most one grant per proposal)

Keys are explicit and continue after the rows in 06_seed_data.sql.
"""

import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "schema" / "07_seed_bulk.sql"
rng = random.Random(25)  # Group-25


def q(v):
    """Render a Python value as a SQL literal."""
    if v is None:
        return "NULL"
    if v is True:
        return "TRUE"
    if v is False:
        return "FALSE"
    if isinstance(v, date):
        return f"'{v.isoformat()}'"
    if isinstance(v, str):
        return "'" + v.replace("'", "''") + "'"
    return str(v)


def insert(table, columns, rows):
    head = f"INSERT INTO {table}\n  ({', '.join(columns)}) VALUES\n"
    body = ",\n".join("  (" + ", ".join(q(v) for v in r) + ")" for r in rows)
    return head + body + ";\n"


def days(d, n):
    return d + timedelta(days=n)


# ── Reference data ───────────────────────────────────────────────
DEPARTMENTS = [
    (4, "Mechanical Engineering", "Block C, Workshop 301–305", 4200000, date(1988, 7, 1)),
    (5, "Biological Sciences", "Block D, Lab 401–408", 3800000, date(1995, 8, 1)),
    (6, "Chemical Engineering", "Block E, Lab 501–504", 3600000, date(1992, 7, 1)),
    (7, "Civil Engineering", "Block F, Lab 601–603", 3100000, date(1987, 7, 1)),
    (8, "Physics", "Block G, Lab 701–706", 2900000, date(1998, 1, 1)),
]

# Topic pools per department. The first word groups drive FULLTEXT matching.
TOPICS = {
    1: ["Power Electronics", "Smart Grid Control", "Battery Management", "Renewable Energy Integration", "Wireless Power Transfer"],
    2: ["Natural Language Processing", "Computer Vision", "Federated Learning", "Graph Neural Networks", "Cybersecurity Analytics"],
    4: ["Additive Manufacturing", "Robotics Kinematics", "Thermal Systems", "Composite Materials", "Vibration Analysis"],
    5: ["Genomics", "Drug Discovery", "Synthetic Biology", "Microbiome Research", "Protein Folding"],
    6: ["Catalysis", "Carbon Capture", "Membrane Separation", "Process Intensification", "Green Hydrogen"],
    7: ["Structural Health Monitoring", "Earthquake Engineering", "Sustainable Concrete", "Urban Hydrology", "Geotechnical Modelling"],
    8: ["Quantum Computing", "Photonics", "Condensed Matter", "Nanomaterials", "Astroparticle Physics"],
}

FIRST = """Aarav Aditi Akash Ananya Arvind Bhavna Chetan Deepa Dev Divya Farhan Gauri Harsh Isha
Jatin Kavya Kiran Lata Manish Meera Mohan Naina Nikhil Pooja Prakash Radhika Rajat Riya
Rohan Sahil Sakshi Sanjay Shreya Siddharth Sunita Tanvi Tarun Uma Varun Yash Zoya Neha
Omkar Pallavi Ravi Swati Tushar Vidya""".split()
LAST = """Agarwal Bhat Chatterjee Desai Fernandes Ghosh Hegde Iyer Jain Joshi Kapoor Kulkarni
Malhotra Menon Mishra Naidu Pandey Pillai Rao Reddy Saxena Shetty Sinha Srinivasan Tiwari
Trivedi Varma Yadav Bose Dutta""".split()

people = []  # (id, first, last, role, dept, specialization, hired)
used = {("Priya", "Sharma"), ("Arjun", "Mehta"), ("Vikram", "Singh"),
        ("Rahul", "Verma"), ("Anjali", "Nair"), ("Sneha", "Patel")}


def person(uid, role, dept, spec, hired):
    while True:
        first, last = rng.choice(FIRST), rng.choice(LAST)
        if (first, last) not in used:
            used.add((first, last))
            break
    people.append((uid, first, last, role, dept, spec, hired))
    return uid


uid = 7
pis_by_dept = {}
for dept, topics in TOPICS.items():
    for i in range(3):
        spec = ", ".join(rng.sample(topics, 3))
        hired = date(rng.randint(2008, 2021), rng.choice([1, 7, 8]), 1)
        pis_by_dept.setdefault(dept, []).append(person(uid, "PI", dept, spec, hired))
        uid += 1

students_by_dept = {}
for dept, topics in TOPICS.items():
    for i in range(4):
        spec = ", ".join(rng.sample(topics, 2))
        hired = date(rng.randint(2022, 2025), 8, 1)
        students_by_dept.setdefault(dept, []).append(person(uid, "Student", dept, spec, hired))
        uid += 1

officers = [6]
for i in range(2):
    officers.append(person(uid, "Grant_Officer", 3, "Finance, Grant Compliance, Audit", date(2020 + i, 4, 1)))
    uid += 1

AGENCIES = [
    (6, "Anusandhan National Research Foundation", "Dr. L. Bhatia", "calls@anrf.gov.in", "https://anrf.gov.in", "Basic Science, Engineering, Quantum Computing, Materials"),
    (7, "Dept. of Biotechnology", "Dr. N. Menon", "grants@dbt.gov.in", "https://dbtindia.gov.in", "Genomics, Drug Discovery, Synthetic Biology, Microbiome"),
    (8, "Ministry of New and Renewable Energy", "Dr. K. Rana", "rnd@mnre.gov.in", "https://mnre.gov.in", "Green Hydrogen, Renewable Energy, Battery Storage, Carbon Capture"),
]
AGENCY_NAMES = {1: "Dept. of Science & Technology", 2: "Indian Council of Medical Research", 3: "SERB",
                4: "MeitY", 5: "ICAR", 6: AGENCIES[0][1], 7: AGENCIES[1][1], 8: AGENCIES[2][1]}
AGENCY_MAIL = {1: "grants@dst.gov.in", 2: "extramural@icmr.org.in", 3: "grants@serb.gov.in", 4: "grants@meity.gov.in",
               5: "grants@icar.gov.in", 6: AGENCIES[0][3], 7: AGENCIES[1][3], 8: AGENCIES[2][3]}
DEPT_AGENCY = {1: [1, 8], 2: [4, 3], 4: [3, 6], 5: [7, 2], 6: [8, 6], 7: [3, 1], 8: [6, 4]}

calls = []
call_id = 6
for dept, topics in TOPICS.items():
    for topic in topics[:3]:
        agency = rng.choice(DEPT_AGENCY[dept])
        deadline = days(date(2026, 12, 1), rng.randint(0, 200))
        if rng.random() < 0.15:
            deadline = days(date(2026, 3, 1), rng.randint(0, 150))  # already closed
        budget = rng.randrange(1500000, 6000000, 100000)
        calls.append((call_id, f"{AGENCY_NAMES[agency]}: {topic} Programme",
                      f"Applied and fundamental research in {topic.lower()} with measurable outcomes.",
                      "Full-time faculty at a recognised institution", deadline, budget, agency))
        call_id += 1

# ── Proposals, grants, projects ──────────────────────────────────
VERBS = ["Scalable", "Low-Cost", "Data-Driven", "Field-Ready", "Adaptive", "Sustainable"]
STATUS_POOL = ["Draft", "Submitted", "Submitted", "Under Review", "Under Review", "Rejected"]
HEAD_SPLIT = [("Equipment", 0.40), ("Travel", 0.10), ("Manpower", 0.35), ("Consumables", 0.15)]

proposals, grants, projects, heads = [], [], [], []
expenses, milestones, outputs, authors, works_on = [], [], [], [], []
active_count = {}
pid, gid, prj, bh, eid, mid, oid = 6, 3, 3, 7, 8, 7, 4
approve_ids, reject_ids = [], []

SPEND = {
    "Equipment": ["Spectrum analyser", "High-precision test rig", "Workstation with GPU", "Sensor array", "Data acquisition unit"],
    "Travel": ["Field visit", "Conference travel", "Site inspection", "Collaborator visit"],
    "Manpower": ["Research assistant stipends", "Project associate salary", "Technician support"],
    "Consumables": ["Lab consumables", "Reagents and chemicals", "Fabrication materials", "Calibration kits"],
}
MILESTONES = ["Literature Review and Plan", "Prototype Build", "Pilot Study", "Field Validation", "Final Report"]
VENUES = ["IEEE Access", "Nature Communications", "ACS Applied Materials", "Elsevier Energy", "ACM Computing Surveys", "Physical Review Letters"]

for dept, topics in TOPICS.items():
    for pi in pis_by_dept[dept]:
        for n in range(rng.randint(2, 3)):
            topic = rng.choice(topics)
            title = f"{rng.choice(VERBS)} {topic} for Indian Conditions, Phase {n + 1}"
            abstract = (f"This work advances {topic.lower()} through {rng.choice(['simulation', 'field trials', 'laboratory experiments'])} "
                        f"and builds open datasets for {rng.choice(['rural', 'urban', 'industrial', 'clinical'])} deployment.")
            budget = rng.randrange(800000, 3000000, 50000)
            months = rng.choice([18, 24, 30, 36])

            funded = n == 0 or rng.random() < 0.45
            if not funded:
                status = rng.choice(STATUS_POOL)
                proposals.append((pid, title, abstract, budget, months, days(date(2026, 1, 15), rng.randint(0, 280)),
                                  status, status != "Draft", pi))
                pid += 1
                continue

            start = days(date(2023, 1, 1), rng.randint(0, 1050))
            end = days(start, months * 30)
            submitted = days(start, -rng.randint(60, 150))
            proposals.append((pid, title, abstract, budget, months, submitted, "Approved", True, pi))

            agency = rng.choice(DEPT_AGENCY[dept])
            live = end > date(2026, 12, 31)
            # BR3: a PI may lead at most 5 active projects
            live = live and active_count.get(pi, 0) < 5
            grant_status = "Active" if live else "Closed"
            grants.append((gid, f"{AGENCY_NAMES[agency]} Award: {topic}", budget, start, end, grant_status,
                           AGENCY_NAMES[agency], AGENCY_MAIL[agency],
                           rng.choice(["Monthly", "Quarterly", "Biannual", "Annual"]), pid))

            project_status = "Active" if live else "Completed"
            if live:
                active_count[pi] = active_count.get(pi, 0) + 1
            projects.append((prj, f"{topic}: {title.split()[0]} Study {prj}",
                             f"Delivers the aims of proposal {pid} on {topic.lower()}.",
                             start, end, project_status, budget, dept, gid, pi))

            # Budget heads split the award exactly
            remaining = budget
            head_rows = []
            for i, (cat, share) in enumerate(HEAD_SPLIT):
                alloc = remaining if i == len(HEAD_SPLIT) - 1 else round(budget * share, -2)
                remaining -= alloc
                head_rows.append((bh, cat, alloc))
                heads.append((bh, prj, cat, alloc, start.year))
                bh += 1

            # Expenses: approved ones stay under 80% of each head
            receipt = 1
            for head_id, cat, alloc in head_rows:
                budget_left = alloc * 0.8
                for _ in range(rng.randint(1, 3)):
                    amount = float(rng.randrange(5000, max(6000, int(alloc * 0.3)), 500))
                    if amount > budget_left:
                        continue
                    budget_left -= amount
                    window = max(1, (min(end, date(2026, 11, 1)) - start).days)
                    when = days(start, rng.randint(0, window))
                    roll = rng.random()
                    expenses.append((eid, prj, head_id, amount, when, f"{rng.choice(SPEND[cat])} for {topic.lower()}",
                                     f"RCP-{prj:03d}-{receipt:03d}"))
                    receipt += 1
                    # Open pending items only make sense on live projects
                    if live and roll < 0.18:
                        pass
                    elif roll < 0.26:
                        reject_ids.append(eid)
                    else:
                        approve_ids.append(eid)
                    eid += 1

            # Milestones across the project term
            for i, ms in enumerate(MILESTONES):
                due = days(start, int((end - start).days * (i + 1) / len(MILESTONES)))
                done = due < date(2026, 11, 1)
                if done and rng.random() < 0.1 and live:
                    milestones.append((mid, prj, ms, due, None, f"{ms} for {topic.lower()}", "Delayed", False, "High"))
                elif done:
                    milestones.append((mid, prj, ms, due, days(due, -rng.randint(0, 12)), f"{ms} for {topic.lower()}",
                                       "Completed", True, rng.choice(["High", "Medium", "Low"])))
                else:
                    milestones.append((mid, prj, ms, due, None, f"{ms} for {topic.lower()}", "Pending", False,
                                       rng.choice(["High", "Medium", "Low"])))
                mid += 1

            # Team: the PI leads, two or three students assist
            works_on.append((pi, prj, "Lead Researcher", rng.randint(8, 16), 0))
            team = rng.sample(students_by_dept[dept], rng.randint(2, 3))
            for s in team:
                works_on.append((s, prj, "Research Assistant", rng.randint(12, 28), rng.randrange(20000, 45000, 1000)))

            # Outputs with ordered authorship
            for _ in range(rng.randint(1, 2)):
                kind = rng.choice(["Publication", "Publication", "Publication", "Patent", "Report"])
                pub = days(start, rng.randint(200, 900))
                venue = "Indian Patent Office" if kind == "Patent" else ("Funder report" if kind == "Report" else rng.choice(VENUES))
                state = "Published" if pub < date(2026, 6, 1) else rng.choice(["Submitted", "Accepted"])
                lookup = {p[0]: p for p in people}
                names = [lookup[x] for x in [pi] + team[:2]]
                cite = ", ".join(f"{p[2]} {p[1][0]}." for p in names)
                doi = f"10.5555/unigrant.{oid:04d}" if kind == "Publication" else None
                outputs.append((oid, prj, kind, f"{topic}: Results from Study {prj}" + (f" (Part {oid})" if kind != "Report" else " Annual Report"),
                                cite, pub, venue, doi, state))
                for pos, a in enumerate([pi] + team[:2], start=1):
                    authors.append((oid, a, pos, "Principal investigator" if pos == 1 else "Experiments and analysis"))
                oid += 1

            pid += 1
            gid += 1
            prj += 1

# Two pending expenses that a grant officer can act on during a demo
# already exist in 06_seed_data.sql (RCP-2026-003 and RCP-2026-005).

# ── Weak entities and recursive relationship ─────────────────────
supervises = []
for dept, students in students_by_dept.items():
    pis = pis_by_dept[dept]
    for i, s in enumerate(students):
        supervises.append((pis[i % len(pis)], s, "PhD Advisor", date(rng.randint(2022, 2025), 8, 1)))
    # senior mentors a junior PI, so the chain query has depth
    supervises.append((pis[0], pis[1], "Mentor", date(2021, 1, 15)))
    supervises.append((pis[1], pis[2], "Co-Supervisor", date(2022, 1, 15)))

dependents = []
for p in rng.sample([x for x in people if x[3] == "PI"], 12):
    dependents.append((p[0], f"{rng.choice(FIRST)} {p[2]}", rng.choice(["Spouse", "Child", "Parent"]),
                       date(rng.randint(1960, 2015), rng.randint(1, 12), rng.randint(1, 28)), None))

equipment = []
for e in expenses:
    head = next(h for h in heads if h[0] == e[2])
    if head[2] == "Equipment" and e[0] in approve_ids and len(equipment) < 30:
        n = len(equipment) + 1
        equipment.append((f"EQ-{n:04d}", e[0], e[5].split(" for ")[0], f"SN{rng.randint(100000, 999999)}",
                          days(e[4], 730), f"Department lab, project {e[1]}"))

notifications = []
for m in [x for x in milestones if x[6] == "Pending"][:20]:
    owner = next(p for p in projects if p[0] == m[1])
    notifications.append((owner[9], f"Upcoming milestone: {m[2]} on project {owner[1]}", False))
for m in [x for x in milestones if x[6] == "Delayed"][:10]:
    owner = next(p for p in projects if p[0] == m[1])
    notifications.append((owner[9], f"Delayed milestone: {m[2]} on project {owner[1]}", False))

# ── Output ───────────────────────────────────────────────────────
user_rows = [
    (p[0], f"SSN-{p[0]:05d}", p[1], p[2], f"{p[1].lower()}.{p[2].lower()}@university.edu", p[3], p[4], p[5], p[6],
     f"+91-90000-{p[0]:05d}")
    for p in people
]

parts = [
    "-- ============================================================\n"
    "--  UniGrant — Bulk Seed Data (generated, do not edit by hand)\n"
    "--  Owner: Lakshya Sachdeva\n"
    "--  Source: scripts/generate_seed.py (deterministic)\n"
    "-- ============================================================\n"
    "--  Run after 06_seed_data.sql. All people are fictional.\n"
    "--  Every generated user signs in with the password demo123.\n"
    "--  Expenses go in as Pending and are approved by UPDATE, so the\n"
    "--  triggers produce spent_amount and current_balance.\n"
    "-- ============================================================\n\n"
    "USE unigrant;\n",
    insert("Department", ["dept_id", "dept_name", "location", "annual_budget", "established_date"], DEPARTMENTS),
]

users_sql = insert("User", ["user_id", "ssn", "first_name", "last_name", "email", "role", "dept_id",
                            "specialization", "hire_date", "phone", "password_hash"],
                   [r + ("@@HASH@@",) for r in user_rows]).replace("'@@HASH@@'", "SHA2('demo123', 256)")
parts += [
    users_sql,
    insert("FundingAgency", ["agency_id", "agency_name", "contact_person", "email", "website", "funding_focus_areas"], AGENCIES),
    insert("ExternalCall", ["call_id", "title", "description", "eligibility_criteria", "deadline", "max_budget", "agency_id"], calls),
    insert("Proposal", ["proposal_id", "title", "abstract", "total_budget_requested", "duration_months", "submission_date",
                        "status", "eligibility_check_passed", "pi_id"], proposals),
    insert("Grant_", ["grant_id", "grant_title", "total_amount_awarded", "start_date", "end_date", "status", "funding_agency",
                      "agency_contact_info", "reporting_frequency", "proposal_id"], grants),
    insert("Project", ["project_id", "project_title", "description", "start_date", "end_date", "status", "current_balance",
                       "department_id", "grant_id", "pi_id"], projects),
    insert("BudgetHead", ["budgethead_id", "project_id", "category", "allocated_amount", "fiscal_year"], heads),
    "-- All Pending first: the BEFORE INSERT triggers check each row.\n"
    + insert("Expense", ["expense_id", "project_id", "budgethead_id", "amount", "date", "description", "receipt_reference"], expenses),
    "-- Approval runs update_budget_on_approval for every row.\n"
    f"UPDATE Expense\nSET status = 'Approved', approved_by = 6, approval_date = DATE_ADD(date, INTERVAL 5 DAY)\n"
    f"WHERE expense_id IN ({', '.join(map(str, approve_ids))});\n",
    f"UPDATE Expense\nSET status = 'Rejected'\nWHERE expense_id IN ({', '.join(map(str, reject_ids))});\n",
    insert("Milestone", ["milestone_id", "project_id", "title", "due_date", "completion_date", "deliverable_description",
                         "status", "report_submitted", "priority"], milestones),
    insert("ResearchOutput", ["output_id", "project_id", "type", "title", "authors", "publication_date", "journal_conference",
                              "doi", "status"], outputs),
    insert("PublicationAuthor", ["output_id", "user_id", "author_position", "contribution_description"], authors),
    insert("WORKS_ON", ["user_id", "project_id", "role_in_project", "hours_per_week", "stipend_amount"], works_on),
    insert("SUPERVISES", ["supervisor_id", "supervisee_id", "relationship_type", "start_date"], supervises),
    insert("Dependent", ["user_id", "dependent_name", "relationship", "date_of_birth", "phone"], dependents),
    insert("Equipment", ["equipment_id", "expense_id", "equipment_name", "serial_number", "warranty_until", "location"], equipment),
    insert("Notification", ["user_id", "message", "is_read"], notifications),
    "-- ============================================================\n"
    "--  END: schema/07_seed_bulk.sql\n"
    "-- ============================================================\n",
]

OUT.write_text("\n".join(parts), encoding="utf-8", newline="\n")
total = (len(DEPARTMENTS) + len(people) + len(AGENCIES) + len(calls) + len(proposals) + len(grants) + len(projects) + len(heads)
         + len(expenses) + len(milestones) + len(outputs) + len(authors) + len(works_on) + len(supervises)
         + len(dependents) + len(equipment) + len(notifications))
print(f"wrote {OUT.name}: {total} rows, {len(projects)} projects, {len(expenses)} expenses")
