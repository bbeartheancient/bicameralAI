# Brainscan - Bicameral EEG-to-AI Pipeline

A **fully integrated brain-to-AI system** that simulates 8-channel EEG signals, processes them through a bicameral (dual-hemisphere) architecture, and generates AI responses using local LLMs via LM Studio.

![Bicameral Architecture](docs/architecture.png)

## 🧠 What It Does

Brainscan creates a **digital bicameral brain** with:

- **Left Hemisphere** (Analytical): Logical, detailed, sequential processing
- **Right Hemisphere** (Intuitive): Holistic, pattern-based, creative processing  
- **Comparator**: Synthesizes both perspectives into unified responses
- **Real-time EEG**: Simulated 8-channel brainwave visualization
- **Peer-to-Peer**: Share brain data between users

## 🚀 Quick Start

### Prerequisites

- **LM Studio** running on port 1234 with models loaded
- **Rust** toolchain installed (for building the bridge)
- **Node.js** (optional, for MCP server)

### Step 1: Build the Bridge

```bash
cd rust-bridge
cargo build --release
```

### Step 2: Start LM Studio

1. Open LM Studio
2. Load at least one model (e.g., `qwen2.5-0.5b-instruct`)
3. Ensure server is running on `http://localhost:1234`

### Step 3: Start the Bridge

```bash
cd rust-bridge
./target/release/brainscan-bridge.exe
```

Or on Linux/Mac:
```bash
./target/release/brainscan-bridge
```

### Step 4: Open the Interface

Open `eeg-spatializer.html` in your browser:

```bash
# Using Python's built-in server
python -m http.server 8080
# Then visit http://localhost:8080/eeg-spatializer.html
```

Or just double-click the file.

## 🎮 How to Use

### 1. Connect to the Bridge

Click **"Connect to Bridge"** in the control panel. The status should turn green.

### 2. Select Models

Choose models for each hemisphere:
- **Left Hemisphere**: Analytical model (e.g., `qwen2.5-0.5b-instruct`)
- **Right Hemisphere**: Intuitive model (e.g., `qwen3.5-0.8b-claude-4.6-opus-reasoning-distilled`)
- **Comparator**: Auto-selected (can be overridden)

### 3. Start EEG Stream

Click **"Start EEG Stream"** to begin simulated 8-channel brainwave generation.

### 4. Chat with Bicameral AI

1. Type a message in the chat box
2. Select target: Left, Right, or Both
3. Hit Enter or click Send

**When "Both" is selected:**
- Left hemisphere responds (analytical)
- Right hemisphere responds (intuitive)
- Comparator synthesizes both into unified answer

### 5. Connect to Other Users (P2P)

1. Your **Peer ID** appears in the green P2P panel
2. Click **"Find Peers"** to discover others
3. Click **"Connect"** next to a peer
4. Accept the connection request
5. Share brain data via **"Share EEG"**

## 📊 Features

### Core Features
- ✅ **Bicameral Chat**: Simultaneous dual-hemisphere processing
- ✅ **Comparator Synthesis**: AI-generated unified responses
- ✅ **Real-time EEG**: 8-channel visualization at 256Hz
- ✅ **Spatialization**: 3D brain mesh with live data
- ✅ **Query Caching**: 5-minute TTL for repeated queries
- ✅ **P2P Networking**: Brain-to-brain data sharing
- ✅ **Model Selection**: Dynamic hemisphere configuration

### Advanced Features
- ✅ **MCP Server**: Claude Desktop integration
- ✅ **Coherence Tracking**: Monitor hemispheric balance
- ✅ **Cache Statistics**: Performance monitoring
- ✅ **Auto-Reconnection**: Robust WebSocket handling

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│          Browser (eeg-spatializer.html)  │
│  ┌──────────────────────────────────┐   │
│  │  Brainscan Bridge UI             │   │
│  │  ├─ EEG Visualization            │   │
│  │  ├─ Chat Interface               │   │
│  │  ├─ Model Selection              │   │
│  │  └─ P2P Controls                 │   │
│  └──────────────────────────────────┘   │
└────────────────┬────────────────────────┘
                 │ WebSocket (port 8766)
                 ▼
┌─────────────────────────────────────────┐
│      Brainscan Bridge (Rust)            │
│  ┌──────────────────────────────────┐   │
│  │  ├─ WebSocket Server             │   │
│  │  ├─ EEG Simulator (256Hz)        │   │
│  │  ├─ Query Cache (5min TTL)       │   │
│  │  ├─ P2P Connection Manager       │   │
│  │  └─ Hemisphere Orchestrator      │   │
│  └──────────────────────────────────┘   │
└────────────────┬────────────────────────┘
                 │ HTTP (port 1234)
                 ▼
┌─────────────────────────────────────────┐
│           LM Studio                     │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ Left Model   │  │ Right Model  │    │
│  │(Analytical)  │  │(Intuitive)   │    │
│  └──────────────┘  └──────────────┘    │
│  ┌──────────────────────────────────┐   │
│  │ Comparator (Synthesis)           │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## 📁 Repository Structure

