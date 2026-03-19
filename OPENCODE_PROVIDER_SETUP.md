# OpenCode Desktop - Bicameral AI Provider Setup

## Overview

This guide shows you how to add **Bicameral AI** as a custom model provider in OpenCode Desktop. Once installed, it appears as model options in the dropdown menu.

## What You Get

✅ Bicameral AI appears as **two model options** in the dropdown:
   - "Bicameral AI (Standard Mode)" - Creative/general responses
   - "Bicameral AI (Technical Mode)" - Technical QAM/FOA analysis
✅ Uses both Left and Right hemispheres automatically  
✅ No code changes to OpenCode Desktop required  
✅ Works with OpenCode Desktop v1.2.26 on Windows

## Prerequisites

1. **Bicameral AI Bridge running** (rust-bridge WebSocket on port 8766)
2. **LM Studio** with models loaded
3. **OpenCode Desktop v1.2.26** installed
4. **Node.js** installed (for REST bridge)

## Architecture

```
OpenCode Desktop → REST API (port 9002) → WebSocket (port 8766) → Bicameral AI
```

OpenCode Desktop requires OpenAI-compatible REST API. We provide a bridge that:
1. Exposes REST endpoint on port 9002
2. Converts REST requests to WebSocket messages
3. Returns OpenAI-formatted responses

## Quick Start (5 minutes)

### Step 1: Start All Services

**Terminal 1 - Start Bicameral AI Bridge:**
```bash
cd rust-bridge
cargo run
```

**Terminal 2 - Start LM Studio**
- Open LM Studio
- Load your models
- Ensure server is running on port 1234

**Terminal 3 - Start REST Bridge:**
```bash
cd C:\Users\punch\Documents\GitHub\bicameralAI
node rest-bridge.js
```

You should see:
```
✓ Bicameral REST Bridge running on http://localhost:9002/v1
✓ Bridging to WebSocket: ws://localhost:8766
```

### Step 2: Configure OpenCode Desktop

**Option A: Using `/connect` Command (Easiest)**

1. **In OpenCode Desktop**, type:
   ```
   /connect
   ```
2. **Scroll down** and select **"Other"**
3. **Enter provider ID:**
   ```
   bicameral
   ```
4. **Enter API key** (anything works, not actually used):
   ```
   sk-bicameral-local
   ```

**Option B: Manual Configuration**

Create `opencode.json` in your project directory:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "bicameral": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Bicameral AI",
      "options": {
        "baseURL": "http://localhost:9002/v1"
      },
      "models": {
        "bicameral-standard": {
          "name": "Bicameral AI (Standard Mode)",
          "limit": {
            "context": 128000,
            "output": 8192
          }
        },
        "bicameral-technical": {
          "name": "Bicameral AI (Technical Mode)",
          "limit": {
            "context": 128000,
            "output": 8192
          }
        }
      }
    }
  }
}
```

### Step 3: Test It

1. **In OpenCode Desktop**, type:
   ```
   /models
   ```
2. **Select:** "Bicameral AI (Standard Mode)" or "Bicameral AI (Technical Mode)"
3. **Send a test message:**
   ```
   imagine a purple cat
   ```

## Detailed Setup

### Understanding the Stack

```
┌─────────────────┐
│ OpenCode Desktop│ (Your IDE)
└────────┬────────┘
         │ HTTP POST /v1/chat/completions
         ▼
┌─────────────────┐
│  REST Bridge    │ (Node.js on port 9002)
│  rest-bridge.js │
└────────┬────────┘
         │ WebSocket
         ▼
┌─────────────────┐
│ Rust Bridge     │ (WebSocket on port 8766)
│ rust-bridge     │
└────────┬────────┘
         │ HTTP /v1/chat/completions
         ▼
┌─────────────────┐
│   LM Studio     │ (Port 1234)
│   Models        │
└─────────────────┘
```

### Installation Options

#### Option 1: Direct Node.js (Development)

```bash
# Navigate to bicameralAI folder
cd C:\Users\punch\Documents\GitHub\bicameralAI

