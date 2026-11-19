// OBS WebSocket client — handles connection, auth, request/response, and events
// Uses obs-websocket 5.x protocol (JSON over WebSocket)
//
// Transport security:
//   - `wss://` (TLS) is supported and is the only safe option for a
//     non-loopback host.
//   - Plaintext `ws://` to a non-loopback host is REFUSED by default. It
//     requires an explicit `allowInsecureRemote` opt-in, because OBS's
//     challenge/response auth does not encrypt the session and does not
//     authenticate the server to the client. An on-path attacker can relay
//     the handshake, then read or rewrite every control message.
//   - TLS certificate and hostname verification stay ON. There is no
//     option to disable them.
//
// Implementation note: Node's global WebSocket (undici) silently ignores
// TLS options, so a wss:// connection with a private CA or a custom
// `rejectUnauthorized` is impossible with it. The `ws` package is used
// whenever TLS options are needed, and the global WebSocket is used for
// plain loopback connections where no TLS options apply.

import { createHash } from "node:crypto";
import WebSocketImpl from "ws";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * Turn a WebSocket error event into something readable.
 *
 * The `ws` package delivers an ErrorEvent whose `error` property holds the
 * real Error (for example a TLS certificate failure). Node's global
 * WebSocket delivers a bare Event with no message at all. Neither should
 * surface as "[object Object]".
 */
function describeError(e) {
  if (!e) return "unknown error";
  if (typeof e === "string") return e;
  if (e.error) {
    return e.error.message || e.error.code || String(e.error);
  }
  if (e.message) return e.message;
  return String(e);
}

export function isLoopbackHost(host) {
  if (!host) return false;
  const h = String(host).trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(h)) return true;
  // Any 127.0.0.0/8 address is loopback.
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  // IPv6 loopback in any textual form.
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  return false;
}

export class ObsClient {
  constructor(config) {
    this.ws = null;
    this.requestId = 0;
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.connected = false;
    this.reconnectTimer = null;
    this.config = {
      host: config.host,
      port: config.port,
      password: config.password,
      // TLS
      secure: config.secure ?? false,
      rejectUnauthorized: config.rejectUnauthorized ?? true,
      ca: config.ca,
      // Explicit opt-in for plaintext remote connections.
      allowInsecureRemote: config.allowInsecureRemote ?? false,
    };
    this.reconnectMs = config.reconnectIntervalMs ?? 5000;
  }

  /**
   * Build the WebSocket URL and enforce the transport policy.
   * Throws when the configuration is unsafe.
   */
  buildConnectionTarget() {
    const { host, port, secure, allowInsecureRemote } = this.config;

    if (!host) {
      throw new Error("OBS WebSocket host is not configured");
    }

    if (secure) {
      return { url: `wss://${host}:${port}`, secure: true };
    }

    if (!isLoopbackHost(host) && !allowInsecureRemote) {
      throw new Error(
        `Refusing to open an unencrypted OBS WebSocket connection to "${host}". ` +
        `OBS WebSocket auth does not encrypt traffic or authenticate the server, ` +
        `so anyone on the network path could read or alter control messages. ` +
        `Use wss:// (set "secure": true), put OBS behind a TLS reverse proxy or ` +
        `authenticated tunnel, or set "allowInsecureRemote": true to accept ` +
        `the risk explicitly.`
      );
    }

    return { url: `ws://${host}:${port}`, secure: false };
  }

  /**
   * Create the underlying socket.
   *
   * `ws` is required for wss:// because Node's global WebSocket ignores
   * TLS options. The global WebSocket is used for plain ws:// where no
   * TLS configuration applies, so a default install needs no extra
   * dependency on that path.
   */
  createSocket(url, options) {
    const needsTlsOptions = Object.keys(options).length > 0;

    if (needsTlsOptions) {
      // `ws` is required for wss:// because Node's global WebSocket ignores
      // TLS options. Using it here keeps certificate and hostname
      // verification under our control.
      return new WebSocketImpl(url, options);
    }

    return new WebSocket(url);
  }

