const game = document.querySelector("#game");
const ws = new WebSocket(`ws://${location.host}`);

async function submit(form, path) {
  const data = Object.fromEntries(new FormData(form));

  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  return response.json();
}

document.querySelector("#register").onsubmit = async e => {
  e.preventDefault();
  console.log(await submit(e.target, "/register"));
};

document.querySelector("#login").onsubmit = async e => {
  e.preventDefault();
  console.log(await submit(e.target, "/login"));
};

ws.onmessage = event => {
  const state = JSON.parse(event.data);

  if (state.type !== "state") return;

  const grid = Array.from(
    { length: state.height },
    () => Array(state.width).fill(".")
  );

  for (const p of Object.values(state.players))
    grid[p.y][p.x] = p.symbol;

  game.textContent =
    grid.map(row => row.join("")).join("\n");
};

document.addEventListener("keydown", e => {
  const moves = {
    w: [0, -1],
    s: [0, 1],
    a: [-1, 0],
    d: [1, 0]
  };

  if (!moves[e.key]) return;

  const [dx, dy] = moves[e.key];

  ws.send(JSON.stringify({
    type: "move",
    dx,
    dy
  }));
});