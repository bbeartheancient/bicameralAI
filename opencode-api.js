/**
 * OpEncode API Layer - Interface for Bicameral AI System
 * 
 * A high-performance API wrapper for interfacing with OpenCode/Bicameral AI
 * Provides type-safe abstractions, batching, validation, and async support
 */

class OpEncodeAPI {
    constructor(config = {}) {
        this.config = {
            baseUrl: config.baseUrl || 'ws://localhost:9001',
            timeout: config.timeout || 30000,
            maxRetries: config.maxRetries || 3,
            enableCache: config.enableCache !== false,
            debug: config.debug || false,
            ...config
        };
        
        this.ws = null;
        this.callbacks = new Map();
        this.requestId = 0;
        this.cache = new Map();
        this.isConnected = false;
        this.connectionPromise = null;
        
        // Bind methods
        this.connect = this.connect.bind(this);
        this.send = this.send.bind(this);
        this.query = this.query.bind(this);
        this.batchQuery = this.batchQuery.bind(this);
        this.validate = this.validate.bind(this);
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        if (this.isConnected) return Promise.resolve();
        if (this.connectionPromise) return this.connectionPromise;
        
        this.connectionPromise = new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.config.baseUrl);
                
                this.ws.onopen = () => {
                    this.isConnected = true;
                    this.log('Connected to OpEncode server');
                    resolve();
                };
                
                this.ws.onmessage = (event) => {
                    this.handleMessage(JSON.parse(event.data));
                };
                
                this.ws.onerror = (error) => {
                    this.log('WebSocket error:', error);
                    reject(error);
                };
                
                this.ws.onclose = () => {
                    this.isConnected = false;
                    this.log('Disconnected from server');
                    setTimeout(() => this.reconnect(), 5000);
                };
            } catch (error) {
                reject(error);
            }
        });
        
        return this.connectionPromise;
    }

    /**
     * Reconnect with exponential backoff
     */
    async reconnect() {
        if (this.isConnected) return;
        
        this.log('Attempting to reconnect...');
        this.connectionPromise = null;
        
        try {
            await this.connect();
        } catch (error) {
            this.log('Reconnection failed, will retry:', error);
        }
    }

    /**
     * Send raw message
     */
    send(type, payload) {
        if (!this.isConnected) {
            throw new Error('Not connected to server');
        }
        
        const message = {
            type,
            ...payload,
            timestamp: Date.now()
        };
        
        this.ws.send(JSON.stringify(message));
        return message;
    }

    /**
     * Handle incoming messages
     */
    handleMessage(data) {
        const { type, requestId, ...payload } = data;
        
        if (requestId && this.callbacks.has(requestId)) {
            const { resolve, reject } = this.callbacks.get(requestId);
            this.callbacks.delete(requestId);
            
            if (type === 'error') {
                reject(new Error(payload.message || 'Unknown error'));
            } else {
                resolve(payload);
            }
        }
        
        // Handle server-initiated messages
        switch (type) {
            case 'inference_result':
                this.emit('inference', payload);
                break;
            case 'chat_response':
                this.emit('response', payload);
                break;
            case 'models_list':
                this.emit('models', payload.models);
                break;
            case 'error':
                this.emit('error', payload);
                break;
        }
    }

    /**
     * Emit event to listeners
     */
    emit(event, data) {
        if (this._listeners && this._listeners[event]) {
            this._listeners[event].forEach(cb => cb(data));
        }
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this._listeners) this._listeners = {};
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return () => this.off(event, callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this._listeners && this._listeners[event]) {
            this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
        }
    }

    /**
     * Logging utility
     */
    log(...args) {
        if (this.config.debug) {
            console.log('[OpEncodeAPI]', ...args);
        }
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `${Date.now()}_${++this.requestId}`;
    }

    /**
     * Validate query parameters
     */
    validate(query) {
        if (!query || typeof query !== 'object') {
            throw new Error('Query must be an object');
        }
        
        if (!query.message || typeof query.message !== 'string') {
            throw new Error('Query must have a message string');
        }
        
        if (query.hemisphere && !['left', 'right', 'both'].includes(query.hemisphere)) {
            throw new Error('Hemisphere must be: left, right, or both');
        }
        
        if (query.mode && !['standard', 'internal_analysis'].includes(query.mode)) {
            throw new Error('Mode must be: standard or internal_analysis');
        }
        
        return true;
    }

    /**
     * Execute single query with type inference
     */
    async query(queryConfig) {
        await this.connect();
        this.validate(queryConfig);
        
        const requestId = this.generateRequestId();
        const cacheKey = this.getCacheKey(queryConfig);
        
        // Check cache
        if (this.config.enableCache && this.cache.has(cacheKey)) {
            this.log('Cache hit for:', cacheKey);
            return this.cache.get(cacheKey);
        }
        
        return new Promise((resolve, reject) => {
            // Set timeout
            const timeout = setTimeout(() => {
                this.callbacks.delete(requestId);
                reject(new Error(`Query timeout after ${this.config.timeout}ms`));
            }, this.config.timeout);
            
            // Store callback
            this.callbacks.set(requestId, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    
                    // Cache result
                    if (this.config.enableCache) {
                        this.cache.set(cacheKey, data);
                        
                        // Limit cache size
                        if (this.cache.size > 100) {
                            const firstKey = this.cache.keys().next().value;
                            this.cache.delete(firstKey);
                        }
                    }
                    
                    resolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
            
            // Send query
            this.send('chat_message', {
                ...queryConfig,
                requestId
            });
        });
    }

    /**
     * Get cache key for query
     */
    getCacheKey(query) {
        return JSON.stringify({
            message: query.message,
            hemisphere: query.hemisphere || 'both',
            mode: query.mode || 'standard'
        });
    }

    /**
     * Batch query processing with middleware
     */
    async batchQuery(queries, options = {}) {
        const {
            concurrency = 2,
            continueOnError = true,
            timeout = 60000
        } = options;
        
        this.log(`Processing batch of ${queries.length} queries`);
        
        const results = [];
        const errors = [];
        
        // Process in chunks
        for (let i = 0; i < queries.length; i += concurrency) {
            const batch = queries.slice(i, i + concurrency);
            
            const promises = batch.map(async (query, index) => {
                try {
                    const result = await this.query(query);
                    return { success: true, result, index: i + index };
                } catch (error) {
                    if (!continueOnError) throw error;
                    return { success: false, error: error.message, index: i + index };
                }
            });
            
            const batchResults = await Promise.all(promises);
            
            batchResults.forEach(res => {
                if (res.success) {
                    results[res.index] = res.result;
                } else {
                    errors.push({ index: res.index, error: res.error });
                    results[res.index] = null;
                }
            });
        }
        
        return {
            results,
            errors,
            success: errors.length === 0
        };
    }

    /**
     * Get available models
     */
    async getModels() {
        await this.connect();
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout getting models'));
            }, 5000);
            
            const handler = (models) => {
                clearTimeout(timeout);
                this.off('models', handler);
                resolve(models);
            };
            
            this.on('models', handler);
            this.send('get_models', {});
        });
    }

    /**
     * Set model for hemisphere
     */
    async setModel(hemisphere, modelId) {
        await this.connect();
        this.send('set_model', {
            hemisphere,
            model_id: modelId
        });
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        this.log('Cache cleared');
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.connectionPromise = null;
    }
}

