const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const db = new Pool({
  connectionString:
    process.env.DATABASE_URL || "postgres://localhost/emoji_party"
});

const DEBUG = process.argv.includes("--debug");
const WIDTH = 32, HEIGHT = 32;
const PORT = process.env.PORT || 3000;

const sessions = new Map();   // token -> user
const players = new Map();    // user id -> player

app.use(express.json());

async function init() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    )
  `);
}

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: "username and password required" });

  try {
    const hash = await bcrypt.hash(password, 12);

    await db.query(
      "INSERT INTO users(username, password_hash) VALUES($1, $2)",
      [username, hash]
    );

    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: "username already exists" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const result = await db.query(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );

  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: "invalid login" });

  const token = crypto.randomBytes(32).toString("hex");

  sessions.set(token, {
    id: user.id,
    username: user.username
  });

  res.json({ token });
});

function broadcast() {
  const msg = JSON.stringify({
    type: "state",
    width: WIDTH,
    height: HEIGHT,
    players: Object.fromEntries(players)
  });

  for (const ws of wss.clients)
    if (ws.readyState === WebSocket.OPEN)
      ws.send(msg);
}

function drawGrid() {
  const grid = Array.from({ length: HEIGHT }, () =>
    Array(WIDTH).fill(".")
  );

  for (const p of players.values())
    grid[p.y][p.x] = p.symbol;

  console.log(grid.map(row => row.join("")).join("\n"));
}

wss.on("connection", (ws, req) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer /, "");
  const user = sessions.get(token);

  if (!user)
    return ws.close(1008, "unauthorized");

  ws.userId = user.id;

  players.set(user.id, {
    name: user.username,
    symbol: String(user.id % 10),
    x: Math.floor(WIDTH / 2),
    y: Math.floor(HEIGHT / 2)
  });

  if (DEBUG) console.log(`CONNECT ${user.username}`);

  broadcast();

  ws.on("message", data => {
    const msg = JSON.parse(data);

    if (DEBUG) console.log("RECV", user.username, msg);

    if (msg.type !== "move") return;

    const p = players.get(user.id);

    p.x = Math.max(0, Math.min(WIDTH - 1, p.x + msg.dx));
    p.y = Math.max(0, Math.min(HEIGHT - 1, p.y + msg.dy));

    if (DEBUG) drawGrid();

    broadcast();
  });

  ws.on("close", () => {
    players.delete(user.id);

    if (DEBUG) console.log(`DISCONNECT ${user.username}`);

    broadcast();
  });
});

init().then(() =>
  server.listen(PORT, () =>
    console.log("Emoji Party v6 listening on :${PORT}")
  )
);