```
brainscan/
├── eeg-spatializer.html          # Main web interface
├── brainscan-integrated.js       # Bridge integration & UI
├── brainscan-p2p.js              # Peer-to-peer functionality
├── brain_mesh_data.js            # 3D brain visualization data
├── rust-bridge/                  # Rust bridge source
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   ├── server.rs             # WebSocket server
│   │   ├── types.rs              # Data structures
│   │   ├── bridge.rs             # Main coordination
│   │   ├── lmstudio.rs           # LM Studio HTTP client
│   │   ├── orchestrator.rs       # EEG processing
│   │   ├── eeg_source.rs         # Simulated EEG generator
│   │   ├── spatialization.rs     # 3D spatialization
│   │   ├── query_cache.rs        # Response caching
│   │   ├── compute_metrics.rs    # Performance tracking
│   │   └── peer_connection.rs    # P2P networking
│   ├── Cargo.toml                # Rust dependencies
│   └── README.md                 # Bridge documentation
├── mcp-bicameral-server.js       # MCP server for Claude
├── bicameral-lmstudio-config.json # LM Studio configuration
├── mcp-bicameral-config.json     # MCP configuration
├── BICAMERAL_SETUP.md            # Setup guide
├── INTEGRATION_GUIDE.md          # Integration docs
├── PERFORMANCE_NOTES.md          # Optimization notes
├── LMSTUDIO_GUIDE.md             # LM Studio guide
├── RUST_BRIDGE_README.md         # Bridge details
└── README.md                     # This file
```

## 🔧 Configuration

### Hemispheric Settings

Edit model selection in the UI or modify `bicameral-lmstudio-config.json`:

```json
{
  "left_hemisphere": {
    "model_id": "qwen2.5-0.5b-instruct",
    "temperature": 0.7,
    "system_prompt": "You are the LEFT hemisphere..."
  },
  "right_hemisphere": {
    "model_id": "qwen3.5-0.8b-claude-4.6-opus-reasoning-distilled",
    "temperature": 0.8,
    "system_prompt": "You are the RIGHT hemisphere..."
  }
}
```

### Bridge Settings

Default configuration (change with CLI flags):
- **WebSocket Port**: 8766
- **LM Studio URL**: http://localhost:1234

```bash
./brainscan-bridge --port 8766 --lmstudio-url http://localhost:1234
```

## 🧪 Testing

### Test Bicameral Inference

1. Connect bridge and load models
2. Send query: "What is the meaning of life?"
3. Select **"Both"** hemisphere target
4. Observe:
   - Left response (analytical breakdown)
   - Right response (holistic perspective)
   - Combined synthesis

### Test P2P

1. Open two browser windows
2. Connect both to bridge
3. Note Peer IDs (e.g., `peer_12345...`)
4. Click **"Find Peers"** on both
5. Click **"Connect"** to establish link
6. Send chat message - appears in both windows

## 🤖 MCP Server (Claude Integration)

For advanced users, an MCP server enables Claude to control the bicameral system:

```bash
# Install dependencies
npm install

# Add to Claude Desktop config
# See mcp-bicameral-config.json
```

Then ask Claude:
> "Using bicameral inference, analyze the ethical implications of AI consciousness"

## 📝 Documentation

- **BICAMERAL_SETUP.md** - Complete setup instructions
- **INTEGRATION_GUIDE.md** - System integration details
- **PERFORMANCE_NOTES.md** - Optimization strategies
- **LMSTUDIO_GUIDE.md** - LM Studio configuration
- **RUST_BRIDGE_README.md** - Bridge architecture

## 🛠️ Troubleshooting

### Bridge Won't Connect
- Verify LM Studio is running on port 1234
- Check models are loaded
- Review bridge console for errors

### P2P Not Working
- Ensure both browsers connect to same bridge
- Check firewall settings (port 8766)
- Verify WebSocket connection in browser console

### Slow Responses
- Check cache statistics (click "Stats" button)
- Verify LM Studio GPU acceleration enabled
- Consider using smaller models for faster inference

## 🔄 Changelog

### v1.0.0 - Complete Integration
- ✅ Bicameral chat with comparator synthesis
- ✅ Real-time EEG visualization (256Hz, 8-channel)
- ✅ Query caching with 5-minute TTL
- ✅ Peer-to-peer brain sharing
- ✅ MCP server for Claude integration
- ✅ Dynamic model selection
- ✅ Coherence tracking

## 📜 License

MIT License - See LICENSE file

## 🙏 Credits

- Three.js for 3D visualization
- Tokio for async Rust runtime
- LM Studio for local LLM hosting
- WebRTC-rs for peer-to-peer networking

---

**Ready to explore bicameral AI consciousness? Start the bridge and open eeg-spatializer.html!**
