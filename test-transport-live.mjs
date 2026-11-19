// Live TLS test: spin up a real wss:// server with a self-signed cert and
// confirm the client actually speaks TLS to it, that a private CA is
// honoured, and that an untrusted certificate is rejected.
//
// Run: node test-transport-live.mjs

import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { ObsClient } from "./src/obs-client.mjs";

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await withTimeout(fn(), 15000, name);
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms (${label})`)), ms).unref?.(),
    ),
  ]);
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

const dir = mkdtempSync(join(tmpdir(), "obs-tls-"));
const key = join(dir, "key.pem");
const cert = join(dir, "cert.pem");

try {
  const conf = join(dir, "openssl.cnf");
  writeFileSync(conf, `
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = localhost
[v3]
subjectAltName = DNS:localhost, IP:127.0.0.1
basicConstraints = CA:FALSE
`);
  execFileSync("openssl", [
    "req", "-x509", "-nodes", "-newkey", "rsa:2048",
    "-keyout", key, "-out", cert, "-days", "2", "-config", conf,
  ], { stdio: "pipe" });
} catch (err) {
  console.log("SKIP: openssl unavailable —", err.message);
  process.exit(0);
}

console.log("=".repeat(70));
console.log("OBS Controller — Live TLS Transport Test");
console.log("=".repeat(70));
console.log();

// Minimal OBS-ish websocket server: send the hello, accept the identify,
// reply with Identified (op 2).
function attachObsProtocol(wss) {
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({
      op: 0,
      d: {
        obsWebSocketVersion: "5.0.1",
        rpcVersion: 1,
        authentication: { challenge: "chal", salt: "saltsalt" },
      },
    }));
    ws.on("message", (data) => {
      const text = data.toString("utf8");
      if (text.includes("rpcVersion")) {
        ws.send(JSON.stringify({ op: 2, d: { negated: false } }));
      }
    });
  });
}

// The TLS server.
const server = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) });
const wss = new WebSocketServer({ server });
attachObsProtocol(wss);

// A separate plaintext server for the ws:// case — a plain client cannot
// speak to a TLS listener.
const plainServer = createHttpServer();
const plainWss = new WebSocketServer({ server: plainServer });
attachObsProtocol(plainWss);

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
await new Promise((resolve) => plainServer.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const plainPort = plainServer.address().port;
const ca = readFileSync(cert, "utf8");
console.log(`  (tls server on 127.0.0.1:${port}, plain server on 127.0.0.1:${plainPort})`);
console.log();

await check("connects over wss:// when the private CA is supplied", async () => {
  const c = new ObsClient({
    host: "localhost", port, password: "pw", secure: true, ca,
  });
  await c.connect();
  assert(c.isConnected(), "client should report connected");
  c.disconnect();
});

await check("refuses a wss:// endpoint whose certificate is not trusted", async () => {
  const c = new ObsClient({
    host: "localhost", port, password: "pw", secure: true,
    // No `ca` — the self-signed cert is not in the system trust store.
  });
  let err = null;
  try {
    await c.connect();
  } catch (e) {
    err = e;
  }
  assert(err !== null, "expected the connection to fail on certificate validation");
});

await check("rejectUnauthorized: false accepts the untrusted certificate", async () => {
  const c = new ObsClient({
    host: "localhost", port, password: "pw", secure: true, rejectUnauthorized: false,
  });
  await c.connect();
  assert(c.isConnected(), "client should report connected");
  c.disconnect();
});

await check("the plain ws:// path still works against a plaintext server", async () => {
  const c = new ObsClient({ host: "localhost", port: plainPort, password: "pw" });
  const t = c.buildConnectionTarget();
  assert(t.url.startsWith("ws://"), "loopback plaintext should still be allowed");
  await c.connect();
  assert(c.isConnected(), "plaintext loopback should connect");
  c.disconnect();
});

await check("a remote plaintext host is refused even when TLS is available", async () => {
  const c = new ObsClient({ host: "obs.example.com", port, password: "pw" });
  let err = null;
  try {
    c.buildConnectionTarget();
  } catch (e) {
    err = e;
  }
  assert(err !== null, "expected a transport-policy refusal");
  assert(/Refusing to open an unencrypted/.test(err.message), "wrong error message");
});

await check("the TLS path really used TLS (the socket was encrypted)", async () => {
  const c = new ObsClient({
    host: "localhost", port, password: "pw", secure: true, ca,
  });
  await c.connect();
  const socket = c.ws._socket;
  assert(socket, "expected an underlying socket");
  assert(socket.encrypted === true, "the underlying socket should be encrypted");
  const proto = socket.getProtocol?.() ?? "";
  assert(proto.startsWith("TLS"), `expected a TLS protocol, got ${proto}`);
  c.disconnect();
});

wss.close();
server.close();
plainWss.close();
plainServer.close();

console.log();
console.log("=".repeat(70));
console.log(`PASS: ${passed}   FAIL: ${failed}`);
console.log("=".repeat(70));
if (failed > 0) {
  console.log();
  for (const f of failures) console.log(`  ✗ ${f}`);
}
// The websocket servers keep handles open; exit explicitly.
process.exit(failed > 0 ? 1 : 0);
