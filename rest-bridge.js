/**
 * OpenAI-compatible REST API Bridge for Bicameral AI
 * 
 * This creates an OpenAI-compatible REST endpoint that bridges to the
 * WebSocket-based Bicameral AI system, allowing integration with OpenCode Desktop.
 * 
 * Usage:
 *   node rest-bridge.js
 * 
 * Then configure OpenCode Desktop with:
 *   baseURL: "http://localhost:9002/v1"
 */

const http = require('http');
const WebSocket = require('ws');
const url = require('url');

class BicameralRestBridge {
    constructor(config = {}) {
        this.config = {
            restPort: config.restPort || 9002,
            wsUrl: config.wsUrl || 'ws://localhost:8766',
            ...config
        };
        
        this.server = null;
        this.wsClients = new Map(); // requestId -> ws connection
    }

    /**
     * Start the REST bridge server
     */
    async start() {
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        this.server.listen(this.config.restPort, () => {
            console.log(`✓ Bicameral REST Bridge running on http://localhost:${this.config.restPort}/v1`);
            console.log(`✓ Bridging to WebSocket: ${this.config.wsUrl}`);
            console.log('');
            console.log('Configure OpenCode Desktop with:');
            console.log(`  baseURL: "http://localhost:${this.config.restPort}/v1"`);
        });
    }

    /**
     * Handle HTTP requests
     */
    handleRequest(req, res) {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const parsedUrl = url.parse(req.url, true);
        const path = parsedUrl.pathname;

        // Route handling
        if (path === '/v1/models') {
            this.handleModels(req, res);
        } else if (path === '/v1/chat/completions') {
            this.handleChatCompletions(req, res);
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    }

    /**
     * Handle /v1/models endpoint
     */
    async handleModels(req, res) {
        // Return Bicameral AI as available models
        const models = {
            object: 'list',
            data: [
                {
                    id: 'bicameral-standard',
                    object: 'model',
                    created: Math.floor(Date.now() / 1000),
                    owned_by: 'bicameral-ai',
                    permission: [],
                    root: 'bicameral-standard',
                    parent: null
                },
                {
                    id: 'bicameral-technical',
                    object: 'model',
                    created: Math.floor(Date.now() / 1000),
                    owned_by: 'bicameral-ai',
                    permission: [],
                    root: 'bicameral-technical',
                    parent: null
                }
            ]
        };

        res.writeHead(200);
        res.end(JSON.stringify(models));
    }

    /**
     * Handle /v1/chat/completions endpoint
     */
    async handleChatCompletions(req, res) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const request = JSON.parse(body);
                const response = await this.processChatCompletion(request);
                res.writeHead(200);
                res.end(JSON.stringify(response));
            } catch (error) {
                console.error('Error processing chat completion:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ 
                    error: {
                        message: error.message,
                        type: 'internal_error'
                    }
                }));
            }
        });
    }

    /**
     * Process chat completion by bridging to WebSocket
     */
    processChatCompletion(request) {
        return new Promise((resolve, reject) => {
            // Connect to Bicameral WebSocket
            const ws = new WebSocket(this.config.wsUrl);
            const requestId = Date.now().toString();
            
            ws.on('open', () => {
                // Determine mode from model selection
                const mode = request.model === 'bicameral-technical' 
                    ? 'internal_analysis' 
                    : 'standard';
                
                // Extract the last user message
                const messages = request.messages || [];
                const lastMessage = messages
                    .filter(m => m.role === 'user')
                    .pop();
                
                if (!lastMessage) {
                    reject(new Error('No user message found'));
                    return;
                }

                // Send to Bicameral AI
                ws.send(JSON.stringify({
                    type: 'chat_message',
                    message: lastMessage.content,
                    hemisphere: 'both',
                    mode: mode,
                    max_tokens_left: request.max_tokens || 2048,
                    max_tokens_right: request.max_tokens || 2048,
                    max_tokens_comparator: request.max_tokens || 8192
                }));
            });

            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);
                    
                    if (msg.type === 'chat_response') {
                        // Convert to OpenAI format
                        const openaiResponse = {
                            id: `chatcmpl-${Date.now()}`,
                            object: 'chat.completion',
                            created: Math.floor(Date.now() / 1000),
                            model: request.model,
                            choices: [{
                                index: 0,
                                message: {
                                    role: 'assistant',
                                    content: msg.message
                                },
                                finish_reason: 'stop'
                            }],
                            usage: {
                                prompt_tokens: 0, // We don't track these
                                completion_tokens: msg.message.split(/\s+/).length,
                                total_tokens: msg.message.split(/\s+/).length
                            }
                        };

                        ws.close();
                        resolve(openaiResponse);
                    } else if (msg.type === 'error') {
                        ws.close();
                        reject(new Error(msg.message));
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            });

            ws.on('error', (error) => {
                reject(new Error(`WebSocket error: ${error.message}`));
            });

            // Timeout after 60 seconds
            setTimeout(() => {
                ws.close();
                reject(new Error('Request timeout'));
            }, 60000);
        });
    }

    /**
     * Stop the bridge server
     */
    stop() {
        if (this.server) {
            this.server.close();
            console.log('✓ REST Bridge stopped');
        }
    }
}

// Start the bridge if run directly
if (require.main === module) {
    const bridge = new BicameralRestBridge();
    bridge.start();

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        bridge.stop();
        process.exit(0);
    });
}

module.exports = { BicameralRestBridge };
