# Bicameral LM Studio Configuration

This directory contains configuration files and MCP (Model Context Protocol) server integration for optimizing bicameral (dual-hemisphere) inference with LM Studio.

## Overview

The bicameral approach uses two models simultaneously:
- **Left Hemisphere**: Analytical, detailed, logical reasoning
- **Right Hemisphere**: Intuitive, holistic, pattern recognition
- **Comparator**: Synthesizes both responses into a unified answer

## Files

### 1. `bicameral-lmstudio-config.json`
Complete LM Studio configuration including:
- Hemisphere model assignments
- Coherence analysis settings
- Data architecture optimization
- Inference parameters
- Bridge integration settings

### 2. `mcp-bicameral-server.js`
MCP server that exposes bicameral functionality to Claude and other MCP clients:
- Query individual hemispheres
- Query both hemispheres (bicameral mode)
- Get coherence metrics
- Configure models
- Control EEG streaming
- P2P brain sharing

### 3. `mcp-bicameral-config.json`
Claude Desktop configuration to register the MCP server.

### 4. `package.json`
Node.js dependencies for the MCP server.

## Setup

### Step 1: Install MCP Server Dependencies

```bash
cd C:\Users\punch\Documents\GitHub\brainscan
npm install
```

### Step 2: Configure LM Studio

1. Open LM Studio
2. Go to Settings → Developer → Configuration
3. Load `bicameral-lmstudio-config.json`
4. Load models specified in the config:
   - `qwen2.5-0.5b-instruct` (Left hemisphere)
   - `qwen3.5-0.8b-claude-4.6-opus-reasoning-distilled` (Right hemisphere)

### Step 3: Register MCP Server with Claude Desktop

1. Open Claude Desktop
2. Go to Settings → Developer → MCP Servers
3. Click "Edit Configuration"
4. Open `claude_desktop_config.json`
5. Add the bicameral server:

```json
{
  "mcpServers": {
    "brainscan-bicameral": {
      "command": "node",
      "args": [
        "C:\\Users\\punch\\Documents\\GitHub\\brainscan\\mcp-bicameral-server.js"
      ],
      "env": {
        "LMSTUDIO_URL": "http://localhost:1234",
        "BRIDGE_WS_URL": "ws://localhost:8766",
        "BICAMERAL_CONFIG_PATH": "C:\\Users\\punch\\Documents\\GitHub\\brainscan\\bicameral-lmstudio-config.json"
      }
    }
  }
}
```

Or simply use the provided `mcp-bicameral-config.json` file.

### Step 4: Start the Brainscan Bridge

```bash
cd rust-bridge
cargo run --release
```

### Step 5: Test the Integration

1. Open your browser to `eeg-spatializer.html`
2. Connect to the bridge
3. Load models in LM Studio
4. Start chatting with bicameral mode!

## MCP Tools Available

Once registered, Claude can use these tools:

### Query Tools
- `query_left_hemisphere` - Send query to analytical left hemisphere
- `query_right_hemisphere` - Send query to intuitive right hemisphere  
- `query_bicameral` - Query both hemispheres and get synthesized response
- `synthesize_responses` - Manually synthesize left and right responses

### Configuration Tools
- `configure_hemisphere_models` - Set which models to use
- `get_available_models` - List available LM Studio models

### Monitoring Tools
- `get_coherence_metrics` - Get current coherence measurements
- `get_cache_stats` - View query cache statistics
- `clear_cache` - Clear the query cache

### EEG Tools
- `start_eeg_stream` - Begin simulated EEG streaming
- `stop_eeg_stream` - Stop EEG streaming

### P2P Tools
- `connect_to_peer` - Connect to another Brainscan user
- `share_brain_data` - Share EEG data with connected peers

## Bicameral Optimization Features

### 1. Hemispheric Coherence Analysis
- Tracks coherence score between hemispheres
- Alerts if below 0.85 threshold
- Identifies dominant hemisphere

### 2. Balanced Data Architecture
- 50/50 train/test split across hemispheres
- Stratified sampling for balanced representation
- Grid search with Bayesian optimization

### 3. Architecture Tuning
- Left hemisphere: Deep filters, LSTM layers
- Right hemisphere: Moderate depth, pattern detection
- Dynamic adjustment based on dominant hemisphere

### 4. Parallel Processing
- Both hemispheres process simultaneously
- Results cached for 5 minutes
- Automatic synthesis by comparator model

### 5. Monitoring & Validation
- Track hemisphere contribution percentages
- Monitor coherence over time
- Dual-hemisphere validation

## Example Usage with Claude

Once configured, you can ask Claude:

```
"Analyze this problem using bicameral inference - I want both analytical and intuitive perspectives"
```

Claude will:
1. Call `query_bicameral` with your question
2. Wait for both hemisphere responses
3. Present the synthesized answer
4. Show coherence metrics

## Troubleshooting

### MCP Server Won't Connect
- Ensure Node.js is installed
- Check that `npm install` was run
- Verify paths in configuration are correct

### Bridge Connection Failed
- Ensure brainscan-bridge is running
- Check port 8766 is available
- Look at bridge console for errors

### LM Studio Not Responding
- Verify LM Studio is running on port 1234
- Check that models are loaded
- Review LM Studio logs

## Advanced Configuration

Edit `bicameral-lmstudio-config.json` to customize:

- **Models**: Change which models are used
- **Temperature**: Adjust creativity per hemisphere
- **Coherence Threshold**: Set minimum coherence (default 0.85)
- **Cache TTL**: Change caching duration
- **EEG Settings**: Adjust simulation parameters

## Integration Architecture

```
Claude Desktop
    ↓ (MCP Protocol)
MCP Bicameral Server
    ↓ (WebSocket)
Brainscan Bridge (Rust)
    ↓ (HTTP)
LM Studio (Models)
    ↓ (WebSocket)
Browser Visualization
```

## License

MIT License - See LICENSE file for details
