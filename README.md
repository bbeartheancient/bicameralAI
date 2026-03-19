# Brainscan Matrix - Bicameral AI Signal Processor

A **high-performance bicameral AI system** that processes network signals through dual-hemisphere AI models with First Order Ambisonic (FOA) spatialization.

## 📝 Recent Changes (March 2025)

- **Dual Mode Support**: Added Standard Mode (general-purpose AI) and Internal Systems Analysis Mode (technical QAM/FOA focus)
- **Smart Model Selection**: Auto-clears invalid cached models when models change in LM Studio
- **LM Studio Integration**: Token counts now use LM Studio server settings (set to 0 for default)
- **Enhanced Prompts**: Standard mode uses generic AI prompts without technical domain restrictions
- **Debug Logging**: Added comprehensive logging for mode tracking and prompt selection
- **UI Improvements**: Renamed "Internal Analysis Mode" to "Internal Systems Analysis" with clearer button behavior

## 🧠 What It Does

Brainscan Matrix creates a **digital bicameral processing system** featuring:

- **256x256 Matrix Visualization**: Real-time signal pattern visualization
- **Left Hemisphere** (Analytical): Logical, sequential processing of QAM signals
- **Right Hemisphere** (Intuitive): Holistic, pattern-based signal analysis
- **Comparator**: Synthesizes both perspectives into unified responses
- **QAM16 Processing**: 16-channel constellation signal processing
- **FOA Spatialization**: First Order Ambisonic audio spatialization (W, X, Y, Z)
- **Real-time Optimization**: Adaptive thresholding, signal fusion, channel reduction

## 🚀 Quick Start

### Prerequisites

- **LM Studio** running on port 1234 with models loaded
- **Rust** toolchain installed (for building the bridge)
- **Modern web browser** (Chrome/Firefox/Edge)

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

Open `brainscan-matrix.html` in your browser:

```bash
# Using Python's built-in server
python -m http.server 8080
# Then visit http://localhost:8080/brainscan-matrix.html
```

Or just double-click the file.

## 🎮 How to Use

### 1. Connect to the Bridge

The system auto-connects on page load. The status indicator shows connection state.

### 2. Select Models

Choose models for each hemisphere from the sidebar:
- **Left Hemisphere**: Analytical model (processes LFU/LBD quadrants Q0-Q7)
- **Right Hemisphere**: Intuitive model (processes RBU/RFD quadrants Q8-Q15)
- **Comparator**: Auto-selected for synthesis

Click **"Set Models"** to confirm selection.

### 3. Chat with Bicameral AI

1. Type a message in the chat box at the bottom
2. The system automatically routes to both hemispheres
3. The comparator synthesizes both responses into a unified answer

**Processing Flow:**
- Left hemisphere responds (analytical perspective)
- Right hemisphere responds (intuitive perspective)
- Comparator synthesizes both into unified, coherent answer

### 4. Monitor Signal Processing

**Real-time Metrics:**
- **FPS**: Frame rate of matrix visualization
- **Packets**: Network message count
- **MPS**: Messages per second
- **Coherence**: System coherence level (0.0-1.0)
- **Z-Vector**: Impedance tracking

**FOA Matrix (4x4)**:
- Displays W, X, Y, Z ambisonic coefficients
- Real-time updates from QAM signal processing
- Color-coded by quadrant (LFU, LBD, RBU, RFD)

## 📊 Features

### Core Features
- ✅ **Bicameral Processing**: Dual-hemisphere AI with synthesis
- ✅ **QAM16 Signal Processing**: 16-channel constellation analysis
- ✅ **FOA Spatialization**: First Order Ambisonic (W, X, Y, Z)
- ✅ **256x256 Matrix**: Real-time signal visualization
- ✅ **Sliding Window**: 32-frame temporal pattern recognition
- ✅ **Adaptive Thresholding**: Dynamic noise filtering
- ✅ **Signal Fusion**: Correlated channel pairing
- ✅ **Channel Reduction**: 16→10 channel optimization
- ✅ **Query Caching**: Response caching with TTL
- ✅ **Tunnel Diode Simulation**: Z→0 coherence behavior

### Advanced Features
- ✅ **3D Brain Mesh**: Center visualization with particle rings
- ✅ **Z-Vector Boundary**: Coherence threshold monitoring
- ✅ **Performance Testing**: Automated benchmark suite
- ✅ **Tuning Profiles**: Balanced/High Speed/Low Latency modes
- ✅ **Context Control**: Toggle domain restrictions
- ✅ **SNR Tracking**: Signal-to-noise ratio monitoring
- ✅ **Cross-Channel Attention**: Inter-quadrant correlation
- ✅ **Bilateral Loss Balancing**: Dynamic hemisphere weighting

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│          Browser (brainscan-matrix.html) │
│  ┌──────────────────────────────────┐   │
│  │  Matrix Visualization            │   │
│  │  ├─ 256x256 QAM Signal Matrix     │   │
│  │  ├─ 3D Brain Mesh                 │   │
│  │  ├─ Particle Rings               │   │
│  │  └─ FOA Matrix Display           │   │
│  ├──────────────────────────────────┤   │
│  │  Chat Interface                   │   │
│  │  └─ Bicameral AI Communication    │   │
│  └──────────────────────────────────┘   │
└────────────────┬────────────────────────┘
                 │ WebSocket (port 8766)
                 ▼
