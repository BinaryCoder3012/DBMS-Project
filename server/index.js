/**
 * UniGrant — Express + MySQL2 REST API
 * ──────────────────────────────────────
 * Runs on port 3001 (Vite proxies /api → here).
 *
 * Start:  node index.js
 * Dev:    nodemon index.js
 *
 * Env vars (set in your shell or a .env file with dotenv):
 *   DB_HOST   – default: localhost
 *   DB_USER   – default: root
 *   DB_PASS   – default: (empty)
 *   DB_NAME   – default: unigrant
 *   PORT      – default: 3001
 */

const express = require("express");
const cors    = require("cors");
const mysql   = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json());

// ── Database connection pool ──────────────────────────────────────────────────
const pool = mysql.createPool({
  host:             process.env.DB_HOST || "localhost",
  port:             Number(process.env.DB_PORT) || 3306,
  user:            process.env.DB_USER || "root",
  password:         process.env.DB_PASS || "",
  database:         process.env.DB_NAME || "unigrant",
  waitForConnections: true,
  connectionLimit:  10,
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await pool.execute("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// ── Authentication ────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email, password }   →   Returns user row (no password_hash)
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  try {
    const [rows] = await pool.execute(
      `SELECT user_id, first_name, last_name, email, role,
              dept_id, specialization, phone, hire_date
       FROM User
       WHERE email = ? AND password_hash = SHA2(?, 256)`,
      [email, password]
    );
    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`UniGrant API listening on http://localhost:${PORT}`);
});
