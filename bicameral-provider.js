/**
 * Bicameral AI Provider for OpenCode Desktop
 * 
 * This provider appears as a single model in OpenCode Desktop's model dropdown.
 * It interfaces with the dual-hemisphere Bicameral AI system through WebSocket.
 * 
 * Installation:
 * 1. Copy this file to your OpenCode Desktop config folder
 * 2. Add to providers.json or through UI: Settings → Model Providers → Add Custom
 * 3. Select this file and set display name to "Bicameral AI"
 */

const { OpEncodeAPI } = require('./opencode-api.js');

class BicameralAIProvider {
    constructor(config = {}) {
        this.name = config.name || 'Bicameral AI';
        this.version = '1.0.0';
        this.config = {
            bridgeUrl: config.bridgeUrl || 'ws://localhost:9001',
            timeout: config.timeout || 60000,
            defaultMode: config.defaultMode || 'standard',
            ...config
        };
        
        this.api = null;
        this.isConnected = false;
        this.connectionPromise = null;
    }

    /**
     * Provider metadata required by OpenCode Desktop
     */
    getMetadata() {
        return {
            name: this.name,
            version: this.version,
            capabilities: {
                streaming: false,  // Set to true when streaming is implemented
                functionCalling: false,
                vision: false
            },
            defaultConfig: {
                bridgeUrl: 'ws://localhost:9001',
                defaultMode: 'standard'
            }
        };
    }

    /**
     * Initialize connection to Bicameral AI bridge
     */
    async initialize() {
        if (this.isConnected) return;
        if (this.connectionPromise) return this.connectionPromise;

        this.connectionPromise = new Promise(async (resolve, reject) => {
            try {
                this.api = new OpEncodeAPI({
                    baseUrl: this.config.bridgeUrl,
                    timeout: this.config.timeout,
                    debug: false
                });

                await this.api.connect();
                this.isConnected = true;
                
                console.log(`[${this.name}] Connected to Bicameral AI bridge`);
                resolve();
            } catch (error) {
                console.error(`[${this.name}] Connection failed:`, error.message);
                reject(error);
            }
        });

        return this.connectionPromise;
    }

    /**
     * Main completion method - called by OpenCode Desktop
     * 
     * @param {Array} messages - Chat messages array
     * @param {Object} options - Completion options
     * @returns {Promise<Object>} Completion result
     */
    async complete(messages, options = {}) {
        await this.initialize();

        // Extract the last user message
        const lastMessage = messages.filter(m => m.role === 'user').pop();
        if (!lastMessage) {
            throw new Error('No user message found');
        }

        const prompt = lastMessage.content;

        try {
            // Determine mode from options or use default
            const mode = options.mode || this.config.defaultMode || 'standard';
            
            // Query Bicameral AI
            const result = await this.api.query({
                message: prompt,
                hemisphere: 'both',  // Always use both hemispheres for best results
                mode: mode,
                max_tokens_left: 2048,
                max_tokens_right: 2048,
                max_tokens_comparator: 8192
            });

            // Return in format OpenCode Desktop expects
            return {
                content: result.message,
                role: 'assistant',
                model: result.model || this.name,
                finish_reason: 'stop'
            };

        } catch (error) {
            console.error(`[${this.name}] Completion error:`, error);
            throw error;
        }
    }

    /**
     * Streaming completion (when supported)
     * 
     * @param {Array} messages - Chat messages
     * @param {Object} options - Options
     * @yields {Object} Response chunks
     */
    async *stream(messages, options = {}) {
        // For now, just yield the complete response
        // Implement true streaming when Bicameral AI supports it
        const result = await this.complete(messages, options);
        yield result;
    }

    /**
     * Get available models (for configuration UI)
     */
    async getAvailableModels() {
        await this.initialize();
        return this.api.getModels();
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            await this.initialize();
            return { status: 'healthy', connected: this.isConnected };
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    /**
     * Cleanup and disconnect
     */
    async dispose() {
        if (this.api) {
            this.api.disconnect();
            this.isConnected = false;
            this.connectionPromise = null;
        }
    }
}

// Export for OpenCode Desktop
module.exports = BicameralAIProvider;

// Also export factory function for easy instantiation
module.exports.createProvider = (config) => new BicameralAIProvider(config);
