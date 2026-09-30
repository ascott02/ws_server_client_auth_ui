const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const local = new WebSocket.Server({ server });

const GAME = process.env.GAME || "http://localhost:3000";

let upstream = null;
let token = null;

app.use(express.json());
app.use(express.static("public"));

app.post("/register", async (req, res) => {
  const r = await fetch(`${GAME}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body)
  });

  res.status(r.status).json(await r.json());
});

app.post("/login", async (req, res) => {
  const r = await fetch(`${GAME}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body)
  });

  const result = await r.json();

  if (!r.ok)
    return res.status(r.status).json(result);

  token = result.token;
  connectUpstream();

  res.json({ ok: true });
});

function connectUpstream() {
  const url = GAME
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:");

  upstream = new WebSocket(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  upstream.on("message", data => {
    for (const ws of local.clients)
      if (ws.readyState === WebSocket.OPEN)
        ws.send(data.toString());
  });
}

local.on("connection", ws => {
  ws.on("message", data => {
    if (upstream?.readyState === WebSocket.OPEN)
      upstream.send(data.toString());
  });
});

server.listen(3001, () =>
  console.log("Client UI: http://localhost:3001")
);