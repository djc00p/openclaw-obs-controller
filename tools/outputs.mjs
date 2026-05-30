export function registerOutputTools(api, getClient) {
  const noParams = { type: "object", properties: {}, additionalProperties: false };
  const requireClient = () => {
    const client = getClient();
    if (!client?.isConnected()) throw new Error("OBS is not connected.");
    return client;
  };

  api.registerTool({ name: "obs_start_stream", description: "Start streaming in OBS", parameters: noParams,
    async execute() { await requireClient().request("StartStream"); return { content: [{ type: "text", text: "Stream started." }] }; } });
  api.registerTool({ name: "obs_stop_stream", description: "Stop streaming in OBS", parameters: noParams,
    async execute() { await requireClient().request("StopStream"); return { content: [{ type: "text", text: "Stream stopped." }] }; } });
  api.registerTool({ name: "obs_get_stream_status", description: "Get current stream status (active, bitrate, duration, etc.)", parameters: noParams,
    async execute() { const data = await requireClient().request("GetStreamStatus"); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } });
  api.registerTool({ name: "obs_start_recording", description: "Start recording in OBS", parameters: noParams,
    async execute() { await requireClient().request("StartRecord"); return { content: [{ type: "text", text: "Recording started." }] }; } });
  api.registerTool({ name: "obs_stop_recording", description: "Stop recording in OBS", parameters: noParams,
    async execute() { await requireClient().request("StopRecord"); return { content: [{ type: "text", text: "Recording stopped." }] }; } });
  api.registerTool({ name: "obs_get_recording_status", description: "Get current recording status", parameters: noParams,
    async execute() { const data = await requireClient().request("GetRecordStatus"); return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; } });
  api.registerTool({ name: "obs_start_virtualcam", description: "Start the virtual camera output", parameters: noParams,
    async execute() { await requireClient().request("StartVirtualCam"); return { content: [{ type: "text", text: "Virtual camera started." }] }; } });
  api.registerTool({ name: "obs_stop_virtualcam", description: "Stop the virtual camera output", parameters: noParams,
    async execute() { await requireClient().request("StopVirtualCam"); return { content: [{ type: "text", text: "Virtual camera stopped." }] }; } });
  api.registerTool({ name: "obs_save_replay", description: "Save the replay buffer (instant highlight clip!)", parameters: noParams,
    async execute() { await requireClient().request("SaveReplayBuffer"); return { content: [{ type: "text", text: "Replay buffer saved." }] }; } });
}
