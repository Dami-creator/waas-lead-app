// app.js
import express from "express";
import sqlite3 from "sqlite3";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// SQLite database
const db = new sqlite3.Database("/tmp/database.db", (err) => {
  if (err) console.error("DB Error:", err);
  else console.log("SQLite DB connected");
});

// Create tables if not exist
db.run(
  `CREATE TABLE IF NOT EXISTS clients (
    slug TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    primary_color TEXT,
    telegram_chat TEXT
  )`
);
db.run(
  `CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_slug TEXT,
    phone TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
);

// ------------------------------
// Default homepage route
// ------------------------------
app.get("/", (req, res) => {
  db.all("SELECT slug, title FROM clients", [], (err, rows) => {
    if (err) return res.status(500).send("DB Error");

    let links = rows
      .map((c) => `<li><a href="/c/${c.slug}">${c.title}</a></li>`)
      .join("");

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lead App Home</title>
        <style>
          body { font-family:sans-serif; text-align:center; margin-top:50px; }
          ul { list-style:none; padding:0; }
          li { margin:10px 0; }
          a { text-decoration:none; color:#4caf50; font-weight:bold; }
          a:hover { text-decoration:underline; }
        </style>
      </head>
      <body>
        <h1>Welcome to Multi-Client Lead App</h1>
        <p>Click a client to visit their landing page:</p>
        <ul>${links}</ul>
      </body>
      </html>
    `);
  });
});

// ------------------------------
// Serve landing page for client
// ------------------------------
app.get("/c/:slug", async (req, res) => {
  const client = await new Promise((resolve, reject) => {
    db.get("SELECT * FROM clients WHERE slug = ?", [req.params.slug], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (!client) return res.status(404).send("Client not found");

  // Simple HTML landing page
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${client.title}</title>
      <style>
        body { font-family: sans-serif; text-align:center; background:#f0f0f0; }
        .container { max-width:400px; margin:50px auto; background:#fff; padding:30px; border-radius:10px; }
        input, button { padding:10px; margin:10px 0; width:100%; border-radius:6px; border:1px solid #ccc; }
        button { background-color:${client.primary_color || "#4caf50"}; color:white; border:none; cursor:pointer; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${client.title}</h1>
        <p>${client.description}</p>
        <form method="POST" action="/lead/${client.slug}">
          <input type="text" name="phone" placeholder="Phone Number" required pattern="\\d{10,20}">
          <button type="submit">Submit</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// ------------------------------
// Handle lead submission
// ------------------------------
app.post("/lead/:slug", async (req, res) => {
  const client = await new Promise((resolve, reject) => {
    db.get("SELECT * FROM clients WHERE slug = ?", [req.params.slug], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (!client) return res.status(404).send("Client not found");

  const phone = req.body.phone;
  if (!phone) return res.status(400).send("Phone number required");

  // Save to DB
  db.run(
    "INSERT INTO leads(client_slug, phone) VALUES(?, ?)",
    [client.slug, phone],
    (err) => {
      if (err) console.error(err);
    }
  );

  // Send to Telegram
  const botToken = process.env.BOT_TOKEN;
  const chatId = client.telegram_chat || "YOUR_CHAT_ID";
  const message = `📥 New Lead\nClient: ${client.slug}\nPhone: ${phone}`;

  if (botToken) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      });
    } catch (e) {
      console.error("Telegram error:", e);
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <body style="font-family:sans-serif;text-align:center;margin-top:50px;">
      <h2>Thank you!</h2>
      <p>Your request has been submitted successfully.</p>
      <a href="/">Back to Home</a>
    </body>
    </html>
  `);
});

// ------------------------------
// Admin endpoint to add a client
// ------------------------------
app.post("/admin/add-client", (req, res) => {
  const { slug, title, description, primary_color, telegram_chat } = req.body;
  if (!slug || !title || !description) return res.status(400).send("Missing fields");

  db.run(
    "INSERT OR REPLACE INTO clients(slug, title, description, primary_color, telegram_chat) VALUES(?,?,?,?,?)",
    [slug, title, description, primary_color || "#4caf50", telegram_chat || ""],
    (err) => {
      if (err) return res.status(500).send("DB Error");
      res.send("Client added successfully");
    }
  );
});

// ------------------------------
// Start server
// ------------------------------
app.listen(PORT, () => {
  console.log(`Multi-client lead app running → http://localhost:${PORT}`);
});
