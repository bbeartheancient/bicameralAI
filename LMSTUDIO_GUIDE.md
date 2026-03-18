# LMStudio Integration Quick Start

## Overview

This integration allows you to use LMStudio's local LLMs as the AI inference layer for your EEG signals. Based on the tunnel diode coherence (Z→0), signals are routed to different models:

- **High Coherence (≥0.7)**: Model A - Pattern recognition
- **Low Coherence (<0.3)**: Model B - Anomaly detection  
- **Medium Coherence (0.3-0.7)**: Both models - Ensemble fusion

## Prerequisites

1. **Python 3.8+** with pip
2. **LMStudio** installed from https://lmstudio.ai/
3. **A local LLM model** loaded in LMStudio

## Installation

```bash
# Install required packages
pip install websockets aiohttp numpy
```

## Step-by-Step Setup

### Step 1: Start LMStudio Server

1. Open LMStudio application
2. **Load a model** (e.g., Llama 3.1, Qwen, etc.)
3. Go to **Settings** → **Developer**
4. Enable **"Local Inference Server"**
5. Server will start on `http://localhost:1234`

**Verify it's working:**
```bash
curl http://localhost:1234/v1/models
```

### Step 2: Start EEG Bridge

```bash
# With simulated EEG data
python eeg_bridge_server.py

# Or with hardware EEG
python eeg_bridge_server.py --serial COM3 --baud 115200
```

**Output:**
```
[Server] Starting WebSocket server on ws://localhost:8765
[Mode] Using simulated EEG data
```

### Step 3: Start LMStudio Bridge

In a **new terminal**:

```bash
python lmstudio_bridge.py
```

**Output:**
```
======================================================================
LMStudio EEG Bridge Pipeline
======================================================================
EEG Source: ws://localhost:8765
LMStudio: http://localhost:1234
Inference Output: ws://localhost:8766
======================================================================
[Bridge] Initializing LMStudio connection...
[LMStudio] Connected to http://localhost:1234
[LMStudio] Available models: ['local-model']
[Bridge] ✓ Connected to LMStudio
[Server] Starting inference server on port 8766
[Server] Inference server ready
[EEG] Connecting to ws://localhost:8765...
[EEG] ✓ Connected to EEG Bridge
```

### Step 4: Open Browser Visualizer

1. Open `eeg-spatializer.html` in your browser
2. **Connect EEG WebSocket**:
   - Click "WebSocket" button
   - Enter: `localhost:8765`
   - Click "Go"
3. **Connect AI Inference**:
   - Look for "AI INFERENCE" section in sidebar
   - Click "Connect" button
   - Should show green indicator

## Usage Example

Once running, you'll see output like:

```
[Frame 256] Model: LMStudio-Model-A-Pattern    | Class: focused         | Conf: 0.87 | Coherence: 0.78 ↑ | Latency: 245ms
[Frame 512] Model: LMStudio-Model-B-Anomaly    | Class: normal          | Conf: 0.92 | Coherence: 0.22 ↓ | Latency: 198ms
[Frame 768] Model: LMStudio-Ensemble           | Class: focused         | Conf: 0.65 | Coherence: 0.45 → | Latency: 523ms
```

## Customization

### Use Different Models

```bash
# Use specific models for each task
python lmstudio_bridge.py --model-a llama-3.1 --model-b qwen2.5
```

### Change Ports

```bash
# If ports are already in use
python eeg_bridge_server.py --port 8767
python lmstudio_bridge.py --eeg-url ws://localhost:8767 --port 8768
```

### Windows Batch File

For easy startup, use the provided batch file:

```bash
start_lmstudio_pipeline.bat
```

This opens all components in separate windows automatically.

## Troubleshooting

### "Connection refused" to LMStudio

**Problem:** Bridge can't connect to LMStudio

**Solution:**
1. Open LMStudio
2. Check Settings → Developer → Local Inference Server is enabled
3. Verify server is running on port 1234:
   ```bash
   curl http://localhost:1234/v1/models
   ```

