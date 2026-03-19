# OpenCode Desktop - Bicameral AI Provider Setup

## Overview

This guide shows you how to add **Bicameral AI** as a custom model provider in OpenCode Desktop. Once installed, it appears as a single model option in the dropdown menu, alongside other AI models.

## What You Get

✅ Bicameral AI appears as **"Bicameral AI"** in the model dropdown  
✅ Uses both Left and Right hemispheres automatically  
✅ Toggle between Standard Mode (creative) and Internal Analysis Mode (technical)  
✅ No code changes to OpenCode Desktop required  
✅ Works with OpenCode Desktop v1.2.26 on Windows

## Prerequisites

1. **Bicameral AI Bridge running** (rust-bridge on port 9001)
2. **LM Studio** with models loaded
3. **OpenCode Desktop v1.2.26** installed

## Installation Steps

### Step 1: Locate Your OpenCode Desktop Config Folder

**Windows:**
```
%APPDATA%\OpenCode Desktop\
```
Or manually:
```
C:\Users\[YourUsername]\AppData\Roaming\OpenCode Desktop\
```

### Step 2: Copy Required Files

Copy these **3 files** from the bicameralAI repo to your OpenCode Desktop config folder:

1. `opencode-api.js` - Core API client
2. `bicameral-provider.js` - Model provider wrapper  
3. `providers.json` - Provider registration (optional, see Step 3)

**Copy to:**
```
%APPDATA%\OpenCode Desktop\
├── opencode-api.js
├── bicameral-provider.js
└── providers.json (optional)
```

### Step 3: Register the Provider (Choose ONE method)

#### Method A: Using OpenCode Desktop UI (Recommended)

1. **Open OpenCode Desktop**
2. **Go to Settings** (gear icon or File → Settings)
3. **Navigate to:** Model Providers or AI Settings
4. **Click:** "Add Provider" or "Custom Provider"
5. **Select:** "Local File" or "Custom Module"
6. **Browse to:** `%APPDATA%\OpenCode Desktop\bicameral-provider.js`
7. **Set Display Name:** `Bicameral AI`
8. **Configuration:**
   ```json
   {
     "bridgeUrl": "ws://localhost:9001",
     "defaultMode": "standard"
   }
   ```
9. **Click:** Save or Add Provider

#### Method B: Manual Configuration (If UI method not available)

1. **Open** your OpenCode Desktop config file (usually `settings.json` or `config.json`)
2. **Add this section:**
   ```json
   {
     "modelProviders": [
       {
         "name": "Bicameral AI",
         "type": "custom",
         "path": "C:\\Users\\[Username]\\AppData\\Roaming\\OpenCode Desktop\\bicameral-provider.js",
         "config": {
           "bridgeUrl": "ws://localhost:9001",
           "defaultMode": "standard"
         }
       }
     ]
   }
   ```
3. **Save** the file
4. **Restart** OpenCode Desktop

#### Method C: Using providers.json

If you copied the `providers.json` file in Step 2, OpenCode Desktop may auto-detect it on restart. If not, use Method A or B.

### Step 4: Verify Installation

1. **Restart** OpenCode Desktop completely
2. **Open a new chat**
3. **Look at the model dropdown** (usually top-right or in chat settings)
4. **You should see:** "Bicameral AI" as an option
5. **Select it** and send a test message like "imagine a purple cat"

## Configuration Options

### providers.json Explained

```json
{
  "name": "Bicameral AI",           // Display name in dropdown
  "type": "custom",                  // Required for custom providers
  "module": "./bicameral-provider.js", // Path to provider file
  "config": {
    "bridgeUrl": "ws://localhost:9001",  // WebSocket URL
    "defaultMode": "standard",             // "standard" or "internal_analysis"
    "timeout": 60000                       // Request timeout in ms
  }
}
```

### Modes

**Standard Mode** (`"defaultMode": "standard"`):
- General-purpose AI responses
- Creative, unrestricted answers
- Good for: Brainstorming, creative writing, general questions

**Internal Analysis Mode** (`"defaultMode": "internal_analysis"`):
- Technical QAM16/FOA domain focus
- Restricted to signal processing topics
- Good for: Technical analysis, system optimization, architecture discussions

### Switching Modes

If OpenCode Desktop supports provider-specific settings:
1. Go to **Settings → Model Providers**
2. Find **Bicameral AI**
3. Edit configuration and change `defaultMode`
4. Save and restart

Or create **two provider instances**:
```json
{
  "providers": [
    {
      "name": "Bicameral AI (Standard)",
      "type": "custom",
      "module": "./bicameral-provider.js",
      "config": { "defaultMode": "standard" }
    },
    {
      "name": "Bicameral AI (Technical)",
      "type": "custom",
      "module": "./bicameral-provider.js",
      "config": { "defaultMode": "internal_analysis" }
    }
  ]
}
```

## Troubleshooting

### "Provider not found" or "Module not found"

**Check:**
- All 3 files copied to correct folder
- File paths in configuration are correct
- Use full path instead of relative path
- Example: `C:\Users\punch\AppData\Roaming\OpenCode Desktop\bicameral-provider.js`

### "Connection refused" or "WebSocket error"

**Check:**
- Bicameral AI bridge is running: `cd rust-bridge && cargo run`
- Port 9001 is not blocked by firewall
- Bridge URL is `ws://localhost:9001` (not http://)

### "Model not found" errors

**Check:**
- LM Studio is running with models loaded
- Models are available at `http://localhost:1234/v1/models`
- Model names match exactly

### Responses are truncated

**Fix:** The provider uses 8192 tokens for comparator by default. If still truncated:
- Check LM Studio max context length settings
- Increase `max_tokens_comparator` in provider config
- Use smaller/more focused prompts

### "Cannot find module 'opencode-api.js'"

**Fix:** Ensure both files are in the same folder:
```
OpenCode Desktop Folder/
├── bicameral-provider.js
└── opencode-api.js  ← Must be here too!
```

## Advanced: Using with Projects

### Per-Project Configuration

If OpenCode Desktop supports project-specific providers:

1. **In your project folder**, create `.opencode/providers.json`:
   ```json
   {
     "providers": [
       {
         "name": "Bicameral AI",
         "type": "custom",
         "module": "../bicameral-provider.js"
       }
     ]
   }
   ```

2. **Or use workspace settings** in OpenCode Desktop

## Testing the Setup

**Quick test commands:**

```javascript
// Test 1: Creative mode
"imagine a purple cat with magical powers"

// Test 2: Technical mode (if using internal_analysis)
"analyze the QAM16 constellation patterns for optimization"

// Test 3: Complex task
"create an API layer to interface with opencode"

// Test 4: Left hemisphere (analytical)
This is handled automatically by the provider
```

## File Summary

| File | Purpose | Location |
|------|---------|----------|
| `opencode-api.js` | Core WebSocket API client | OpenCode Desktop config folder |
| `bicameral-provider.js` | Provider wrapper for OpenCode | OpenCode Desktop config folder |
| `providers.json` | Provider registration (optional) | OpenCode Desktop config folder |

## Next Steps

1. ✅ Install provider files
2. ✅ Register in OpenCode Desktop settings
3. ✅ Select "Bicameral AI" from model dropdown
4. ✅ Test with sample queries
5. 🎯 Configure project-specific settings as needed

**Need help?** Check the bridge logs with `RUST_LOG=debug cargo run` in rust-bridge folder.
