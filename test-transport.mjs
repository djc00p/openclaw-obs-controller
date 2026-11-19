// Transport security tests for the OBS WebSocket client.
//
// Covers the ClawHub audit finding on obs-controller@0.1.4:
//   CWE-319 — cleartext transmission of OBS control messages.
//
// Run: node test-transport.mjs

import { ObsClient, isLoopbackHost } from "./src/obs-client.mjs";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || "mismatch"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn, matcher, msg) {
  let threw = null;
  try {
    fn();
  } catch (e) {
    threw = e;
  }
  if (!threw) throw new Error(`${msg || "expected a throw"}: nothing was thrown`);
  if (matcher && !matcher.test(threw.message)) {
    throw new Error(`${msg || "wrong error"}: "${threw.message}" did not match ${matcher}`);
  }
}

console.log("=".repeat(70));
console.log("OBS Controller — Transport Security Tests");
console.log("=".repeat(70));
console.log();

console.log("Loopback detection");
check("localhost is loopback", () => assert(isLoopbackHost("localhost")));
check("127.0.0.1 is loopback", () => assert(isLoopbackHost("127.0.0.1")));
check("127.1.2.3 is loopback", () => assert(isLoopbackHost("127.1.2.3")));
check("::1 is loopback", () => assert(isLoopbackHost("::1")));
check("0:0:0:0:0:0:0:1 is loopback", () => assert(isLoopbackHost("0:0:0:0:0:0:0:1")));
check("obs.example.com is NOT loopback", () => assert(!isLoopbackHost("obs.example.com")));
check("10.0.0.5 is NOT loopback", () => assert(!isLoopbackHost("10.0.0.5")));
check("192.168.1.10 is NOT loopback", () => assert(!isLoopbackHost("192.168.1.10")));
check("an empty host is NOT loopback", () => assert(!isLoopbackHost("")));
check("case is ignored", () => assert(isLoopbackHost("LOCALHOST")));
console.log();

console.log("Plaintext to a remote host is refused by default");
check("refuses ws:// to a remote host", () => {
  const c = new ObsClient({ host: "obs.example.com", port: 4455, password: "p" });
  assertThrows(
    () => c.buildConnectionTarget(),
    /Refusing to open an unencrypted/,
    "expected a transport-policy refusal",
  );
});
check("refusal message explains the remediation", () => {
  const c = new ObsClient({ host: "10.0.0.5", port: 4455, password: "p" });
  try {
    c.buildConnectionTarget();
    throw new Error("expected a throw");
  } catch (e) {
    assert(/wss:\/\//.test(e.message), "message should mention wss://");
    assert(/allowInsecureRemote/.test(e.message), "message should name the opt-in flag");
  }
});
check("refuses ws:// to a private LAN address", () => {
  const c = new ObsClient({ host: "192.168.1.10", port: 4455, password: "p" });
  assertThrows(() => c.buildConnectionTarget(), /Refusing to open an unencrypted/);
});
console.log();

console.log("Plaintext to loopback stays allowed (the default setup)");
check("allows ws:// to localhost", () => {
  const c = new ObsClient({ host: "localhost", port: 4455, password: "p" });
  const t = c.buildConnectionTarget();
  assertEqual(t.url, "ws://localhost:4455");
  assertEqual(t.secure, false);
});
check("allows ws:// to 127.0.0.1", () => {
  const c = new ObsClient({ host: "127.0.0.1", port: 4455, password: "p" });
  assertEqual(c.buildConnectionTarget().url, "ws://127.0.0.1:4455");
});
console.log();

console.log("TLS is supported and is the safe path for remote hosts");
check("secure: true produces wss://", () => {
  const c = new ObsClient({ host: "obs.example.com", port: 4455, password: "p", secure: true });
  const t = c.buildConnectionTarget();
  assertEqual(t.url, "wss://obs.example.com:4455");
  assertEqual(t.secure, true);
});
check("secure: true works for loopback too", () => {
  const c = new ObsClient({ host: "localhost", port: 4455, password: "p", secure: true });
  assertEqual(c.buildConnectionTarget().url, "wss://localhost:4455");
});
check("secure defaults to false", () => {
  const c = new ObsClient({ host: "localhost", port: 4455, password: "p" });
  assertEqual(c.getConfig().secure, false);
});
console.log();

console.log("Certificate verification is on by default and can be tightened, not loosened silently");
check("rejectUnauthorized defaults to true", () => {
  const c = new ObsClient({ host: "localhost", port: 4455, password: "p", secure: true });
  assertEqual(c.getConfig().rejectUnauthorized, true);
});
check("rejectUnauthorized can be set false explicitly", () => {
  const c = new ObsClient({
    host: "obs.example.com", port: 4455, password: "p", secure: true,
    rejectUnauthorized: false,
  });
  assertEqual(c.getConfig().rejectUnauthorized, false);
});
check("a private CA can be supplied", () => {
  const ca = "-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----";
  const c = new ObsClient({ host: "obs.example.com", port: 4455, password: "p", secure: true, ca });
  assertEqual(c.getConfig().ca, ca);
});
console.log();

console.log("Explicit opt-in allows plaintext remote, and only that");
check("allowInsecureRemote permits ws:// to a remote host", () => {
  const c = new ObsClient({
    host: "obs.example.com", port: 4455, password: "p", allowInsecureRemote: true,
  });
  const t = c.buildConnectionTarget();
  assertEqual(t.url, "ws://obs.example.com:4455");
  assertEqual(t.secure, false);
});
check("allowInsecureRemote defaults to false", () => {
  const c = new ObsClient({ host: "obs.example.com", port: 4455, password: "p" });
  assertEqual(c.getConfig().allowInsecureRemote, false);
});
console.log();

console.log("A rejected configuration does not enter the reconnect loop");
check("scheduleReconnect does not arm a timer after a refusal", () => {
  const c = new ObsClient({ host: "obs.example.com", port: 4455, password: "p" });
  c.scheduleReconnect();
  assertEqual(c.reconnectTimer, null, "a refused config must not schedule a retry");
});
check("scheduleReconnect arms a timer for a valid config", (done) => {
  const c = new ObsClient({ host: "localhost", port: 4455, password: "p" });
  c.scheduleReconnect();
  assert(c.reconnectTimer !== null, "a valid config should schedule a retry");
  c.disconnect();
});
console.log();

console.log("Config plumbing");
check("password is never exposed in the URL", () => {
  const c = new ObsClient({ host: "localhost", port: 4455, password: "sup3rs3cret" });
  const t = c.buildConnectionTarget();
  assert(!t.url.includes("sup3rs3cret"), "the URL must not carry the password");
});
check("the auth challenge/response still hashes the password", () => {
  const c = new ObsClient({ host: "localhost", port: 4455, password: "pw" });
  const a = c.generateAuth("challenge", "salt");
  const b = c.generateAuth("challenge", "salt");
  assertEqual(a, b, "the same inputs must produce the same auth string");
  assert(a !== "challenge", "the auth string must not be the challenge");
});
console.log();

console.log("=".repeat(70));
console.log(`PASS: ${passed}   FAIL: ${failed}`);
console.log("=".repeat(70));
if (failed > 0) {
  console.log();
  console.log("Failures:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
