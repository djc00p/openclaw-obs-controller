# OBS Controller — OpenClaw Plugin

Control OBS Studio directly from OpenClaw chat. Switch scenes, start/stop streaming/recording, manage audio, toggle sources, save replays, trigger hotkeys — all through natural language.

## ⚠️ Important Safety Notice

**This plugin gives your AI agent live control over OBS Studio.** The tools it provides can start streams, stop recordings, change scenes during a broadcast, toggle sources, and trigger arbitrary hotkeys — all of which can immediately affect a live production.

- **Use tool allowlisting** — only expose `obs_*` tools to agents you trust with production control
- **Configure confirmation rules** for destructive actions (`obs_start_stream`, `obs_stop_stream`, `obs_start_recording`, `obs_stop_recording`, `obs_trigger_hotkey`) if you want a human in the loop
- **Set a strong OBS WebSocket password** — this plugin connects to your local OBS instance via WebSocket; anyone with access to that port can control your stream
- **Be aware of prompt injection risk** — if an agent can trigger OBS actions based on chat input, untrusted content could theoretically induce scene switches or stream state changes

These tools are powerful on purpose. Use them with the same caution you'd use for any live-production control surface.

## Requirements

- [OpenClaw](https://openclaw.ai) gateway
- [OBS Studio](https://obsproject.com) 28+ with [obs-websocket](https://github.com/obsproject/obs-websocket) enabled (Settings → WebSocket Server)

## Install

```bash
clawhub install obs-controller
```

Then enable it in your OpenClaw config (`openclaw.json`):

```json
{
  "plugins": {
    "allow": ["obs-controller"],
    "entries": {
      "obs-controller": {
        "config": {
          "host": "localhost",
          "port": 4455,
          "password": "your-obs-websocket-password"
        }
      }
    }
  }
}
```

If your agent's tool policy restricts tools, whitelist the `obs_*` tools in `alsoAllow`.

## Configuration

| Key | Default | Description |
|---|---|---|
| `host` | `localhost` | OBS WebSocket host |
| `port` | `4455` | OBS WebSocket port |
| `password` | `""` | WebSocket password (set in OBS → Settings → WebSocket Server) |
| `reconnectIntervalMs` | `5000` | Reconnect delay on disconnect |

## Tools

### Scenes
- `obs_get_scenes` — List all scenes
- `obs_get_current_scene` — Get active program scene
- `obs_switch_scene` — Switch to a scene by name

### Streaming & Recording
- `obs_start_stream` / `obs_stop_stream` — Start/stop streaming
- `obs_get_stream_status` — Current stream state, bitrate, duration
- `obs_start_recording` / `obs_stop_recording` — Start/stop recording
- `obs_get_recording_status` — Current recording state
- `obs_save_replay` — Save replay buffer (instant highlight)
- `obs_start_virtualcam` / `obs_stop_virtualcam` — Virtual camera output

### Audio
- `obs_toggle_mute` — Mute/unmute audio inputs
- `obs_set_volume` — Set input volume (0.0–1.0)

### Sources & Items
- `obs_get_scene_items` — List sources in a scene
- `obs_toggle_source` — Show/hide scene sources

### Transitions
- `obs_trigger_transition` — Trigger studio mode transition
- `obs_get_transitions` — List available transitions
- `obs_set_transition` — Set transition type

### Other
- `obs_get_stats` — Performance stats (FPS, CPU, dropped frames)
- `obs_get_version` — OBS version info
- `obs_trigger_hotkey` — Trigger OBS hotkeys by name

## Example Usage

```
You: Switch to Starting Soon
Kael: Switched to scene: Starting Soon

You: Start the stream
Kael: Stream started.

You: I'm done — switch to Thanks For Watching and stop the stream
Kael: Switched to scene: Thanks For Watching
Kael: Stream stopped.
```

## License

MIT
