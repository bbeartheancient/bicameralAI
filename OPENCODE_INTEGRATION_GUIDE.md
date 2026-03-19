# OpEncode API Integration Guide

## Quick Setup (5 minutes)

### Step 1: Install Dependencies

Your opencode system needs to connect to the Bicameral AI bridge. Ensure you have:

1. **Bicameral AI running** (rust-bridge)
2. **LM Studio** with models loaded
3. **WebSocket support** in your opencode environment

### Step 2: Configure Connection

Add this configuration to your opencode setup:

```javascript
// opencode-config.js
export const bicameralConfig = {
    // WebSocket endpoint
    bridgeUrl: 'ws://localhost:9001',
    
    // Default models (adjust based on your LM Studio setup)
    defaultModels: {
        left: 'qwen2.5-0.5b-instruct',
        right: 'qwen3.5-0.8b',
        comparator: 'qwen3.5-0.8b-claude-4.6-opus-reasoning-distilled'
    },
    
    // Token limits (match your UI settings)
    maxTokens: {
        left: 2048,
        right: 2048,
        comparator: 8192
    },
    
    // Timeout settings
    timeout: 30000,
    maxRetries: 3,
    
    // Mode: 'standard' (general) or 'internal_analysis' (technical)
    defaultMode: 'standard'
};
```

### Step 3: Create OpEncode Integration Module

Create `opencode-bicameral-bridge.js`:

```javascript
import { OpEncodeAPI } from './opencode-api.js';
import { bicameralConfig } from './opencode-config.js';

/**
 * OpEncode Bicameral Bridge
 * High-level interface between opencode and Bicameral AI
 */
export class OpEncodeBicameralBridge {
    constructor(config = {}) {
        this.config = { ...bicameralConfig, ...config };
        this.api = new OpEncodeAPI({
            baseUrl: this.config.bridgeUrl,
            timeout: this.config.timeout,
            maxRetries: this.config.maxRetries,
            debug: this.config.debug || false
        });
        this.isReady = false;
    }

    /**
     * Initialize connection to Bicameral AI
     */
    async initialize() {
        try {
            await this.api.connect();
            console.log('✓ Connected to Bicameral AI bridge');
            
            // Configure models
            await this.configureModels();
            
            this.isReady = true;
            return true;
        } catch (error) {
            console.error('✗ Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Configure models for each hemisphere
     */
    async configureModels() {
        const { defaultModels } = this.config;
        
        if (defaultModels.left) {
            await this.api.setModel('left', defaultModels.left);
            console.log(`✓ Left model: ${defaultModels.left}`);
        }
        
        if (defaultModels.right) {
            await this.api.setModel('right', defaultModels.right);
            console.log(`✓ Right model: ${defaultModels.right}`);
        }
        
        if (defaultModels.comparator) {
            await this.api.setModel('comparator', defaultModels.comparator);
            console.log(`✓ Comparator model: ${defaultModels.comparator}`);
        }
    }

    /**
     * Execute a query through Bicameral AI
     * 
     * @param {string} message - The query message
     * @param {Object} options - Query options
     * @param {string} options.hemisphere - 'left', 'right', or 'both'
     * @param {string} options.mode - 'standard' or 'internal_analysis'
     * @param {boolean} options.useCache - Whether to use response cache
     * @returns {Promise<Object>} Query result
     */
    async query(message, options = {}) {
        if (!this.isReady) {
            throw new Error('Bridge not initialized. Call initialize() first.');
        }

        const queryConfig = {
            message,
            hemisphere: options.hemisphere || this.config.defaultHemisphere || 'both',
            mode: options.mode || this.config.defaultMode || 'standard',
            max_tokens_left: options.maxTokens?.left || this.config.maxTokens?.left || 2048,
            max_tokens_right: options.maxTokens?.right || this.config.maxTokens?.right || 2048,
            max_tokens_comparator: options.maxTokens?.comparator || this.config.maxTokens?.comparator || 8192
        };

        try {
            const result = await this.api.query(queryConfig);
            return {
                success: true,
                message: result.message,
                model: result.model,
                hemisphere: result.hemisphere,
                timestamp: new Date()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * Execute batch queries
     * 
     * @param {Array<string>} messages - Array of messages
     * @param {Object} options - Batch options
     * @returns {Promise<Array>} Array of results
     */
    async batchQuery(messages, options = {}) {
        if (!this.isReady) {
            throw new Error('Bridge not initialized. Call initialize() first.');
        }

        const queries = messages.map(msg => ({
            message: msg,
            hemisphere: options.hemisphere || 'both',
            mode: options.mode || 'standard',
            max_tokens_left: options.maxTokens?.left || this.config.maxTokens?.left || 2048,
            max_tokens_right: options.maxTokens?.right || this.config.maxTokens?.right || 2048,
            max_tokens_comparator: options.maxTokens?.comparator || this.config.maxTokens?.comparator || 8192
        }));

        return this.api.batchQuery(queries, {
            concurrency: options.concurrency || 2,
            continueOnError: options.continueOnError !== false,
            timeout: options.timeout || 60000
        });
    }

    /**
     * Stream responses (when supported)
     * 
     * @param {string} message - Query message
     * @param {Object} options - Stream options
     * @yields {Object} Response chunks
     */
    async *stream(message, options = {}) {
        const wrapper = new OpEncodeWrapper({
            baseUrl: this.config.bridgeUrl
        });

        const stream = wrapper.stream({
            message,
            hemisphere: options.hemisphere || 'both',
            mode: options.mode || 'standard'
        });

        for await (const chunk of stream) {
            yield chunk;
        }
    }

    /**
     * Get available models from LM Studio
     */
    async getAvailableModels() {
        if (!this.isReady) {
            throw new Error('Bridge not initialized');
        }
        return this.api.getModels();
    }

    /**
     * Switch mode between standard and internal analysis
     */
    setMode(mode) {
        if (!['standard', 'internal_analysis'].includes(mode)) {
            throw new Error('Mode must be "standard" or "internal_analysis"');
        }
        this.config.defaultMode = mode;
        console.log(`✓ Mode set to: ${mode}`);
    }

    /**
     * Cleanup and disconnect
     */
    disconnect() {
        this.api.disconnect();
        this.isReady = false;
        console.log('✓ Disconnected from Bicameral AI');
    }
}

// Export singleton instance for easy access
export const opencodeBridge = new OpEncodeBicameralBridge();
```

