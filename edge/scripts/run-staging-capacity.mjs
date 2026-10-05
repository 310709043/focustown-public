/** Bounded remote test; never accepts an arbitrary API URL or production config. */
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import assert from "node:assert/strict";
import WebSocket from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const account = "3e2d709ee58392acf40f607ebbbeb974";
const count = Number(process.argv[2] ?? 100);
const seconds = Number(process.argv[3] ?? 120);
if (![100, 300, 500].includes(count) || !Number.isInteger(seconds) || seconds < 30 || seconds > 180) {
  throw new Error("Use 100/300/500 guests and a duration of 30–180 seconds");
}
if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== account) {
  throw new Error("Wrong Cloudflare account; use Focus Town 1314");
}
const name = `lbt-capacity-${randomUUID().slice(0, 8)}`;
const directory = resolve(root, ".wrangler", name);
const configPath = resolve(directory, "wrangler.json");
const key = randomBytes(32).toString("hex");
const signingKey = randomBytes(32).toString("hex");
const clients = [];
let databaseCreated = false;
let workerAttempted = false;
let heartbeat;
let interrupted = false;
let handshakeRetries = 0;
let httpRetries = 0;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { interrupted = true; });

async function wrangler(args, input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(resolve(root, "node_modules/.bin/wrangler"), args, {
      cwd: root, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account, CI: "true" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 120_000);
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("close", code => {
      clearTimeout(timeout);
      if (code === 0) resolveResult(output);
      else reject(new Error(`Wrangler ${args[0]} failed (${code}): ${output.replaceAll(key, "[redacted]").replaceAll(signingKey, "[redacted]").slice(-3000)}`));
    });
    child.stdin.end(input ?? "");
  });
}

function headers(index) {
  return { "X-LBT-Capacity-Key": key, "X-LBT-Capacity-IP": `2001:db8::${(index + 1).toString(16)}` };
}
async function json(base, path, index = 0, method = "GET") {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetch(base + path, { method, headers: headers(index), redirect: "error", signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      const codes = [error.cause?.code, ...(error.cause?.errors ?? []).map(cause => cause.code)];
      if (attempt >= 3 || !codes.some(code => ["ECONNRESET", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"].includes(code))) throw error;
      httpRetries++; await pause(2000 * (attempt + 1)); continue;
    }
    // Fresh workers.dev routes can lag deployment. Retry only responses that
    // cannot have created a guest; never retry throttling or a socket message.
    if ([404, 503].includes(response.status) && attempt < 5) {
      httpRetries++; await response.body?.cancel(); await pause(2000); continue;
    }
    assert.equal(response.status, 200, `Unexpected HTTP status on ${path}`);
    return response.json();
  }
}
function connect(base, token, index) {
  const ws = new WebSocket(base.replace("https:", "wss:") + "/api/v1/lbt/ws", `bearer.${token}`, {
    headers: { ...headers(index), Origin: "https://capacity.invalid" }, handshakeTimeout: 30_000,
  });
  const queue = [];
  const waiters = [];
  let failure;
  const fail = error => {
    failure = error;
    for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timeout); waiter.reject(error); }
  };
  ws.on("error", error => fail(new Error(`Socket ${index} failed: ${error.message.replaceAll(token, "[redacted]").replaceAll(key, "[redacted]").slice(0, 200)}`)));
  ws.on("close", code => fail(new Error(`Socket ${index} closed (${code})`)));
  ws.on("message", data => {
    let frame;
    try { frame = JSON.parse(String(data)); } catch { fail(new Error("Malformed frame")); return; }
    if (frame.type === "lbt.error") { fail(new Error(`Protocol error: ${frame.code}`)); return; }
    const at = waiters.findIndex(waiter => waiter.matches(frame));
    if (at >= 0) {
      const [waiter] = waiters.splice(at, 1); clearTimeout(waiter.timeout); waiter.resolve(frame);
    } else if (frame.type !== "heartbeat.ack" && frame.type !== "lbt.status") {
      queue.push(frame);
      if (queue.length > 1000) fail(new Error("Unexpected frame backlog"));
    }
  });
  return {
    ws, token, index, partner: null,
    send(frame) { if (failure) throw failure; ws.send(JSON.stringify(frame)); },
    next(type, predicate = () => true) {
      const matches = frame => frame.type === type && predicate(frame);
      const at = queue.findIndex(matches);
      if (at >= 0) return Promise.resolve(queue.splice(at, 1)[0]);
      const result = new Promise((resolveFrame, reject) => {
        if (failure) { reject(failure); return; }
        const waiter = { matches, resolve: resolveFrame, reject, timeout: null };
        waiter.timeout = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1); reject(new Error(`Socket ${index}: timed out waiting for ${type}`));
        }, 30_000);
        waiters.push(waiter);
      });
      // A synchronous send failure can precede the caller's await. Mark this
      // promise handled immediately so Node cannot exit before finally cleans
      // up remote resources; awaiting the original still propagates its error.
      result.catch(() => {});
      return result;
    },
  };
}
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
};