### High Latency (>1000ms)

**Problem:** LLM responses are slow

**Solutions:**
1. Use a smaller/faster model in LMStudio
2. Increase context window in LMStudio settings
3. Enable GPU acceleration in LMStudio
4. Reduce `--max-tokens` in `lmstudio_integration.py`

### No 3D Visualization

**Problem:** No attention points showing on brain

**Solution:**
1. Check browser console for errors (F12)
2. Verify WebSocket connections are active
3. Click "Connect" in AI INFERENCE section
4. Check `inference_viz.js` is included in HTML

### Models Not Found

**Problem:** LMStudio reports no models available

**Solution:**
1. Load a model in LMStudio first
2. Check model is fully loaded (green checkmark)
3. Restart LMStudio bridge after loading model

## Architecture Details

### Data Flow

```
EEG Frame (8 channels)
    ↓
Signal Processing (Python)
    - Octonion matrix transform
    - Ambisonic FOA components
    - Tunnel diode coherence
    ↓
Coherence Router
    - HIGH → LMStudio Model A (Pattern)
    - LOW → LMStudio Model B (Anomaly)
    - MEDIUM → Both + Fusion
    ↓
LMStudio API (HTTP)
    - POST /v1/chat/completions
    - 200-500ms latency
    ↓
Inference Result (JSON)
    - Classification
    - Attention weights
    - Spatial coordinates
    ↓
WebSocket Broadcast (Port 8766)
    ↓
3D Spatializer (Browser)
    - Attention point markers
    - Brain mesh overlay
    - Real-time updates
```

### Prompt Templates

**Model A (Pattern Recognition):**
```
Analyze EEG features and classify brain state:
- Octonion Basis: {octonion}
- Ambisonic FOA: W={w:.2f}, X={x:.2f}, Y={y:.2f}, Z={z:.2f}
- Coherence: {coherence:.2f}
- Spatial: mag={spatial_mag:.2f}, phase={phase:.2f}

Return: STATE, CONFIDENCE, EXPLANATION, ATTENTION
```

**Model B (Anomaly Detection):**
```
Detect anomalies in EEG signal:
- Channels: {channels}
- Impedance: {impedance:.1f}Ω
- Coherence: {coherence:.2f}

Return: ANOMALY_LEVEL, SEVERITY, AFFECTED, CAUSE
```

## Advanced Configuration

### Modifying Prompts

Edit `lmstudio_integration.py`:

```python
# In LMStudioModelA.__init__:
self.prompt_template = """Your custom prompt here...
Signal Features: {octonion}
..."""
```

### Adjusting Coherence Thresholds

Edit `lmstudio_bridge.py`:

```python
self.high_threshold = 0.7  # Adjust for Model A
self.low_threshold = 0.3     # Adjust for Model B
```

### Custom Model Routing

Add custom logic in `lmstudio_bridge.py`:

```python
def _get_coherence_state(self, coherence: float):
    if coherence > 0.8:
        return CoherenceState.HIGH
    elif coherence < 0.2:
        return CoherenceState.LOW
    return CoherenceState.MEDIUM
```

## Performance Metrics

Typical performance on modern hardware:

| Component | Latency | CPU Usage |
|-----------|---------|-----------|
| EEG Bridge | <1ms | <5% |
| Signal Processing | <5ms | <10% |
| LMStudio (7B model) | 200-500ms | 30-60% |
| 3D Visualization | 16ms (60fps) | <15% |

**Total End-to-End:** 250-600ms per frame

## Next Steps

1. **Experiment with different models** in LMStudio
2. **Adjust coherence thresholds** for your specific signals
3. **Customize prompt templates** for your use case
4. **Add more models** for specialized tasks
5. **Implement streaming** for faster first-token response

## Support

For issues with:
- **EEG Bridge**: Check `eeg_bridge_server.py`
- **LMStudio API**: Check LMStudio logs (Help → Developer Logs)
- **3D Visualization**: Check browser console (F12)
- **Integration**: Check `lmstudio_bridge.py` output
