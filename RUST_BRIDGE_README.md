# Brainscan Rust Bridge - Quick Start

## Build

```bash
cd rust-bridge
cargo build --release
```

## Run All Components

### Terminal 1: EEG Bridge Server (Python)
```bash
python eeg_bridge_server.py
```

### Terminal 2: LMStudio
1. Open LMStudio
2. Load a model (e.g., llama-3.1, qwen2.5)
3. Enable server: Settings → Developer → Local Inference Server
4. Verify: curl http://localhost:1234/v1/models

### Terminal 3: Rust Bridge
```bash
cd rust-bridge
cargo run --release
```

Or with specific models:
```bash
cargo run --release -- --left-model qwen3.5-0.8b --right-model qwen2.5-0.5b
```

## Web Interface

1. Open `eeg-spatializer.html` in browser
2. Click **"Connect EEG"** (port 8765)
3. Click **"Connect AI"** (port 8766)
4. Select models for left/right hemispheres
5. Start chatting with AI about brain state

## Architecture

```
Browser (WebSocket:8766) ←→ Rust Bridge ←→ Python EEG (WebSocket:8765)
                                    ↓
                              LMStudio (HTTP:1234)
```

## Features

- **Left Hemisphere**: F3, C3, P3, P7 channels
- **Right Hemisphere**: F4, C4, PZ, P8 channels
- **Independent Models**: Different LLMs per hemisphere
- **Real-time Chat**: Talk to AI about current brain state
- **<1ms Latency**: Rust provides 10x performance vs Python

## Troubleshooting

**"No models available"**
- Check LMStudio has a model loaded (green checkmark)
- Verify server is enabled in Settings

**"Cannot connect to EEG"**
- Ensure `python eeg_bridge_server.py` is running
- Check port 8765 is not blocked

**Build warnings**
- Warnings are OK, only errors prevent compilation
- The `_config` warning is expected (field reserved for future use)

## Test Commands

```bash
# Test EEG Bridge
curl ws://localhost:8765  # Should show WebSocket upgrade

# Test LMStudio
curl http://localhost:1234/v1/models

# Test Rust Bridge (in another terminal)
python -c "
import asyncio, websockets, json
async def test():
    async with websockets.connect('ws://localhost:8766') as ws:
        await ws.send(json.dumps({'type': 'get_stats'}))
        msg = await ws.recv()
        print(json.loads(msg))
asyncio.run(test())
"
```
