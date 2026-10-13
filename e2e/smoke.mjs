// Starts the real app on a data folder that does not exist and checks two things: it explains,
// in plain words, that there are no records yet; and it leaves no trace (the folder is not created).
// Build first: npm run tauri -w app -- build --debug --no-bundle
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const PORT = 9333;
const EXPECTED = "Install StrataField and add borewells first";
const exe = resolve(import.meta.dirname, "../target/debug/stratavision.exe");
const dataDir = join(tmpdir(), `stratavision-smoke-${process.pid}`);

if (!existsSync(exe)) {
  console.error(`The app has not been built: ${exe} is missing.`);
  process.exit(1);
}

const app = spawn(exe, [], {
  stdio: ["ignore", "ignore", "inherit"], // a crash at start-up should be visible in the log
  // Development builds open the window's debugging port when asked (see open_main_window in
  // app/src-tauri/src/lib.rs).
  env: { ...process.env, STRATA_DATA_DIR: dataDir, STRATA_E2E_DEBUG_PORT: String(PORT) },
});

/** The text on the app's page, read through the WebView's debugging connection. */
async function pageText() {
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl);
  if (!page) throw new Error("no page yet");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  try {
    return await new Promise((done, fail) => {
      ws.onerror = () => fail(new Error("could not connect to the page"));
      setTimeout(() => fail(new Error("the page did not answer")), 5000);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "document.body.innerText" } }));
      ws.onmessage = (m) => done(JSON.parse(m.data).result?.result?.value ?? "");
    });
  } finally {
    ws.close();
  }
}

let seen = null;
let lastError = "the app's page never answered";
let ok = false;
for (const deadline = Date.now() + 30_000; Date.now() < deadline && !ok; ) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    seen = await pageText();
    ok = seen.includes(EXPECTED);
  } catch (e) {
    lastError = e.message;
  }
}
app.kill();

if (!ok) {
  console.error(`FAILED: expected the screen to say "${EXPECTED}". It said:\n${seen ?? `(nothing: ${lastError})`}`);
  process.exit(1);
}
if (existsSync(dataDir)) {
  console.error(`FAILED: the app created ${dataDir}. It must never create the data folder.`);
  process.exit(1);
}
console.log("OK: the app starts, explains that there are no records, and creates nothing.");
