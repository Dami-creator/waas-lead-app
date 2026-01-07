// -----------------------------
// Multi-Client Lead App - Render-ready
// -----------------------------
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

// Fix fetch for Node 18+
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------
// Middleware
// -----------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -----------------------------
// Database setup (Render-friendly /tmp)
// -----------------------------
const db = new sqlite3.Database("/tmp/database.db");

db.serialize(() => {
  // Clients table
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      title TEXT,
      description TEXT,
      primary_color TEXT,
      telegram_chat TEXT,
      active INTEGER DEFAULT 1
    )
  `);

  // Leads table
  db.run(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Demo client
  db.run(`
    INSERT OR IGNORE INTO clients
    (slug, title, description, primary_color, telegram_chat)
    VALUES
    ('everbest', 'Get Free Bot', 'Limited-time offer! Enter your number below.', '#4caf50', '6999117324')
  `);
});

// -----------------------------
// Serve client landing page dynamically
// -----------------------------
app.get("/c/:slug", (req, res) => {
  const slug = req.params.slug;

  db.get("SELECT * FROM clients WHERE slug=? AND active=1", [slug], (err, client) => {
    if (!client) return res.status(404).send("Page not found");

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${client.title}</title>
<style>
body { font-family:'Segoe UI', Tahoma, Geneva, Verdana'; display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0; background:linear-gradient(135deg,#e0f7fa 0%,#80deea 100%); }
.container { background:#fff; padding:40px; border-radius:12px; box-shadow:0 6px 12px rgba(0,0,0,0.15); max-width:500px; width:100%; text-align:center; }
h1 { color:${client.primary_color}; }
p { color:#555; }
input { width:100%; padding:12px; margin:15px 0; border-radius:6px; border:1px solid #ccc; }
button { padding:14px 28px; font-size:16px; background:${client.primary_color}; color:white; border:none; border-radius:6px; cursor:pointer; }
.message { margin-top:15px; font-weight:bold; color:#333; }
</style>
</head>
<body>
<div class="container">
<h1>${client.title}</h1>
<p>${client.description}</p>

<input type="text" id="phone" placeholder="Enter phone number">
<button onclick="submitLead()">Continue</button>

<div class="message" id="msg"></div>
</div>

<script>
function submitLead() {
  const phone = document.getElementById("phone").value;
  const msg = document.getElementById("msg");

  if (!phone) { msg.textContent = "Please enter your phone number."; return; }

  fetch("/api/lead", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ phone:phone, slug:"${client.slug}" })
  })
  .then(res => res.json())
  .then(data => { msg.textContent = "Thank you! We will contact you shortly."; })
  .catch(() => { msg.textContent = "Something went wrong. Try again."; });
}
</script>
</body>
</html>
    `);
  });
});

// -----------------------------
// API to save leads
// -----------------------------
app.post("/api/lead", (req, res) => {
  const { phone, slug } = req.body;
  if (!phone || !slug) return res.status(400).json({ error: "Missing data" });

  db.get("SELECT * FROM clients WHERE slug=?", [slug], (err, client) => {
    if (!client) return res.status(400).json({ error: "Invalid client" });

    db.run("INSERT INTO leads (client_id, phone) VALUES (?, ?)", [client.id, phone]);

    // Send Telegram notification per client
    if (client.telegram_chat && process.env.BOT
