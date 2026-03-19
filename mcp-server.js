#!/usr/bin/env node
/**
 * MCP Bicameral Server for LM Studio
 * 
 * This server exposes Bicameral AI (dual-hemisphere) functionality via MCP protocol.
 * It connects to the rust-bridge WebSocket and forwards requests/responses.
 * 
 * Environment variables:
 *   LMSTUDIO_URL - LM Studio API URL (default: http://localhost:1234)
 *   BRIDGE_WS_URL - WebSocket URL for rust-bridge (default: ws://localhost:8766)
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const WebSocket = require('ws');

// Configuration from environment
const LMSTUDIO_URL = process.env.LMSTUDIO_URL || 'http://localhost:1234';
const BRIDGE_WS_URL = process.env.BRIDGE_WS_URL || 'ws://localhost:8766';

// WebSocket connection to rust-bridge
let ws = null;
let wsConnected = false;
let messageQueue = [];
let pendingResolvers = new Map();

// Connect to rust-bridge WebSocket
function connectWebSocket() {
  return new Promise((resolve, reject) => {
    console.error('[MCP] Connecting to rust-bridge at', BRIDGE_WS_URL);
    
    ws = new WebSocket(BRIDGE_WS_URL);
    
    ws.on('open', () => {
      console.error('[MCP] Connected to rust-bridge');
      wsConnected = true;
      resolve();
    });
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        console.error('[MCP] Received from bridge:', msg.type);
        
        // Handle responses
        if (msg.query_id && pendingResolvers.has(msg.query_id)) {
          const resolver = pendingResolvers.get(msg.query_id);
          pendingResolvers.delete(msg.query_id);
          resolver(msg);
        }
      } catch (err) {
        console.error('[MCP] Error parsing message:', err);
      }
    });
    
    ws.on('error', (err) => {
      console.error('[MCP] WebSocket error:', err);
      if (!wsConnected) {
        reject(err);
      }
    });
    
    ws.on('close', () => {
      console.error('[MCP] WebSocket closed, reconnecting...');
      wsConnected = false;
      setTimeout(connectWebSocket, 5000);
    });
  });
}

// Send message to rust-bridge and wait for response
function sendToBridge(message) {
  return new Promise((resolve, reject) => {
    if (!wsConnected || !ws) {
      reject(new Error('Not connected to rust-bridge'));
      return;
    }
    
    const queryId = message.query_id || `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    message.query_id = queryId;
    
    // Store resolver to handle response
    pendingResolvers.set(queryId, resolve);
    
    // Timeout after 60 seconds
    setTimeout(() => {
      if (pendingResolvers.has(queryId)) {
        pendingResolvers.delete(queryId);
        reject(new Error('Timeout waiting for response from rust-bridge'));
      }
    }, 60000);
    
    ws.send(JSON.stringify(message));
  });
}

// Create MCP server
const server = new Server(
  {
    name: 'bicameral-ai-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'bicameral_chat',
        description: 'Send a message to Bicameral AI (dual-hemisphere processing). Combines analytical (left) and creative (right) perspectives.',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The user message to process'
            },
            mode: {
              type: 'string',
              enum: ['standard', 'internal_analysis'],
              description: 'Processing mode: standard (general) or internal_analysis (technical/QAM16)',
              default: 'standard'
            },
            hemisphere: {
              type: 'string',
              enum: ['left', 'right', 'both'],
              description: 'Which hemisphere(s) to use: left (analytical), right (creative), or both (synthesized)',
              default: 'both'
            }
          },
          required: ['message']
        }
      },
      {
        name: 'set_models',
        description: 'Configure which models to use for left and right hemispheres',
        inputSchema: {
          type: 'object',
          properties: {
            left_model: {
              type: 'string',
              description: 'Model ID for left hemisphere (analytical)'
            },
            right_model: {
              type: 'string',
              description: 'Model ID for right hemisphere (creative)'
            },
            comparator_model: {
              type: 'string',
              description: 'Model ID for synthesizing both perspectives'
            }
          },
          required: ['left_model', 'right_model']
        }
      },
      {
        name: 'list_available_models',
        description: 'Get list of available models from LM Studio',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  console.error('[MCP] Tool call:', name, args);
  
  try {
    switch (name) {
      case 'bicameral_chat': {
        const { message, mode = 'standard', hemisphere = 'both' } = args;
        
        // Map hemisphere string to enum
        const hemisphereMap = {
          'left': 'Left',
          'right': 'Right',
          'both': 'Both'
        };
        
        // Send chat message to rust-bridge
        const response = await sendToBridge({
          type: 'chat_message',
          message,
          hemisphere: hemisphereMap[hemisphere] || 'Both',
          mode,
          max_tokens_left: 512,
          max_tokens_right: 512,
          max_tokens_comparator: 1024
        });
        
        return {
          content: [
            {
              type: 'text',
              text: response.message || 'No response received'
            }
          ]
        };
      }
      
      case 'set_models': {
        const { left_model, right_model, comparator_model } = args;
        
        // Set left model
        await sendToBridge({
          type: 'set_model',
          hemisphere: 'Left',
          model_id: left_model
        });
        
        // Set right model
        await sendToBridge({
          type: 'set_model',
          hemisphere: 'Right',
          model_id: right_model
        });
        
        // Set comparator model if provided
        if (comparator_model) {
          await sendToBridge({
            type: 'set_comparator_model',
            model_id: comparator_model
          });
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Models configured:\n- Left: ${left_model}\n- Right: ${right_model}\n- Comparator: ${comparator_model || 'default'}`
            }
          ]
        };
      }
      
      case 'list_available_models': {
        const response = await sendToBridge({
          type: 'get_models'
        });
        
        const models = response.models || [];
        const modelList = models.map(m => `- ${m.id}: ${m.name}`).join('\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Available models:\n${modelList || 'No models available'}`
            }
          ]
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error('[MCP] Error:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Start server
async function main() {
  try {
    // Connect to rust-bridge first
    await connectWebSocket();
    
    // Start MCP server on stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('[MCP] Bicameral AI MCP server running on stdio');
  } catch (err) {
    console.error('[MCP] Failed to start:', err);
    process.exit(1);
  }
}

main();
