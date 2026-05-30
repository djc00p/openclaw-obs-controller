export function registerGeneralTools(api, getClient) {
  const noParams = { type: "object", properties: {}, additionalProperties: false };
  const requireClient = () => {
    const client = getClient();
    if (!client?.isConnected()) throw new Error("OBS is not connected.");
    return client;
  };

  api.registerTool({ name: "obs_get_version", description: "Get OBS Studio version info", parameters: noParams,
    async execute() { const data = await requireClient().request("GetVersion"); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } });
  api.registerTool({ name: "obs_get_stats", description: "Get OBS performance stats (FPS, CPU, dropped frames, memory)", parameters: noParams,
    async execute() { const data = await requireClient().request("GetStats"); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } });
  api.registerTool({ name: "obs_get_transitions", description: "List available scene transitions", parameters: noParams,
    async execute() { const data = await requireClient().request("GetSceneTransitionList"); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } });
  api.registerTool({
    name: "obs_set_transition", description: "Set scene transition type",
    parameters: { type: "object", properties: { transitionName: { type: "string", description: "e.g. 'Fade', 'Cut'" } }, required: ["transitionName"], additionalProperties: false },
    async execute(_id, params) { await requireClient().request("SetCurrentSceneTransition", { transitionName: params.transitionName }); return { content: [{ type: "text", text: `Transition: ${params.transitionName}` }] }; },
  });
  api.registerTool({ name: "obs_trigger_transition", description: "Trigger studio mode transition", parameters: noParams,
    async execute() { await requireClient().request("TriggerStudioModeTransition"); return { content: [{ type: "text", text: "Transition triggered." }] }; } });
  api.registerTool({
    name: "obs_trigger_hotkey", description: "Trigger an OBS hotkey by exact name",
    parameters: { type: "object", properties: { hotkeyName: { type: "string", description: "Exact hotkey name from OBS Settings" } }, required: ["hotkeyName"], additionalProperties: false },
    async execute(_id, params) { await requireClient().request("TriggerHotkeyByName", { hotkeyName: params.hotkeyName }); return { content: [{ type: "text", text: `Hotkey: ${params.hotkeyName}` }] }; },
  });
}
