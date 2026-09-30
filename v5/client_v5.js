const WebSocket = require("ws");
const readline = require("readline");

const DEBUG = process.argv.includes("--debug");
const HOST = process.env.GAME_HOST || "http://localhost:3000";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function login() {
  const username = await ask("Username: ");
  const password = await ask("Password: ");

  rl.close();

  const response = await fetch(`${HOST}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok)
    throw new Error("Login failed");

  return (await response.json()).token;
}

function draw(state) {
  const grid = Array.from({ length: state.height }, () =>
    Array(state.width).fill(".")
  );

  for (const p of Object.values(state.players))
    grid[p.y][p.x] = p.symbol;

  process.stdout.write("\x1b[2J\x1b[H");
  console.log(grid.map(row => row.join("")).join("\n"));
}

async function main() {
  const token = await login();

  const url = HOST
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:");

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  ws.on("open", () => {
    if (DEBUG) console.log("CONNECTED");
  });

  ws.on("message", data => {
    const msg = JSON.parse(data);

    if (DEBUG)
      console.log("RECV", msg);
    else if (msg.type === "state")
      draw(msg);
  });

  process.stdin.on("keypress", (_, key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c"))
      process.exit();

    const moves = {
      w: [0, -1],
      s: [0, 1],
      a: [-1, 0],
      d: [1, 0]
    };

    if (!moves[key.name]) return;

    const [dx, dy] = moves[key.name];
    const msg = { type: "move", dx, dy };

    if (DEBUG) console.log("SEND", msg);

    ws.send(JSON.stringify(msg));
  });
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
