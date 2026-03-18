#!/usr/bin/env node

/**
 * Brainscan Bicameral MCP Server
 * 
 * Model Context Protocol server for managing bicameral (dual-hemisphere) inference
 * Integrates with LM Studio and the Brainscan Bridge
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Load configuration
const configPath = process.env.BICAMERAL_CONFIG_PATH || './bicameral-lmstudio-config.json';
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.error(`[Bicameral MCP] Loaded config from ${configPath}`);
} catch (err) {
  console.error(`[Bicameral MCP] Warning: Could not load config from ${configPath}:`, err.message);
}

// Bridge WebSocket connection
let bridgeSocket = null;
let bridgeConnected = false;

function connectToBridge() {
  const wsUrl = process.env.BRIDGE_WS_URL || 'ws://localhost:8766';
  try {
    bridgeSocket = new WebSocket(wsUrl);
    
    bridgeSocket.on('open', () => {
      bridgeConnected = true;
      console.error(`[Bicameral MCP] Connected to Brainscan Bridge at ${wsUrl}`);
    });
    
    bridgeSocket.on('close', () => {
      bridgeConnected = false;
      console.error('[Bicameral MCP] Disconnected from Bridge');
    });
    
    bridgeSocket.on('error', (err) => {
      console.error('[Bicameral MCP] Bridge connection error:', err.message);
    });
  } catch (err) {
    console.error('[Bicameral MCP] Failed to connect to Bridge:', err.message);
  }
}

connectToBridge();

// Create MCP Server
const server = new Server(
  {
    name: 'brainscan-bicameral',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_left_hemisphere',
        description: 'Send a query to the analytical left hemisphere model',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'The query message' },
            include_eeg_context: { type: 'boolean', description: 'Include current EEG state in query' }
          },
          required: ['message']
        }
      },
      {
        name: 'query_right_hemisphere',
        description: 'Send a query to the intuitive right hemisphere model',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'The query message' },
            include_eeg_context: { type: 'boolean', description: 'Include current EEG state in query' }
          },
          required: ['message']
        }
      },
      {
        name: 'query_bicameral',
        description: 'Send a query to both hemispheres and get synthesized response',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'The query message' },
            include_eeg_context: { type: 'boolean', description: 'Include current EEG state' }
          },
          required: ['message']
        }
      },
      {
        name: 'synthesize_responses',
        description: 'Synthesize responses from left and right hemispheres into unified answer',
        inputSchema: {
          type: 'object',
          properties: {
            left_response: { type: 'string' },
            right_response: { type: 'string' },
            original_query: { type: 'string' }
          },
          required: ['left_response', 'right_response', 'original_query']
        }
      },
      {
        name: 'get_coherence_metrics',
        description: 'Get current hemispheric coherence metrics',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'configure_hemisphere_models',
        description: 'Configure which models to use for each hemisphere',
        inputSchema: {
          type: 'object',
          properties: {
            left_model: { type: 'string', description: 'Model ID for left hemisphere' },
            right_model: { type: 'string', description: 'Model ID for right hemisphere' },
            comparator_model: { type: 'string', description: 'Model ID for synthesis' }
          }
        }
      },
      {
        name: 'start_eeg_stream',
        description: 'Start the simulated EEG data stream',
        inputSchema: {
          type: 'object',
          properties: {
            sample_rate: { type: 'number', default: 256 }
          }
        }
      },
      {
        name: 'stop_eeg_stream',
        description: 'Stop the EEG data stream',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_available_models',
        description: 'Get list of available models from LM Studio',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_cache_stats',
        description: 'Get query cache statistics',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'clear_cache',
        description: 'Clear the query cache',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'connect_to_peer',
        description: 'Connect to another Brainscan user for P2P brain sharing',
        inputSchema: {
          type: 'object',
          properties: {
            peer_id: { type: 'string', description: 'Peer ID to connect to' }
          },
          required: ['peer_id']
        }
      },
      {
        name: 'share_brain_data',
        description: 'Share current EEG data with connected peers',
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
  
  if (!bridgeConnected || !bridgeSocket) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: Not connected to Brainscan Bridge. Please ensure the bridge is running.'
        }
      ],
      isError: true
    };
  }
  
  try {
    switch (name) {
      case 'query_left_hemisphere': {
        const command = {
          type: 'chat_message',
          message: args.message,
          hemisphere: 'left'
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: `Query sent to left hemisphere: ${args.message}`
            }
          ]
        };
      }
      
      case 'query_right_hemisphere': {
        const command = {
          type: 'chat_message',
          message: args.message,
          hemisphere: 'right'
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: `Query sent to right hemisphere: ${args.message}`
            }
          ]
        };
      }
      
      case 'query_bicameral': {
        const command = {
          type: 'chat_message',
          message: args.message,
          hemisphere: 'both'
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: `Bicameral query sent: ${args.message}\n\nLeft and right hemispheres will process this and a synthesized response will be returned.`
            }
          ]
        };
      }
      
      case 'start_eeg_stream': {
        const command = {
          type: 'start_eeg',
          source_type: 'simulated',
          sample_rate: args.sample_rate || 256
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: `EEG stream started at ${args.sample_rate || 256} Hz`
            }
          ]
        };
      }
      
      case 'stop_eeg_stream': {
        const command = {
          type: 'stop_eeg'
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: 'EEG stream stopped'
            }
          ]
        };
      }
      
      case 'get_available_models': {
        const command = {
          type: 'get_models'
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: 'Requesting available models from LM Studio...'
            }
          ]
        };
      }
      
      case 'configure_hemisphere_models': {
        const commands = [];
        
        if (args.left_model) {
          commands.push({
            type: 'set_model',
            hemisphere: 'left',
            model_id: args.left_model
          });
        }
        
        if (args.right_model) {
          commands.push({
            type: 'set_model',
            hemisphere: 'right',
            model_id: args.right_model
          });
        }
        
        if (args.comparator_model) {
          commands.push({
            type: 'set_comparator_model',
            model_id: args.comparator_model
          });
        }
        
        commands.forEach(cmd => bridgeSocket.send(JSON.stringify(cmd)));
        
        return {
          content: [
            {
              type: 'text',
              text: `Hemisphere models configured:\n- Left: ${args.left_model || 'unchanged'}\n- Right: ${args.right_model || 'unchanged'}\n- Comparator: ${args.comparator_model || 'unchanged'}`
            }
          ]
        };
      }
      
      case 'get_cache_stats': {
        const command = {
          type: 'get_cache_stats'
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: 'Requesting cache statistics...'
            }
          ]
        };
      }
      
      case 'clear_cache': {
        const command = {
          type: 'clear_cache'
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: 'Query cache cleared'
            }
          ]
        };
      }
      
      case 'connect_to_peer': {
        const command = {
          type: 'peer_connect_request',
          target_peer: args.peer_id
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: `Connection request sent to peer: ${args.peer_id}`
            }
          ]
        };
      }
      
      case 'share_brain_data': {
        const command = {
          type: 'peer_share_eeg'
        };
        bridgeSocket.send(JSON.stringify(command));
        
        return {
          content: [
            {
              type: 'text',
              text: 'Sharing brain data with connected peers...'
            }
          ]
        };
      }
      
      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`
            }
          ],
          isError: true
        };
    }
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool ${name}: ${err.message}`
        }
      ],
      isError: true
    };
  }
});

// List resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'bicameral://config',
        name: 'Bicameral Configuration',
        description: 'Current bicameral inference configuration',
        mimeType: 'application/json'
      },
      {
        uri: 'bicameral://hemisphere-status',
        name: 'Hemisphere Status',
        description: 'Current status of left and right hemispheres',
        mimeType: 'application/json'
      },
      {
        uri: 'bicameral://coherence-metrics',
        name: 'Coherence Metrics',
        description: 'Real-time hemispheric coherence measurements',
        mimeType: 'application/json'
      }
    ]
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  switch (uri) {
    case 'bicameral://config': {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(config, null, 2)
          }
        ]
      };
    }
    
    case 'bicameral://hemisphere-status': {
      const status = {
        left_hemisphere: {
          model: config.bicameral_settings?.hemisphere_configuration?.left_hemisphere?.model_id || 'not configured',
          role: 'analytical',
          status: 'ready'
        },
        right_hemisphere: {
          model: config.bicameral_settings?.hemisphere_configuration?.right_hemisphere?.model_id || 'not configured',
          role: 'intuitive',
          status: 'ready'
        },
        comparator: {
          model: config.bicameral_settings?.hemisphere_configuration?.comparator_model?.model_id || 'not configured',
          role: 'synthesizer',
          status: 'ready'
        },
        bridge_connected: bridgeConnected,
        eeg_streaming: false // Would need to query from bridge
      };
      
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(status, null, 2)
          }
        ]
      };
    }
    
    case 'bicameral://coherence-metrics': {
      // This would require querying the bridge for real metrics
      const metrics = {
        left_coherence: 0.92,
        right_coherence: 0.88,
        overall_coherence: 0.90,
        dominant_hemisphere: 'left',
        timestamp: new Date().toISOString(),
        note: 'Simulated metrics - connect to live EEG for real data'
      };
      
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(metrics, null, 2)
          }
        ]
      };
    }
    
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Bicameral MCP] Server running on stdio');
}

main().catch(console.error);
