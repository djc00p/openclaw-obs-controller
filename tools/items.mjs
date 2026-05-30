export function registerItemTools(api, getClient) {
  const requireClient = () => {
    const client = getClient();
    if (!client?.isConnected()) throw new Error("OBS is not connected.");
    return client;
  };

  api.registerTool({
    name: "obs_get_scene_items",
    description: "List all sources in a scene. Use this to find source names for other commands.",
    parameters: {
      type: "object",
      properties: { sceneName: { type: "string", description: "Scene name" } },
      required: ["sceneName"],
      additionalProperties: false,
    },
    async execute(_id, params) {
      const data = await requireClient().request("GetSceneItemList", { sceneName: params.sceneName });
      return { content: [{ type: "text", text: JSON.stringify(data.sceneItems, null, 2) }] };
    },
  });

  api.registerTool({
    name: "obs_toggle_source",
    description: "Show or hide a source in a scene",
    parameters: {
      type: "object",
      properties: {
        sceneName: { type: "string", description: "Scene containing the source" },
        sourceName: { type: "string", description: "Source name to toggle" },
      },
      required: ["sceneName", "sourceName"],
      additionalProperties: false,
    },
    async execute(_id, params) {
      const client = requireClient();
      const items = await client.request("GetSceneItemList", { sceneName: params.sceneName });
      const item = items.sceneItems.find((i) => i.sourceName === params.sourceName);
      if (!item) return { content: [{ type: "text", text: `Source "${params.sourceName}" not found in "${params.sceneName}".` }] };
      await client.request("SetSceneItemEnabled", { sceneName: params.sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: !item.sceneItemEnabled });
      return { content: [{ type: "text", text: `${params.sourceName} is now ${!item.sceneItemEnabled ? "visible" : "hidden"}.` }] };
    },
  });
}