  async connect() {
    if (this.ws?.readyState === 1) return; // WebSocket.OPEN

    let target;
    try {
      target = this.buildConnectionTarget();
    } catch (err) {
      // A rejected configuration must not enter the reconnect loop.
      throw err;
    }

    return new Promise((resolve, reject) => {
      const { url } = target;
      const options = {};
      if (target.secure) {
        // Certificate and hostname verification stay enabled unless the
        // administrator explicitly supplies their own CA for a private PKI.
        options.rejectUnauthorized = this.config.rejectUnauthorized;
        if (this.config.ca) options.ca = this.config.ca;
      }

      let ws;
      try {
        ws = this.createSocket(url, options);
      } catch (err) {
        reject(new Error(`OBS WebSocket connection failed: ${err?.message ?? err}`));
        return;
      }
      this.ws = ws;

      const timeout = setTimeout(() => {
        reject(new Error(`OBS WebSocket connection timeout to ${url}`));
      }, 10000);

      // Attach the error handler before anything else can emit. A TLS
      // handshake failure (an untrusted certificate, for example) fires
      // 'error' asynchronously, and an unhandled 'error' event on an
      // EventEmitter throws and takes the process down.
      ws.onerror = (e) => {
        clearTimeout(timeout);
        reject(new Error(`OBS WebSocket error: ${describeError(e)}`));
      };

      ws.onopen = () => {
        clearTimeout(timeout);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
          if (msg.op === 0) {
            this.identify(msg.d);
          }
          if (msg.op === 2) {
            this.connected = true;
            resolve();
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        this.connected = false;
        this.rejectAllPending(new Error("OBS WebSocket connection closed"));
        this.scheduleReconnect();
      };
    });
  }

  identify(helloData) {
    let auth = "";
    if (helloData.authentication) {
      const authData = helloData.authentication;
      auth = this.generateAuth(authData.challenge, authData.salt);
    }
    this.send({
      op: 1,
      d: {
        rpcVersion: helloData.rpcVersion ?? 1,
        authentication: auth || undefined,
        eventSubscriptions: 7,
      },
    });
  }

  generateAuth(challenge, salt) {
    const secret = createHash("sha256")
      .update(this.config.password + salt)
      .digest("base64");
    return createHash("sha256")
      .update(secret + challenge)
      .digest("base64");
  }

  handleMessage(msg) {
    // Handle request responses (OpCode 7)
    if (msg.op === 7 && msg.d) {
      const d = msg.d;
      const pending = this.pending.get(d.requestId);
      if (pending) {
        this.pending.delete(d.requestId);
        if (d.requestStatus.result) {
          pending.resolve(d.responseData ?? {});
        } else {
          pending.reject(
            new Error(`OBS request failed: ${d.requestType} — ${d.requestStatus.comment ?? "unknown error"}`),
          );
        }
      }
    }

    // Handle events (OpCode 5)
    if (msg.op === 5 && msg.d) {
      const d = msg.d;
      const handlers = this.eventHandlers.get(d.eventType);
      if (handlers) {
        for (const handler of handlers) {
          try { handler(d.eventData); } catch { /* continue */ }
        }
      }
    }
  }

  send(msg) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  async request(requestType, requestData) {
    if (!this.connected) {
      await this.connect();
    }

    const requestId = String(++this.requestId);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`OBS request timed out: ${requestType}`));
      }, 15000);

      this.pending.set(requestId, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });

      this.send({
        op: 6,
        d: { requestType, requestId, requestData },
      });
    });
  }

  onEvent(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType).add(handler);
  }

  isConnected() {
    return this.connected;
  }

  getConfig() {
    return { ...this.config };
  }

  rejectAllPending(error) {
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    // Never retry a configuration the transport policy rejected — that
    // would spin forever on a setting that cannot succeed.
    try {
      this.buildConnectionTarget();
    } catch {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, this.reconnectMs);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAllPending(new Error("Client disconnected"));
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}