### Step 4: Create Test Script

Create `test-opencode-integration.js`:

```javascript
import { OpEncodeBicameralBridge } from './opencode-bicameral-bridge.js';

async function runTests() {
    console.log('🚀 OpEncode Bicameral AI Integration Tests\n');
    
    const bridge = new OpEncodeBicameralBridge({
        debug: true,
        defaultMode: 'standard' // Start with standard mode
    });
    
    try {
        // Test 1: Initialize connection
        console.log('Test 1: Initialize connection...');
        await bridge.initialize();
        console.log('✓ Connected successfully\n');
        
        // Test 2: Simple query
        console.log('Test 2: Simple query...');
        const result1 = await bridge.query('imagine a purple cat');
        console.log('Response:', result1.message.substring(0, 100) + '...\n');
        
        // Test 3: Technical query in standard mode
        console.log('Test 3: Technical query (standard mode)...');
        const result2 = await bridge.query(
            'create an API layer to interface with opencode',
            { hemisphere: 'both' }
        );
        console.log('Response length:', result2.message.length, 'chars\n');
        
        // Test 4: Switch to internal analysis mode
        console.log('Test 4: Switch to internal analysis mode...');
        bridge.setMode('internal_analysis');
        const result3 = await bridge.query(
            'analyze QAM16 signal processing patterns',
            { hemisphere: 'both' }
        );
        console.log('Response length:', result3.message.length, 'chars\n');
        
        // Test 5: Batch processing
        console.log('Test 5: Batch processing...');
        const messages = [
            'describe a red car',
            'describe a blue house',
            'describe a green tree'
        ];
        const batchResults = await bridge.batchQuery(messages, {
            concurrency: 2,
            onProgress: ({ completed, total, percent }) => {
                console.log(`  Progress: ${completed}/${total} (${percent}%)`);
            }
        });
        console.log('✓ Batch complete:', batchResults.results.length, 'responses\n');
        
        // Test 6: Get available models
        console.log('Test 6: Get available models...');
        const models = await bridge.getAvailableModels();
        console.log('Available models:', models.slice(0, 5).join(', ') + '...\n');
        
        console.log('✅ All tests passed!\n');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        bridge.disconnect();
    }
}

// Run tests
runTests();
```

