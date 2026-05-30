import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { ObsClient } from "./src/obs-client.mjs";
import { registerSceneTools } from "./tools/scenes.mjs";
import { registerOutputTools } from "./tools/outputs.mjs";
import { registerAudioTools } from "./tools/audio.mjs";
import { registerItemTools } from "./tools/items.mjs";
import { registerGeneralTools } from "./tools/general.mjs";

let obsClient = null;

export default definePluginEntry({
  id: "obs-controller",
  name: "OBS Controller",
  description: "Control OBS Studio scenes, streaming, recording, audio, and more via obs-websocket",
  register(api) {
    const config = (api.pluginConfig ?? {});

    // Prefer env vars for secrets, fall back to plugin config
    const host = process.env.OBS_WEBSOCKET_HOST || config.host || "localhost";
    const port = parseInt(process.env.OBS_WEBSOCKET_PORT || config.port || 4455, 10);
    const password = process.env.OBS_WEBSOCKET_PASSWORD || config.password || "";
    const reconnectMs = parseInt(process.env.OBS_RECONNECT_MS || config.reconnectIntervalMs || 5000, 10);

    obsClient = new ObsClient({ host, port, password, reconnectIntervalMs: reconnectMs });

    obsClient.connect().catch((err) => {
      console.error("[obs-controller] Connection failed:", err.message);
    });

    const getClient = () => obsClient;

    registerSceneTools(api, getClient);
    registerOutputTools(api, getClient);
    registerAudioTools(api, getClient);
    registerItemTools(api, getClient);
    registerGeneralTools(api, getClient);

    api.on("plugin_teardown", () => {
      obsClient?.disconnect();
      obsClient = null;
    });
  },
});