let failure;
try {
  await mkdir(directory, { recursive: true });
  console.log(`Creating isolated test resources: ${name}`);
  const created = await wrangler(["d1", "create", name, "--location", "apac", "--update-config=false"]);
  const databaseId = /"database_id"\s*:\s*"([a-f0-9-]{36})"/.exec(created)?.[1];
  databaseCreated = true;
  assert.ok(databaseId, "Cannot identify newly created D1 database");
  await writeFile(configPath, JSON.stringify({
    name, account_id: account, main: resolve(root, "scripts/staging-entry.ts"),
    compatibility_date: "2026-08-20", workers_dev: true, preview_urls: false, routes: [],
    observability: { enabled: false },
    durable_objects: { bindings: [{ name: "TOWN", class_name: "TownObject" }] },
    migrations: [{ tag: "v1", new_sqlite_classes: ["TownObject"] }],
    d1_databases: [{ binding: "DB", database_name: name, database_id: databaseId, migrations_dir: resolve(root, "migrations") }],
    vars: { LBT_CAPACITY_MODE: "isolated", ALLOWED_ORIGINS: "https://capacity.invalid", LBT_OPEN_HOURS: "", LBT_TIMEZONE: "Asia/Taipei" },
  }, null, 2));
  await wrangler(["d1", "migrations", "apply", name, "--remote", "-c", configPath]);
  workerAttempted = true;
  const deployed = await wrangler(["deploy", "-c", configPath]);
  const base = /https:\/\/lbt-capacity-[a-f0-9]+\.[a-z0-9-]+\.workers\.dev/.exec(deployed)?.[0];
  assert.ok(base, "No isolated workers.dev URL returned");
  await wrangler(["secret", "bulk", "-c", configPath], JSON.stringify({ LBT_CAPACITY_KEY: key, LBT_TOKEN_SECRET: signingKey }));
  // No unauthenticated traffic, redirect to production or admin access allowed.
  for (let attempt = 0; ; attempt++) {
    try {
      assert.equal((await json(base, "/healthz")).ok, true); break;
    } catch (error) {
      if (attempt >= 5) throw error;
      await pause(5000);
    }
  }
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(base + "/healthz", { redirect: "error", signal: AbortSignal.timeout(30_000) });
    const status = response.status; await response.body?.cancel();
    if ([404, 503].includes(status) && attempt < 5) { httpRetries++; await pause(2000); continue; }
    assert.equal(status, 403, "Unauthenticated staging requests must be denied"); break;
  }
  const setupStarted = Date.now();
  heartbeat = setInterval(() => {
    for (const client of clients) if (client.ws.readyState === WebSocket.OPEN) {
      try { client.send({ type: "heartbeat" }); } catch { /* next() reports failure */ }
    }
  }, 10_000);
  for (let offset = 0; offset < count; offset += 20) {
    if (interrupted) throw new Error("Interrupted; cleaning up");
    const batch = await Promise.all(Array.from({ length: Math.min(20, count - offset) }, async (_, i) => {
      const index = offset + i;
      const guest = await json(base, "/api/v1/lbt/guest", index, "POST");
      for (let attempt = 0; ; attempt++) {
        const client = connect(base, guest.token, index);
        try {
          await client.next("lbt.idle"); clients.push(client); return client;
        } catch (error) {
          client.ws.terminate();
          if (!/Unexpected server response: (404|503)$/.test(error.message) || attempt >= 5) throw error;
          handshakeRetries++; await pause(2000 * (attempt + 1));
        }
      }
    }));
    await Promise.all(batch.map(async client => {
      const matched = client.next("lbt.matched");
      client.send({ type: "join", adult: true, profile: { nickname: `capacity${client.index}`, energy: 1, preference: "casual" } });
      client.partner = Number((await matched).partner.nickname.replace("capacity", ""));
    }));
    console.log(`Paired ${clients.length}/${count} synthetic guests`);
  }
  const setupMs = Date.now() - setupStarted;
  const status = await json(base, "/api/v1/lbt/status");
  assert.equal(status.online, count); assert.equal(status.waiting, 0);
  // Replace 10% of sockets while retaining their actual conversation/token.
  let reconnects = 0;
  for (let i = 0; i < clients.length; i += 10) {
    const old = clients[i]; const replacement = connect(base, old.token, old.index);
    clients[i] = replacement;
    try {
      const matched = await replacement.next("lbt.matched");
      assert.equal(Number(matched.partner.nickname.replace("capacity", "")), old.partner);
      replacement.partner = old.partner; reconnects++;
    } finally { old.ws.close(1000); }
  }
  const latencies = [];
  const started = Date.now();
  let rounds = 0;
  while (Date.now() - started < seconds * 1000) {
    if (interrupted) throw new Error("Interrupted; cleaning up");
    const round = rounds++;
    const pending = clients.map(client => {
      const sentAt = Date.now();
      return client.next("lbt.message", frame => frame.from === "partner" && frame.text === `capacity ${round} ${client.partner}`)
        .then(() => { latencies.push(Date.now() - sentAt); });
    });
    const received = Promise.all(pending);
    received.catch(() => {}); // Keep cleanup safe if send throws before await.
    for (const client of clients) client.send({ type: "message", text: `capacity ${round} ${client.index}` });
    await received;
    const remaining = seconds * 1000 - (Date.now() - started);
    if (remaining > 0) await pause(Math.min(10_000, remaining));
    console.log(`Sustained ${Math.round((Date.now() - started) / 1000)}s; ${latencies.length} partner messages received`);
  }
  const ending = clients.map(client => client.next("lbt.ended"));
  for (const client of clients) client.send({ type: "leave" });
  await Promise.all(ending);
  const result = { scenario: "isolated Cloudflare staging", guests: count, pairs: count / 2, setup_ms: setupMs,
    duration_seconds: seconds, reconnects, http_retries: httpRetries, handshake_retries: handshakeRetries, partner_messages: latencies.length,
    message_p50_ms: percentile(latencies, 0.5), message_p95_ms: percentile(latencies, 0.95) };
  console.log(JSON.stringify(result));
} catch (error) {
  failure = error;
} finally {
  clearInterval(heartbeat);
  for (const client of clients) client.ws.terminate();
  let cleanupFailed = false;
  if (workerAttempted) try {
    await wrangler(["delete", name, "-c", configPath, "--force"]);
    console.log(`Deleted isolated Worker ${name}`);
  } catch (error) { console.error(error.message); cleanupFailed = true; }
  if (databaseCreated) try {
    await wrangler(["d1", "delete", name, "--skip-confirmation"]);
    console.log(`Deleted isolated D1 ${name}`);
  } catch (error) { console.error(error.message); cleanupFailed = true; }
  if (!cleanupFailed) await rm(directory, { recursive: true, force: true });
  else failure ??= new Error(`Cleanup incomplete: remove only isolated resources named ${name}`);
}
if (failure) {
  console.error(failure.message);
  if (failure.cause?.code) console.error(`Network cause: ${failure.cause.code}`);
  if (Array.isArray(failure.cause?.errors)) console.error(`Network causes: ${failure.cause.errors.map(error => error.code).join(", ")}`);
  process.exitCode = 1;
}
