/**
 * Analytical queries Q1 to Q6 from the design report.
 *
 * This is the single source for the query text. The API runs them for the DBA
 * console, and `npm run db:bundle` writes the same text to schema/08_queries.sql
 * so they can be run from the mysql client during a viva.
 */

module.exports = [
  {
    id: "Q1",
    title: "Department budget utilisation",
    concept: "Multi-table join, GROUP BY, HAVING",
    purpose: "Departments that have spent over 20% of the budget allocated to their projects.",
    sql: `SELECT d.dept_name,
       COUNT(DISTINCT p.project_id) AS projects,
       SUM(bh.allocated_amount)     AS allocated,
       SUM(bh.spent_amount)         AS spent,
       ROUND(SUM(bh.spent_amount) / SUM(bh.allocated_amount) * 100, 1) AS utilisation_pct
FROM Department d
JOIN Project    p  ON p.department_id = d.dept_id
JOIN BudgetHead bh ON bh.project_id   = p.project_id
GROUP BY d.dept_id, d.dept_name
HAVING utilisation_pct > 20
ORDER BY utilisation_pct DESC`,
  },
  {
    id: "Q2",
    title: "Expenses above their category average",
    concept: "Correlated subquery",
    purpose: "Approved expenses larger than the average approved expense in the same budget category.",
    sql: `SELECT e.expense_id, e.receipt_reference, bh.category, e.amount, p.project_title
FROM Expense e
JOIN BudgetHead bh ON e.budgethead_id = bh.budgethead_id
JOIN Project    p  ON e.project_id    = p.project_id
WHERE e.status = 'Approved'
  AND e.amount > (SELECT AVG(e2.amount)
                  FROM Expense e2
                  JOIN BudgetHead b2 ON e2.budgethead_id = b2.budgethead_id
                  WHERE b2.category = bh.category AND e2.status = 'Approved')
ORDER BY e.amount DESC
LIMIT 25`,
  },
  {
    id: "Q3",
    title: "Top 3 spending projects per department",
    concept: "CTE and window function",
    purpose: "Ranks each department's projects by approved spending.",
    sql: `WITH proj_spend AS (
  SELECT p.project_id, p.project_title, p.department_id,
         SUM(bh.spent_amount) AS spent
  FROM Project p
  JOIN BudgetHead bh ON bh.project_id = p.project_id
  GROUP BY p.project_id, p.project_title, p.department_id
)
SELECT r.department_id, d.dept_name, r.project_title, r.spent, r.rnk
FROM (SELECT ps.*,
             RANK() OVER (PARTITION BY department_id ORDER BY spent DESC) AS rnk
      FROM proj_spend ps) r
JOIN Department d ON d.dept_id = r.department_id
WHERE r.rnk <= 3
ORDER BY r.department_id, r.rnk`,
  },
  {
    id: "Q4",
    title: "Active projects with no recent milestone",
    concept: "NOT EXISTS",
    purpose: "Active projects with no milestone completed in the last 180 days, for follow-up.",
    sql: `SELECT p.project_id, p.project_title, p.start_date, p.end_date,
       CONCAT(u.first_name, ' ', u.last_name) AS principal_investigator
FROM Project p
JOIN User u ON p.pi_id = u.user_id
WHERE p.status = 'Active'
  AND NOT EXISTS (SELECT 1
                  FROM Milestone m
                  WHERE m.project_id = p.project_id
                    AND m.status = 'Completed'
                    AND m.completion_date >= DATE_SUB(CURDATE(), INTERVAL 180 DAY))
ORDER BY p.end_date`,
  },
  {
    id: "Q5",
    title: "Researcher matching",
    concept: "FULLTEXT index",
    purpose: "Ranks researchers against a topic with MATCH ... AGAINST.",
    params: ["renewable energy solar storage"],
    sql: `SELECT user_id, CONCAT(first_name, ' ', last_name) AS researcher, specialization,
       ROUND(MATCH(specialization) AGAINST (? IN NATURAL LANGUAGE MODE), 3) AS relevance
FROM User
WHERE role = 'PI'
  AND MATCH(specialization) AGAINST (? IN NATURAL LANGUAGE MODE)
ORDER BY relevance DESC
LIMIT 10`,
  },
  {
    id: "Q6",
    title: "Supervision chains",
    concept: "Recursive CTE",
    purpose: "Walks the recursive SUPERVISES relationship from the top of each chain.",
    sql: `WITH RECURSIVE chain AS (
  SELECT s.supervisor_id AS root_id, s.supervisor_id, s.supervisee_id, 1 AS depth
  FROM SUPERVISES s
  WHERE s.supervisor_id NOT IN (SELECT supervisee_id FROM SUPERVISES)
  UNION ALL
  SELECT c.root_id, s.supervisor_id, s.supervisee_id, c.depth + 1
  FROM SUPERVISES s
  JOIN chain c ON s.supervisor_id = c.supervisee_id
  WHERE c.depth < 6
)
SELECT CONCAT(r.first_name, ' ', r.last_name) AS chain_head,
       CONCAT(u.first_name, ' ', u.last_name) AS member,
       u.role, c.depth
FROM chain c
JOIN User r ON c.root_id      = r.user_id
JOIN User u ON c.supervisee_id = u.user_id
ORDER BY c.depth DESC, chain_head
LIMIT 40`,
  },
];
