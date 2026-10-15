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


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`UniGrant API listening on http://localhost:${PORT}`);
});
