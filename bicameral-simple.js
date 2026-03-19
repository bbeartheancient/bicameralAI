/**
 * Simple Bicameral AI Adapter for OpenCode Desktop
 * 
 * Usage: const ai = require('./bicameral-simple.js');
 *        const response = await ai.chat('your message here');
 */

const { OpEncodeAPI } = require('./opencode-api.js');

class SimpleBicameralAI {
    constructor() {
        this.api = null;
        this.connected = false;
    }

    async connect() {
        if (this.connected) return;
        
        this.api = new OpEncodeAPI({
            baseUrl: 'ws://localhost:9001',
            timeout: 30000,
            debug: false
        });
        
        await this.api.connect();
        this.connected = true;
        console.log('✓ Bicameral AI ready');
    }

    async chat(message, options = {}) {
        await this.connect();
        
        const result = await this.api.query({
            message: message,
            hemisphere: options.hemisphere || 'both',
            mode: options.mode || 'standard'
        });
        
        return result.message;
    }
}

// Export singleton
module.exports = new SimpleBicameralAI();
