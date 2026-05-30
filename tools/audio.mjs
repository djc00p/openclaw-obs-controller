export function registerAudioTools(api, getClient) {
  const requireClient = () => {
    const client = getClient();
    if (!client?.isConnected()) throw new Error("OBS is not connected.");
    return client;
  };

  api.registerTool({
    name: "obs_toggle_mute",
    description: "Toggle mute on an audio input (e.g. 'Mic/Aux', 'Desktop Audio')",
    parameters: {
      type: "object",
      properties: { inputName: { type: "string", description: "Name of the audio input" } },
      required: ["inputName"],
      additionalProperties: false,
    },
    async execute(_id, params) {
      const client = requireClient();
      const data = await client.request("ToggleInputMute", { inputName: params.inputName });
      return { content: [{ type: "text", text: `${params.inputName} is now ${data.inputMuted ? "muted" : "unmuted"}.` }] };
    },
  });

  api.registerTool({
    name: "obs_set_volume",
    description: "Set volume for an audio input (0.0 to 1.0)",
    parameters: {
      type: "object",
      properties: {
        inputName: { type: "string", description: "Name of the audio input" },
        volume: { type: "number", description: "Volume 0-1 (e.g. 0.5 = 50%)" },
      },
      required: ["inputName", "volume"],
      additionalProperties: false,
    },
    async execute(_id, params) {
      const client = requireClient();
      const vol = Math.max(0, Math.min(1, params.volume));
      await client.request("SetInputVolume", { inputName: params.inputName, inputVolumeMul: vol });
      return { content: [{ type: "text", text: `${params.inputName} volume set to ${Math.round(vol * 100)}%.` }] };
    },
  });
}
