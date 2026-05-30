// OBS WebSocket client — handles connection, auth, request/response, and events
// Uses obs-websocket 5.x protocol (JSON over WebSocket)

import { createHash } from "node:crypto";

export class ObsClient {
  constructor(config) {
    this.ws = null;
    this.requestId = 0;
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.connected = false;
    this.reconnectTimer = null;
    this.config = { host: config.host, port: config.port, password: config.password };
    this.reconnectMs = config.reconnectIntervalMs ?? 5000;
  }

  async connect() {
    if (this.ws?.readyState === 1) return; // WebSocket.OPEN

    return new Promise((resolve, reject) => {
      const url = `ws://${this.config.host}:${this.config.port}`;
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        reject(new Error(`OBS WebSocket connection timeout to ${url}`));
      }, 10000);

      this.ws.onopen = () => {
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

      this.ws.onerror = (e) => {
        clearTimeout(timeout);
        reject(new Error(`OBS WebSocket error: ${String(e)}`));
      };

      this.ws.onclose = () => {
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
