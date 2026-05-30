export function registerSceneTools(api, getClient) {
  const requireClient = () => {
    const client = getClient();
    if (!client?.isConnected()) {
      throw new Error("OBS is not connected. Check that OBS Studio is running with WebSocket enabled.");
    }
    return client;
  };

  api.registerTool({
    name: "obs_get_scenes",
    description: "Get a list of all scenes in OBS Studio",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      const client = requireClient();
      const data = await client.request("GetSceneList");
      return { content: [{ type: "text", text: JSON.stringify(data.scenes, null, 2) }] };
    },
  });

  api.registerTool({
    name: "obs_get_current_scene",
    description: "Get the currently active program scene",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      const client = requireClient();
      const data = await client.request("GetCurrentProgramScene");
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  api.registerTool({
    name: "obs_switch_scene",
    description: "Switch to a specific scene by name",
    parameters: {
      type: "object",
      properties: { sceneName: { type: "string", description: "Exact name of the scene to switch to" } },
      required: ["sceneName"],
      additionalProperties: false,
    },
    async execute(_id, params) {
      const client = requireClient();
      await client.request("SetCurrentProgramScene", { sceneName: params.sceneName });
      return { content: [{ type: "text", text: `Switched to scene: ${params.sceneName}` }] };
    },
  });
}