┌─────────────────────────────────────────┐
│      Brainscan Bridge (Rust)            │
│  ├─ WebSocket Server                    │
│  ├─ QAM Signal Processing               │
│  ├─ FOA Spatialization (W, X, Y, Z)     │
│  ├─ Sliding Window Analysis             │
│  ├─ Adaptive Thresholding              │
│  ├─ Signal Fusion                        │
│  ├─ Query Cache                          │
│  └─ Hemisphere Orchestration            │
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
├── brainscan-matrix.html       # Main web interface
├── brainscan-matrix.js         # Core application logic
├── brain_mesh_data.js          # 3D brain visualization
├── rust-bridge/                # Rust bridge source
│   ├── src/
│   │   ├── server.rs           # WebSocket server
│   │   ├── types.rs            # Data structures
│   │   ├── bridge.rs             # Main coordination
│   │   ├── lmstudio.rs         # LM Studio client
│   │   ├── orchestrator.rs     # QAM processing
│   │   ├── qam_source.rs         # Signal generator
│   │   ├── compute_metrics.rs  # Performance tracking
│   │   └── lib.rs
│   └── Cargo.toml              # Rust dependencies
└── README.md                   # This file
```

## 🔧 Configuration

### QAM Signal Processing

Default configuration optimized for network signal analysis:

```javascript
// Sliding Window
windowSize: 32        // 32-frame temporal window
hopDistance: 2        // Frame advancement

// Channel Reduction
targetChannels: 10    // Reduce from 16 to 10

// Frequency Band Selection
priorityBands: {
    center: { channels: [0-4], weight: 1.0 },
    mid: { channels: [5-9], weight: 0.8 },
    outer: { channels: [10-15], weight: 0.6 }
}

// Fusion Weights
fusionWeights: {
    LFU: 0.6,    // Left Front Up
    LBD: 0.4,    // Left Back Down
    RBU: 0.5,    // Right Back Up
    RFD: 0.5     // Right Front Down
}
```

### Tuning Profiles

Select from the UI:

- **Balanced** (Recommended): Window=40, Channels=10, Alpha=0.6
- **High Speed**: Window=32, Channels=10, Alpha=0.5
- **Low Latency**: Window=32, Channels=8, Alpha=0.6

### Context Control

**Internal Analysis Mode** (Default): AI restricted to QAM16/FOA domain
**Standard Mode**: AI unrestricted (guardrails disabled)

Toggle via the **Context Control** panel in the sidebar.

## 🎨 UI Theme

**Color Palette** (Orange/Red):
- Primary: `#fa0` (Orange)
- Accent: `#e60003` (Red)
- Background: `#0a0a0a` (Dark)
- Success: `#0f0` (Green - for status indicators)

**Visual Elements**:
- Active buttons: Orange background, black text
- Inactive buttons: Black background, orange text
- Matrix: Orange/red particle rings
- Brain mesh: Orange wireframe
- Status indicators: Color-coded by state

## 📈 Performance

**Target Metrics**:
- Frame Rate: 60 FPS
- Processing Latency: <16ms per frame
- Channel Reduction: 37.5% (16→10)
- SNR Tracking: Real-time per channel

**Optimizations**:
- Sliding window pattern recognition
- Adaptive thresholding with noise estimation
- Signal fusion for correlated channels
- Channel ordering (LFU→LBD→RBU→RFD)
- Bicameral cross-channel attention

## 🛠️ Troubleshooting

### Bridge won't connect
- Ensure LM Studio is running on port 1234
- Check firewall settings for port 8766
- Verify Rust bridge is compiled: `cargo build --release`

### Models not loading
- Check model names in LM Studio match exactly
- Ensure models are loaded before selecting
- Try refreshing the browser

### Low performance
- Enable **High Speed** tuning profile
- Reduce matrix visualization quality
- Check browser console for errors

## 📜 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 🙏 Acknowledgments

- LM Studio for local LLM hosting
- Rust for high-performance bridge
- FOA spatialization concepts from ambisonic audio research
- Bicameral AI architecture inspired by cognitive science research
- UI elements from https://github.com/bagusindrayana/ews-concept-new
- 3d brain model generated using diffusion model from https://github.com/NVIDIA-Medtech/NV-Generate-CTMR

---

**Built with ❤️ for signal processing and AI exploration**
