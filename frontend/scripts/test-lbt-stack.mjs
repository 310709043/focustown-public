/** Exercise the real frontend + Worker locally, with disposable D1 and DO data. */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const edge = resolve(frontend, "../edge");
const directory = await mkdtemp(resolve(tmpdir(), "lbt-e2e-"));
const api = "http://127.0.0.1:8791";
const site = "http://127.0.0.1:3100";
const admin = randomBytes(24).toString("hex");
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  WRANGLER_SEND_METRICS: "false",
  NEXT_PUBLIC_API_BASE_URL: api,
  NEXT_PUBLIC_WS_BASE_URL: api.replace("http:", "ws:"),
  NEXT_PUBLIC_SITE_URL: site,
  PLAYWRIGHT_BASE_URL: site,
  PLAYWRIGHT_API_BASE_URL: api,
  PLAYWRIGHT_COMPANION_ADMIN_TOKEN: admin,
  PLAYWRIGHT_REAL_STACK: "1",
  PLAYWRIGHT_NO_SERVER: "1",
};
// This runner has no reason to authenticate to Cloudflare or send notifications.
for (const key of Object.keys(env)) {
  if (/^(CLOUDFLARE_|CF_API_|FEEDBACK_SHEET_|TELEGRAM_|DISCORD_)/.test(key)) delete env[key];
}
const services = [];
let stopped = false;
const onSignal = () => { stopped = true; for (const child of services) child.kill("SIGTERM"); };
const deadline = setTimeout(onSignal, 15 * 60_000);
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

function start(file, args, cwd) {
  if (stopped) throw new Error("Local acceptance run was interrupted");
  const child = spawn(process.execPath, [file, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  services.push(child);
  child.stdout.on("data", chunk => process.stdout.write(String(chunk).replaceAll(admin, "[test credential]")));
  child.stderr.on("data", chunk => process.stderr.write(String(chunk).replaceAll(admin, "[test credential]")));
  child.done = new Promise((res, rej) => {
    child.on("error", rej);
    child.on("close", code => code === 0 ? res() : rej(new Error(`${file} exited ${code}`)));
  });
  child.done.catch(() => {});
  return child;
}
async function ready(url, child) {
  for (let i = 0; i < 120; i++) {
    if (stopped || child.exitCode !== null) throw new Error(`Server exited before ${url} was ready`);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await res.body?.cancel();
      if (res.ok) return;
    } catch { /* cold compilation */ }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
try {
  // Refuse occupied ports rather than accidentally testing another developer's server.
  const { createServer } = await import("node:net");
  for (const port of [3100, 8791]) await new Promise((res, rej) => {
    const server = createServer();
    server.once("error", rej);
    server.listen(port, "127.0.0.1", () => server.close(res));
  });
  const config = resolve(directory, "wrangler.json");
  const dotenv = resolve(directory, ".env");
  await writeFile(config, JSON.stringify({
    name: "lbt-local-acceptance", main: resolve(edge, "src/index.ts"),
    compatibility_date: "2026-08-20", workers_dev: false, routes: [],
    durable_objects: { bindings: [{ name: "TOWN", class_name: "TownObject" }] },
    migrations: [{ tag: "v1", new_sqlite_classes: ["TownObject"] }],
    d1_databases: [{ binding: "DB", database_name: "lbt-local-acceptance", database_id: "00000000-0000-0000-0000-000000000000", migrations_dir: resolve(edge, "migrations") }],
    vars: { ALLOWED_ORIGINS: site, LBT_OPEN_HOURS: "", LBT_TIMEZONE: "Asia/Taipei" },
  }));
  // Random disposable local credentials, never production credentials.
  await writeFile(dotenv, `ADMIN_TOKEN=${admin}\nLBT_TOKEN_SECRET=${randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
  const wrangler = resolve(edge, "node_modules/wrangler/bin/wrangler.js");
  const flags = ["--config", config, "--env-file", dotenv];
  await start(wrangler, ["d1", "migrations", "apply", "lbt-local-acceptance", "--local", "--persist-to", resolve(directory, "state"), ...flags], edge).done;
  const worker = start(wrangler, ["dev", "--local", "--ip", "127.0.0.1", "--port", "8791", "--inspector-port", "0", "--persist-to", resolve(directory, "state"), ...flags], edge);
  await ready(`${api}/healthz`, worker);
  const next = resolve(frontend, "node_modules/next/dist/bin/next");
  const dev = process.argv.includes("--dev");
  if (!dev) await start(next, ["build"], frontend).done;
  const web = start(next, [dev ? "dev" : "start", "--hostname", "127.0.0.1", "--port", "3100"], frontend);
  await ready(`${site}/zh-TW`, web);
  const specs = process.argv.slice(2).filter(arg => arg !== "--dev");
  await start(resolve(frontend, "node_modules/@playwright/test/cli.js"), ["test", "--retries=0", ...(specs.length ? specs : ["e2e/lbt-.*\\.spec\\.ts"])], frontend).done;
} finally {
  clearTimeout(deadline);
  onSignal();
  const forceStop = setTimeout(() => { for (const child of services) child.kill("SIGKILL"); }, 5000);
  await Promise.allSettled(services.map(child => child.done));
  clearTimeout(forceStop);
  await rm(directory, { recursive: true, force: true });
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
}