### Step 5: Run the System

**Terminal 1: Start Bicameral AI Bridge**
```bash
cd rust-bridge
cargo run
# or for production:
# cargo run --release
```

**Terminal 2: Start LM Studio**
- Open LM Studio
- Load your models
- Ensure server is running on port 1234

**Terminal 3: Run Test Script**
```bash
# Navigate to your opencode directory
cd /path/to/opencode

# Install dependencies (if using Node.js)
npm install

# Run the test
node test-opencode-integration.js
```

## API Usage Examples

### Basic Query
```javascript
const bridge = new OpEncodeBicameralBridge();
await bridge.initialize();

const result = await bridge.query('imagine a purple cat');
console.log(result.message);
```

### With Options
```javascript
const result = await bridge.query('analyze this code', {
    hemisphere: 'left',          // Use left hemisphere (analytical)
    mode: 'internal_analysis', // Technical mode
    maxTokens: {
        left: 4096,
        right: 4096,
        comparator: 16384
    }
});
```

### Batch Processing
```javascript
const messages = [
    'task 1 description',
    'task 2 description',
    'task 3 description'
];

const results = await bridge.batchQuery(messages, {
    concurrency: 3,
    continueOnError: true,
    onProgress: ({ completed, total, percent }) => {
        console.log(`${percent}% complete`);
    }
});
```

### Error Handling
```javascript
try {
    const result = await bridge.query('complex query');
    if (result.success) {
        console.log(result.message);
    } else {
        console.error('Query failed:', result.error);
    }
} catch (error) {
    console.error('System error:', error.message);
}
```

## Troubleshooting

### Connection Refused
- Ensure bridge is running: `cd rust-bridge && cargo run`
- Check port 9001 is available
- Verify firewall settings

### Model Not Found
- Check LM Studio has models loaded
- Verify model names match exactly
- Use `bridge.getAvailableModels()` to see valid names

### Timeout Errors
- Increase timeout: `timeout: 60000`
- Reduce batch concurrency
- Check LM Studio is responsive

### Truncated Responses
- Increase comparator tokens: `maxTokens.comparator: 16384`
- Use `mode: 'standard'` for shorter responses
- Check per-model token limits in UI

## Advanced Configuration

### Custom Middleware
```javascript
bridge.api.use(async (context) => {
    console.log('Before query:', context.message);
    const start = Date.now();
    
    const result = await context.api.query(context);
    
    console.log('Query took:', Date.now() - start, 'ms');
    return result;
});
```

### Event Listeners
```javascript
bridge.api.on('response', (data) => {
    console.log('Got response:', data.model);
});

bridge.api.on('error', (error) => {
    console.error('API error:', error);
});
```

### Caching Strategy
```javascript
const bridge = new OpEncodeBicameralBridge({
    enableCache: true,
    cacheTTL: 300000 // 5 minutes
});

// Clear cache when needed
bridge.api.clearCache();
```

## Production Deployment

### Environment Variables
```bash
export BICAMERAL_BRIDGE_URL=ws://localhost:9001
export BICAMERAL_DEFAULT_MODE=standard
export BICAMERAL_TIMEOUT=30000
```

### Docker Compose
```yaml
version: '3.8'
services:
  bicameral-bridge:
    build: ./rust-bridge
    ports:
      - "9001:9001"
    environment:
      - RUST_LOG=info
  
  opencode-app:
    build: ./opencode
    environment:
      - BICAMERAL_BRIDGE_URL=ws://bicameral-bridge:9001
    depends_on:
      - bicameral-bridge
```

## Next Steps

1. ✅ Test basic connectivity
2. ✅ Try both modes (standard/internal_analysis)
3. ✅ Test batch processing
4. ✅ Implement error handling
5. ✅ Add custom middleware
6. 🎯 Deploy to production

For issues, check:
- Bridge logs: `RUST_LOG=debug cargo run`
- LM Studio logs
- Browser console (for WebSocket errors)