# Start the REST bridge
node rest-bridge.js

# Keep this terminal open while using OpenCode Desktop
```

#### Option 2: PM2 Service (Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start as service
cd C:\Users\punch\Documents\GitHub\bicameralAI
pm2 start rest-bridge.js --name bicameral-rest-bridge

# Save PM2 config
pm2 save
pm2 startup

# Check status anytime
pm2 status
pm2 logs bicameral-rest-bridge
```

### Model Selection

**Bicameral AI (Standard Mode)**
- Uses `mode: 'standard'`
- Creative, general-purpose responses
- Good for: Brainstorming, creative writing, general questions
- Example: "imagine a purple cat"

**Bicameral AI (Technical Mode)**
- Uses `mode: 'internal_analysis'`
- Technical QAM16/FOA domain focus
- Good for: Signal processing analysis, system optimization
- Example: "analyze QAM16 constellation patterns"

### Troubleshooting

**"Connection refused" on port 9002**
- REST bridge not running
- Solution: `node rest-bridge.js`

**"Connection refused" on port 8766**
- Bicameral rust-bridge not running
- Solution: `cd rust-bridge && cargo run`

**"No models available"**
- LM Studio not running or no models loaded
- Solution: Open LM Studio and load models

**"Request timeout"**
- Response too long for default timeout
- Solution: Reduce complexity or use smaller prompts

**Model dropdown doesn't show Bicameral AI**
- opencode.json not in correct location
- Solution: Place in project directory or `%APPDATA%\OpenCode Desktop\`

**"Module not found" errors**
- REST bridge requires Node.js
- Solution: Install Node.js from https://nodejs.org

### Advanced Configuration

#### Custom Token Limits

Edit `opencode.json`:

```json
{
  "provider": {
    "bicameral": {
      "models": {
        "bicameral-standard": {
          "name": "Bicameral AI (Standard)",
          "limit": {
            "context": 128000,
            "output": 4096  // Reduce if responses too slow
          }
        }
      }
    }
  }
}
```

#### Multiple Projects

Each project can have its own `opencode.json`:

```
ProjectA/
├── src/
└── opencode.json  (uses bicameral-standard)

ProjectB/
├── src/
└── opencode.json  (uses bicameral-technical)
```

#### Environment Variables

Set default mode via environment:

```bash
# Windows Command Prompt
set BICAMERAL_MODE=standard
opencode

# Windows PowerShell
$env:BICAMERAL_MODE="technical"
opencode
```

### API Endpoints

The REST bridge exposes:

- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Send chat completion

Example direct API call:

```bash
curl http://localhost:9002/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bicameral-standard",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

### File Reference

| File | Purpose | Required |
|------|---------|----------|
| `rest-bridge.js` | REST-to-WebSocket bridge | ✅ Yes |
| `opencode.json` | Provider configuration | ✅ Yes |
| `opencode-api.js` | WebSocket client library | ❌ Not needed for OpenCode Desktop |
| `bicameral-provider.js` | Legacy provider (not used) | ❌ No |

### Testing

Run the test script:

```bash
cd C:\Users\punch\Documents\GitHub\bicameralAI
node test-rest-api.js
```

This tests:
1. Connection to REST bridge
2. Model listing
3. Chat completion
4. Both standard and technical modes

### Next Steps

1. ✅ Start all three services (bridge, LM Studio, REST bridge)
2. ✅ Configure OpenCode Desktop with `/connect` or opencode.json
3. ✅ Select Bicameral AI model
4. ✅ Test with sample queries
5. 🎯 Use in daily workflows!

## Support

**Bridge logs:**
```bash
cd rust-bridge
RUST_LOG=debug cargo run
```

**REST bridge logs:**
```bash
pm2 logs bicameral-rest-bridge
# or
node rest-bridge.js  # (shows console output)
```

**Check all services:**
- Port 1234: LM Studio
- Port 8766: Bicameral rust-bridge (WebSocket)  
- Port 9002: REST bridge (OpenCode Desktop connects here)
