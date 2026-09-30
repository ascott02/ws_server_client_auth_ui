---
marp: true
paginate: true
---

# CSC 667/867
## WebSockets v6: Browser Client

Browser UI → local Node client → authenticated game server

---

# v6 Goal

Move user interaction into the browser without exposing the central session token.

```text
Browser
   ↓
local Node client
   ↓
central game server
   ↓
PostgreSQL
```

---

# Separation of Concerns

```text
Browser
presentation and input

Local Node client
login, token, protocol, upstream connection

Central server
authentication and authoritative game state

PostgreSQL
persistent users
```

---

# Project Structure

```text
v6/
├── server_v6.js
├── client_v6.js
└── public/
    ├── index.html
    └── app.js
```

`public` contains files served directly to the browser.

---

# Serve Static Files

The local Node client becomes a small web server.

```js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static("public"));
```

The browser loads `index.html` and `app.js` from localhost.

---

# Registration UI

```html
<form id="register">
  <h2>Register</h2>
  <input name="username" placeholder="username">
  <input name="password" type="password" placeholder="password">
  <button>Register</button>
</form>
```

Registration is now part of the application UI.

---

# Login UI

```html
<form id="login">
  <h2>Login</h2>
  <input name="username" placeholder="username">
  <input name="password" type="password" placeholder="password">
  <button>Login</button>
</form>
```

The browser sends credentials only to the local Node process.

---

# Browser Sends HTTP

```js
async function submit(form, path) {
  const data = Object.fromEntries(new FormData(form));

  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  return response.json();
}
```

The browser uses ordinary HTTP for registration and login.

---

# Local Registration Proxy

```js
app.post("/register", async (req, res) => {
  const r = await fetch(`${GAME}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body)
  });

  res.status(r.status).json(await r.json());
});
```

The local client forwards the request to the central server.

---

# Local Login Proxy

```js
app.post("/login", async (req, res) => {
  const r = await fetch(`${GAME}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body)
  });

  const result = await r.json();

  if (!r.ok)
    return res.status(r.status).json(result);
```

The central server still performs authentication.

---

# Keep the Token Local

```js
  token = result.token;
  connectUpstream();

  res.json({ ok: true });
});
```

```text
central server → token → local Node client
```

The token is not returned to the browser.

---

# Authenticate Upstream

```js
function connectUpstream() {
  const url = GAME
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:");

  upstream = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}
```

The local Node client owns the authenticated connection.

---

# Two WebSocket Connections

```text
Browser
   ↕ local WebSocket
client_v6.js
   ↕ authenticated WebSocket
server_v6.js
```

The local Node process bridges the two connections.

---

# Browser Opens Local WebSocket

```js
const ws = new WebSocket(`ws://${location.host}`);
```

The browser connects only to localhost.

It does not need the central server address or session token.

---

# Forward Server State

```js
upstream.on("message", data => {
  for (const ws of local.clients)
    if (ws.readyState === WebSocket.OPEN)
      ws.send(data.toString());
});
```

Central state flows through the local Node process to the browser.

---

# Forward Player Input

```js
local.on("connection", ws => {
  ws.on("message", data => {
    if (upstream?.readyState === WebSocket.OPEN)
      upstream.send(data.toString());
  });
});
```

Player input flows in the opposite direction.

---

# Browser Sends Movement

```js
document.addEventListener("keydown", e => {
  const moves = {
    w: [0, -1],
    s: [0, 1],
    a: [-1, 0],
    d: [1, 0]
  };

  if (!moves[e.key]) return;

  const [dx, dy] = moves[e.key];
  ws.send(JSON.stringify({ type: "move", dx, dy }));
});
```

The browser sends intent, not authoritative state.

---

# Browser Renders State

```js
ws.onmessage = event => {
  const state = JSON.parse(event.data);

  if (state.type !== "state") return;

  const grid = Array.from(
    { length: state.height },
    () => Array(state.width).fill(".")
  );
```

The browser converts shared state into presentation.

---

# Presentation Is Still Local

```js
for (const p of Object.values(state.players))
  grid[p.y][p.x] = p.symbol;

game.textContent =
  grid.map(row => row.join("")).join("\n");
```

The central server does not send HTML or a rendered grid.

It sends game state.

---

# Central Server Does Not Change

The v5 server already provides:

- `POST /register`
- `POST /login`
- bcrypt password verification
- opaque session tokens
- authenticated WebSockets
- authoritative player state

v6 changes the client architecture.

---

# Run v6

Central server:

```bash
DATABASE_URL=postgres://emoji:emoji@localhost/emoji_party \
  node server_v6.js
```

Local client:

```bash
node client_v6.js
```

Browser:

```text
http://localhost:3001
```

---

# Registration and Login Flow

```text
Browser
  ↓ POST /register
Local Node
  ↓ POST /register
Central server
  ↓
PostgreSQL

Browser
  ↓ POST /login
Local Node
  ↓ POST /login
Central server
  ↓ token
Local Node
```

---

# Game Traffic Flow

```text
keyboard input
     ↓
Browser
     ↓ WebSocket
Local Node
     ↓ authenticated WebSocket
Central server
     ↓ authoritative state
Local Node
     ↓ WebSocket
Browser
     ↓
render
```

---

# v1 → v6

```text
v1  establish a WebSocket connection
v2  exchange messages
v3  maintain centralized state
v4  broadcast shared state to multiple clients
v5  authenticate users and bind identity to a socket
v6  add browser UI through a local Node client
```

---

# v6 Architecture

```text
Browser
presentation and controls

        ↕

Local Node client
identity, token, protocol bridge

        ↕

Central server
authoritative game state

        ↕

PostgreSQL
persistent accounts
```
