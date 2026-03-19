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
                console.log('[REST Bridge] Received chat completion request');
                const request = JSON.parse(body);
                console.log(`[REST Bridge] Model: ${request.model}, Messages: ${request.messages?.length || 0}, Stream: ${request.stream}`);
                
                // Check if client wants streaming
                if (request.stream) {
                    await this.handleStreaming(req, res, request);
                    return;
                }
                
                const response = await this.processChatCompletion(request);
                
                console.log(`[REST Bridge] Sending HTTP 200 response, content length: ${JSON.stringify(response).length}`);
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                });
                res.end(JSON.stringify(response));
                console.log('[REST Bridge] HTTP response sent successfully');
            } catch (error) {
                console.error('[REST Bridge] Error processing chat completion:', error.message);
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
     * Handle streaming chat completions
     */
    async handleStreaming(req, res, request) {
        console.log('[REST Bridge] Handling streaming request');
        
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        
        try {
            const response = await this.processChatCompletion(request);
            const content = response.choices[0].message.content;
            
            // Send as server-sent events (SSE)
            const chunks = content.match(/.{1,100}/g) || [content]; // Split into 100-char chunks
            
            for (let i = 0; i < chunks.length; i++) {
                const chunk = {
                    id: response.id,
                    object: 'chat.completion.chunk',
                    created: response.created,
                    model: response.model,
                    choices: [{
                        index: 0,
                        delta: {
                            content: chunks[i]
                        },
                        finish_reason: i === chunks.length - 1 ? 'stop' : null
                    }]
                };
                
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
            
            res.write('data: [DONE]\n\n');
            res.end();
            console.log('[REST Bridge] Streaming response completed');
        } catch (error) {
            console.error('[REST Bridge] Streaming error:', error);
            res.write(`data: ${JSON.stringify({error: error.message})}\n\n`);
            res.end();
        }
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

                // Send to Bicameral AI with conservative limits for 4K context window
                // LM Studio context: ~4096, system prompts: ~1500, leaving ~2500 for completion
                ws.send(JSON.stringify({
                    type: 'chat_message',
                    message: lastMessage.content,
                    hemisphere: 'both',
                    mode: mode,
                    max_tokens_left: 512,
                    max_tokens_right: 512,
                    max_tokens_comparator: 1024
                }));
            });

            // Track if we've received the final comparator response
            let receivedComparator = false;
            let bufferMessages = [];

            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data);
                    
                    // Log for debugging
                    if (msg.type === 'chat_response') {
                        console.log(`[REST Bridge] Received response from ${msg.hemisphere || 'unknown'}`);
                        
                        // The 'both' hemisphere response is the final comparator output
                        if (msg.hemisphere === 'both' || !msg.hemisphere) {
                            receivedComparator = true;
                            
                            console.log(`[REST Bridge] Final comparator response received, length: ${msg.message?.length || 0}`);
                            
                            // Format the message for better display
                            let formattedMessage = this.formatMessage(msg.message);
                            
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
                                        content: formattedMessage
                                    },
                                    logprobs: null,
                                    finish_reason: 'stop'
                                }],
                                usage: {
                                    prompt_tokens: 0,
                                    completion_tokens: formattedMessage?.split(/\s+/)?.length || 0,
                                    total_tokens: formattedMessage?.split(/\s+/)?.length || 0
                                },
                                system_fingerprint: 'bicameral-ai-v1'
                            };

                            console.log('[REST Bridge] Sending response to OpenCode Desktop');
                            
                            ws.close();
                            resolve(openaiResponse);
                            
                            console.log('[REST Bridge] Promise resolved successfully');
                        }
                    } else if (msg.type === 'error') {
                        console.error('[REST Bridge] Error from backend:', msg.message);
                        ws.close();
                        reject(new Error(msg.message));
                    }
                } catch (error) {
                    console.error('[REST Bridge] Error parsing WebSocket message:', error);
                }
            });

            ws.on('error', (error) => {
                console.error('[REST Bridge] WebSocket error:', error);
                reject(new Error(`WebSocket error: ${error.message}`));
            });

            // Timeout after 120 seconds (bicameral processing takes longer)
            setTimeout(() => {
                if (!receivedComparator) {
                    console.error('[REST Bridge] Timeout waiting for comparator response');
                    ws.close();
                    reject(new Error('Request timeout - bicameral processing exceeded 120 seconds'));
                }
            }, 120000);
        });
    }

    /**
     * Format message for better readability
     * Fixes common formatting issues from model output
     */
    formatMessage(message) {
        if (!message) return '';
        
        // Fix: Add space after [Combined] header if missing
        message = message.replace(/\[Combined\] ([^\n]+)(?=[A-Za-z])/g, '\[Combined\] $1\n\n');
        
        // Fix: Ensure proper spacing after headers (###, ####)
        message = message.replace(/^(#{1,4}\s.+?)(?=\n[A-Za-z])/gm, '$1\n');
        
        // Fix: Add blank lines between list items and paragraphs
        message = message.replace(/(\n\*\s.+?\n)(?=\*\s)/g, '$1\n');
        
        // Fix: Add spacing around code blocks
        message = message.replace(/```(\w+)?\n/g, '\n```$1\n');
        message = message.replace(/\n```\n?/g, '\n```\n\n');
        
        // Fix: Ensure double newline before major sections (numbered items)
        message = message.replace(/\n(\d+\.\s)/g, '\n\n$1');
        
        // Clean up excessive newlines (more than 2)
        message = message.replace(/\n{3,}/g, '\n\n');
        
        // Ensure message ends with newline
        if (!message.endsWith('\n')) {
            message += '\n';
        }
        
        return message;
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