/**
 * High-level wrapper with additional utilities
 */
class OpEncodeWrapper {
    constructor(config = {}) {
        this.api = new OpEncodeAPI(config);
        this.middleware = [];
    }

    /**
     * Add middleware
     */
    use(middleware) {
        this.middleware.push(middleware);
        return this;
    }

    /**
     * Execute query through middleware chain
     */
    async query(config) {
        let context = { ...config, api: this.api };
        
        // Run through middleware
        for (const mw of this.middleware) {
            if (typeof mw === 'function') {
                context = await mw(context) || context;
            }
        }
        
        return this.api.query(context);
    }

    /**
     * Batched query with progress tracking
     */
    async batch(queries, options = {}) {
        const {
            onProgress,
            ...batchOptions
        } = options;
        
        const results = [];
        const total = queries.length;
        
        for (let i = 0; i < queries.length; i += (batchOptions.concurrency || 2)) {
            const batch = queries.slice(i, i + (batchOptions.concurrency || 2));
            const batchResults = await this.api.batchQuery(batch, batchOptions);
            
            results.push(...batchResults.results);
            
            if (onProgress) {
                onProgress({
                    completed: Math.min(i + batch.length, total),
                    total,
                    percent: Math.round((i + batch.length) / total * 100)
                });
            }
        }
        
        return results;
    }

    /**
     * Create streaming query
     */
    async *stream(config) {
        // This would be implemented with actual streaming support
        // For now, just yields the final result
        const result = await this.query(config);
        yield result;
    }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OpEncodeAPI, OpEncodeWrapper };
} else if (typeof window !== 'undefined') {
    window.OpEncodeAPI = OpEncodeAPI;
    window.OpEncodeWrapper = OpEncodeWrapper;
}
