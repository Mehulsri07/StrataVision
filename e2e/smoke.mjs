// Tests of the real app, driven through its window.
//
// 1. Started on a data folder that does not exist, it explains in plain words that there are no
//    records yet, and leaves no trace (the folder is not created).
// 2. Started on made-up borewells, clicking a spot on the map shows proposed layers there,
//    Data quality reports on them, and a line drawn on the Section map draws the section, flat
//    and as a 3D slice, and the city map is painted. A save made in StrataField shows by itself.
//
// Build first: npm run tauri -w app -- build --debug --no-bundle
import { execFileSync, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";

// Each start of the app gets its own port: the last one's window can take a moment to let go of its own.
let port = 9332;
const root = resolve(import.meta.dirname, "..");
const exe = join(root, "target/debug/stratavision.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(exe)) {
  console.error(`The app has not been built: ${exe} is missing.`);
  process.exit(1);
}

/** Sends one command to the app's page through the WebView's debugging connection. */
async function send(method, params = {}) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
  if (!page) throw new Error("no page yet");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  try {
    return await new Promise((done, fail) => {
      ws.onerror = () => fail(new Error("could not connect to the page"));
      setTimeout(() => fail(new Error("the page did not answer")), 5000);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }));
      ws.onmessage = (m) => {
        const answer = JSON.parse(m.data);
        if (answer.id === 1) done(answer.result);
      };
    });
  } finally {
    ws.close();
  }
}

const js = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true }))?.result?.value;
const screen = () => js("document.body.innerText");

async function click(x, y) {
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
}

/** Waits up to 30 seconds for the screen to say `expected`; fails with what it said instead. */
async function expectScreen(expected) {
  let seen = null, lastError = "the app's page never answered";
  for (const deadline = Date.now() + 30_000; Date.now() < deadline; ) {
    await sleep(500);
    try {
      seen = await screen();
      if (seen.includes(expected)) return;
    } catch (e) {
      lastError = e.message;
    }
  }
  throw new Error(`expected the screen to say "${expected}". It said:\n${seen ?? `(nothing: ${lastError})`}`);
}

/** Runs `steps` against the app started on `dataDir`, and always stops the app afterwards. */
async function withApp(dataDir, steps) {
  port++;
  const app = spawn(exe, [], {
    stdio: ["ignore", "ignore", "inherit"], // a crash at start-up should be visible in the log
    // Development builds open the window's debugging port when asked (see open_main_window in
    // app/src-tauri/src/lib.rs).
    env: { ...process.env, STRATA_DATA_DIR: dataDir, STRATA_E2E_DEBUG_PORT: String(port) },
  });
  try {
    await steps();
  } finally {
    app.kill();
    await sleep(1000);
  }
}

const scenarios = {
  "no records: says so, and creates nothing": async () => {
    const dataDir = join(tmpdir(), `stratavision-smoke-${process.pid}`);
    await withApp(dataDir, () => expectScreen("Install StrataField and add borewells first"));
    if (existsSync(dataDir)) throw new Error(`the app created ${dataDir}. It must never create the data folder.`);
  },

  "made-up borewells: a picked spot shows proposed layers": async () => {
    const dataDir = join(tmpdir(), `stratavision-smoke-seeded-${process.pid}`);
    execFileSync("cargo", ["test", "-p", "stratavision", "seed_for_manual_runs", "--", "--ignored"], {
      cwd: root, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, STRATA_SEED_DIR: dataDir },
    });
    try {
      await withApp(dataDir, async () => {
        await expectScreen("26 borewells on the map");
        await sleep(2500); // the map settles on the borewells
        // The middle of the map is the middle borewell; a little to one side is open ground.
        const [x, y] = await js("(() => { const r = document.querySelector('.leaflet-container').getBoundingClientRect(); return [r.x + r.width / 2 + 60, r.y + r.height / 2 + 45]; })()");
        await click(x, y);
        await expectScreen("Proposed layers here");
        await expectScreen("Water-bearing sand");
        await expectScreen("Water level expected about");
        await expectScreen("levels measured since 2023");
        await expectScreen("Drilling suggestion");
        await expectScreen("How deep to drill: about");
        await expectScreen("Pipe, from the top down");
        await expectScreen("ft plain,");
        // Rates typed in give the cost; emptied first, as an earlier run's are kept on this computer.
        const rates = async (values) => js(`(() => {
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          const boxes = [...document.querySelectorAll('input[type="number"]')];
          ${JSON.stringify(values)}.forEach((v, i) => { set.call(boxes[i], v); boxes[i].dispatchEvent(new Event("input", { bubbles: true })); });
        })()`);
        await rates(["", "", ""]);
        await expectScreen("Enter DWO's rates");
        await rates(["100", "200", "300"]);
        await expectScreen("Total");
        // The middle pin is two borewells on top of each other; the panel offers both.
        await click(x - 60, y - 45);
        await expectScreen("2 borewells are at this spot:");
        await js("[...document.querySelectorAll('header button')].find((b) => b.innerText.trim() === 'Data quality').click()");
        await expectScreen("Checked against 26 borewells");
        await expectScreen("BW-008"); // the one logged upside down
        // A section across the middle of the made-up borewells.
        await js("[...document.querySelectorAll('header button')].find((b) => b.innerText.trim() === 'Section').click()");
        await expectScreen("Click the map to draw a line");
        await sleep(2500);
        const [sx, sy] = await js("(() => { const r = [...document.querySelectorAll('.leaflet-container')].find((m) => m.offsetParent).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2 + 20]; })()");
        await click(sx - 150, sy);
        await click(sx + 150, sy);
        await expectScreen("borewells within 500 m of the line");
        await expectScreen("Save as PDF");
        if (!(await js("!!document.querySelector('svg[aria-label^=\"Section along\"]')"))) throw new Error("the section was not drawn");
        await js("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '3D slice').click()");
        await expectScreen("Drag to turn and tilt the slice");
        // The city map, worked out over the made-up borewells.
        await js("[...document.querySelectorAll('header button')].find((b) => b.innerText.trim() === 'City map').click()");
        await expectScreen("Each square is about");
        await expectScreen("Depth: 50 ft below ground");
        await js("[...document.querySelectorAll('label')].find((l) => l.innerText.trim() === 'How fast the water level is changing').click()");
        await expectScreen("10 borewells have water levels measured a year or more apart"); // every third made-up one
        // StrataField saves beside the open window: the screen follows without a click or a refocus.
        const db = new DatabaseSync(join(dataDir, "strata.db"));
        db.exec("UPDATE borewells SET latitude = NULL, longitude = NULL WHERE borewell_id = 'BW-001'");
        db.close();
        await js("[...document.querySelectorAll('header button')].find((b) => b.innerText.trim() === 'Map').click()");
        await expectScreen("25 borewells on the map");
      });
    } finally {
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); // the app may still be letting go
    }
  },
};

let failed = false;
for (const [name, run] of Object.entries(scenarios)) {
  try {
    await run();
    console.log(`OK: ${name}`);
  } catch (e) {
    failed = true;
    console.error(`FAILED: ${name}\n${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
