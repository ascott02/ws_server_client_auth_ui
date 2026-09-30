---
marp: true
paginate: true
style: |
  section {font-size: 18pt;}
---

# CSC 667/867
## WebSockets v5: Authentication

HTTP login → session token → authenticated WebSocket

---

# v5 Goal

Add identity without changing the game protocol.

```text
username + password
        ↓
     POST /login
        ↓
   session token
        ↓
WebSocket connection
        ↓
 authenticated player
```

---

# Two Different Accounts

Do not confuse the database account with the game account.

```text
PostgreSQL role
emoji / emoji
```

```text
Application user
alice / gamepass
```

The PostgreSQL role lets the server access the database.

The application user identifies a player.

---

# Install PostgreSQL

On the Ubuntu VM:

```bash
sudo apt install postgresql
```

PostgreSQL creates a local administrative account named `postgres`.

Use it to administer the local database server:

```bash
sudo -u postgres psql
```

---

# Create the Database

The same setup can be done directly from the shell:

```bash
sudo -u postgres psql -c \
  "CREATE USER emoji WITH PASSWORD 'emoji';"

sudo -u postgres psql -c \
  "CREATE DATABASE emoji_party OWNER emoji;"
```

Application database:

```text
Database: emoji_party
Role:     emoji
Password: emoji
```

---

# Connect the Node Server

```bash
DATABASE_URL=postgres://emoji:emoji@localhost/emoji_party \
  node server_v5.js
```

Node connects as the PostgreSQL role `emoji`.

The game users are stored separately inside the database.

---

# Users Table

The server creates a small authentication table.

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
```

Never store plaintext passwords.

---

# Registration

```http
POST /register
```

```json
{
  "username": "alice",
  "password": "gamepass"
}
```

Server:

```js
const hash = await bcrypt.hash(password, 12);

await db.query(
  "INSERT INTO users(username, password_hash) VALUES($1, $2)",
  [username, hash]
);
```

---

# Register a Test Player

```bash
curl -X POST http://localhost:3000/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"gamepass"}'
```

This creates an application user.

It does not create a PostgreSQL role.

---

# Login

```http
POST /login
```

Server verifies the password:

```js
const user = result.rows[0];

if (!user || !(await bcrypt.compare(password, user.password_hash)))
  return res.status(401).json({ error: "invalid login" });
```

---

# Session Token

After successful login:

```js
const token = crypto.randomBytes(32).toString("hex");

sessions.set(token, {
  id: user.id,
  username: user.username
});

res.json({ token });
```

The token represents the authenticated session.

---

# Client Login

```js
const response = await fetch(`${HOST}/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password })
});

const token = (await response.json()).token;
```

The password is used only during login.

---

# Authenticate the WebSocket

The Node client sends the token during the WebSocket handshake.

```js
const ws = new WebSocket(url, {
  headers: {
    Authorization: `Bearer ${token}`
  }
});
```

The WebSocket connection now carries the player's identity.

---

# Server Accepts or Rejects

```js
wss.on("connection", (ws, req) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer /, "");
  const user = sessions.get(token);

  if (!user)
    return ws.close(1008, "unauthorized");

  ws.userId = user.id;
});
```

After authentication, messages do not need to contain credentials.

---

# Identity Becomes Game State

```js
players.set(user.id, {
  name: user.username,
  symbol: String(user.id % 10),
  x: 16,
  y: 16
});
```

```text
WebSocket → authenticated user → player state
```

---

# Movement Does Not Change

Authentication is separate from game behavior.

```js
if (msg.type === "move") {
  const p = players.get(user.id);

  p.x += msg.dx;
  p.y += msg.dy;

  broadcast();
}
```

The server still owns authoritative state.

---

# Why an Opaque Token?

For this system, an opaque session token is enough.

- simple
- random
- revocable
- expires when the server chooses
- easy to inspect and teach

JWT and OAuth solve additional problems that we do not need yet.

---

# Security Boundary

```text
HTTPS
  protects username/password in transit

bcrypt
  protects stored passwords

session token
  represents authenticated identity

WSS
  protects game traffic in transit
```

TLS secures the channel.

Authentication secures the identity.

---

# Run the Client

```bash
node client_v5.js
```

```text
Username: alice
Password: gamepass
```

The client logs in over HTTP, receives a session token, then uses that token to authenticate its WebSocket connection.

---

# v1 → v5

```text
v1  establish a WebSocket connection
v2  exchange messages
v3  maintain centralized state
v4  broadcast shared state to multiple clients
v5  authenticate users and bind identity to a socket
```

The next step is moving the authenticated server onto the public Internet with HTTPS and WSS.
