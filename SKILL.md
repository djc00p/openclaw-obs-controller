---
name: obs-controller
description: "Control OBS Studio via OpenClaw chat — switch scenes, stream, record, manage audio, toggle sources, and more through natural language."
metadata: {"openclaw":{"emoji":"🎥","plugin":true,"requires":{"obs":"OBS Studio 28+ with obs-websocket enabled"}}}
---

# OBS Controller

Control OBS Studio directly from OpenClaw chat. Switch scenes, start/stop streaming/recording, manage audio, toggle sources, save replays — all through natural language.

## Quick Start

1. Ensure OBS Studio is running with WebSocket server enabled (OBS → Settings → WebSocket Server)
2. Install: `clawhub install obs-controller`
3. Add to `openclaw.json`:

```json
{
  "plugins": {
    "allow": ["obs-controller"],
    "entries": {
      "obs-controller": {
        "config": {
          "password": "your-obs-websocket-password"
        }
      }
    }
  }
}
```

4. Optionally add `obs_*` tools to your agent's `alsoAllow` list

## Tools

**Scenes:** `obs_get_scenes`, `obs_get_current_scene`, `obs_switch_scene`
**Streaming:** `obs_start_stream`, `obs_stop_stream`, `obs_get_stream_status`
**Recording:** `obs_start_recording`, `obs_stop_recording`, `obs_get_recording_status`, `obs_save_replay`
**Virtual Cam:** `obs_start_virtualcam`, `obs_stop_virtualcam`
**Audio:** `obs_toggle_mute`, `obs_set_volume`
**Sources:** `obs_get_scene_items`, `obs_toggle_source`
**Transitions:** `obs_trigger_transition`, `obs_get_transitions`, `obs_set_transition`
**Other:** `obs_get_stats`, `obs_get_version`, `obs_trigger_hotkey`

## Example

```
You: Switch to Starting Soon scene and start streaming
Assistant: Switched to Starting Soon. Stream started.
```

## Requirements

- OBS Studio 28+ with obs-websocket enabled
- OpenClaw gateway
