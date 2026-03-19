/**
 * OpEncode API Usage Examples
 * 
 * Demonstrates how to use the OpEncode API layer for Bicameral AI
 */

// Example 1: Basic Query
async function exampleBasicQuery() {
    const api = new OpEncodeAPI({
        baseUrl: 'ws://localhost:9001',
        debug: true
    });
    
    try {
        await api.connect();
        
        const response = await api.query({
            message: 'imagine a purple cat',
            hemisphere: 'both',
            mode: 'standard'
        });
        
        console.log('Response:', response.message);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        api.disconnect();
    }
}

// Example 2: Batch Processing
async function exampleBatchProcessing() {
    const api = new OpEncodeAPI({
        baseUrl: 'ws://localhost:9001',
        enableCache: true
    });
    
    await api.connect();
    
    const queries = [
        { message: 'describe a red car', hemisphere: 'left', mode: 'standard' },
        { message: 'describe a blue house', hemisphere: 'right', mode: 'standard' },
        { message: 'describe a green tree', hemisphere: 'both', mode: 'standard' },
        { message: 'describe a yellow sun', hemisphere: 'left', mode: 'internal_analysis' }
    ];
    
    const result = await api.batchQuery(queries, {
        concurrency: 2,
        continueOnError: true
    });
    
    console.log('Results:', result.results);
    console.log('Errors:', result.errors);
    
    api.disconnect();
}

// Example 3: Using Middleware
async function exampleWithMiddleware() {
    const wrapper = new OpEncodeWrapper({
        baseUrl: 'ws://localhost:9001'
    });
    
    // Add logging middleware
    wrapper.use(async (context) => {
        console.log('Before query:', context.message);
        const start = Date.now();
        
        // Let query execute
        const result = await context.api.query(context);
        
        console.log('After query:', Date.now() - start, 'ms');
        return result;
    });
    
    // Add caching middleware
    const cache = new Map();
    wrapper.use(async (context) => {
        const key = context.message;
        if (cache.has(key)) {
            console.log('Cache hit!');
            return cache.get(key);
        }
        
        const result = await context.api.query(context);
        cache.set(key, result);
        return result;
    });
    
    await wrapper.query({
        message: 'explain quantum mechanics',
        mode: 'standard'
    });
}

// Example 4: Model Management
async function exampleModelManagement() {
    const api = new OpEncodeAPI({
        baseUrl: 'ws://localhost:9001'
    });
    
    await api.connect();
    
    // Get available models
    const models = await api.getModels();
    console.log('Available models:', models);
    
    // Set different models for different hemispheres
    await api.setModel('left', 'qwen2.5-0.5b-instruct');
    await api.setModel('right', 'qwen3.5-0.8b');
    await api.setModel('comparator', 'qwen3.5-0.8b-claude-4.6-opus-reasoning-distilled');
    
    console.log('Models configured!');
    
    api.disconnect();
}

// Example 5: Event Handling
async function exampleEventHandling() {
    const api = new OpEncodeAPI({
        baseUrl: 'ws://localhost:9001',
        debug: true
    });
    
    await api.connect();
    
    // Listen for all responses
    const unsubscribe = api.on('response', (data) => {
        console.log('Got response:', data);
    });
    
    // Listen for errors
    api.on('error', (error) => {
        console.error('API Error:', error);
    });
    
    // Make queries
    await api.query({ message: 'hello world' });
    await api.query({ message: 'how are you?' });
    
    // Unsubscribe when done
    setTimeout(() => {
        unsubscribe();
        api.disconnect();
    }, 5000);
}

// Example 6: Streaming (when supported)
async function exampleStreaming() {
    const wrapper = new OpEncodeWrapper({
        baseUrl: 'ws://localhost:9001'
    });
    
    const stream = wrapper.stream({
        message: 'write a long story',
        mode: 'standard'
    });
    
    for await (const chunk of stream) {
        console.log('Chunk:', chunk);
    }
}

// Example 7: Validation
async function exampleValidation() {
    const api = new OpEncodeAPI();
    
    try {
        // This will throw an error
        api.validate({
            message: 'test',
            hemisphere: 'invalid' // Invalid hemisphere
        });
    } catch (error) {
        console.log('Validation error:', error.message);
    }
    
    // This passes
    api.validate({
        message: 'test query',
        hemisphere: 'both',
        mode: 'standard'
    });
    console.log('Validation passed!');
}

// Example 8: Progress Tracking
async function exampleProgressTracking() {
    const wrapper = new OpEncodeWrapper({
        baseUrl: 'ws://localhost:9001'
    });
    
    const queries = Array.from({ length: 10 }, (_, i) => ({
        message: `Query ${i + 1}: describe something`,
        hemisphere: 'both'
    }));
    
    const results = await wrapper.batch(queries, {
        concurrency: 2,
        onProgress: ({ completed, total, percent }) => {
            console.log(`Progress: ${completed}/${total} (${percent}%)`);
        }
    });
    
    console.log('All queries complete!');
}

// Example 9: Error Handling
async function exampleErrorHandling() {
    const api = new OpEncodeAPI({
        baseUrl: 'ws://localhost:9001',
        maxRetries: 3
    });
    
    try {
        await api.connect();
        
        const response = await api.query({
            message: 'test query',
            hemisphere: 'both',
            mode: 'standard'
        });
        
        console.log('Success:', response);
    } catch (error) {
        if (error.message.includes('timeout')) {
            console.error('Query timed out - server might be overloaded');
        } else if (error.message.includes('not connected')) {
            console.error('Connection failed - check if bridge is running');
        } else {
            console.error('Unexpected error:', error);
        }
    } finally {
        api.disconnect();
    }
}

// Example 10: Reconnection
async function exampleReconnection() {
    const api = new OpEncodeAPI({
        baseUrl: 'ws://localhost:9001'
    });
    
    // Connect
    await api.connect();
    
    // Simulate disconnection
    console.log('Simulating disconnect...');
    api.ws.close();
    
    // Wait for reconnection
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    // Should be reconnected now
    if (api.isConnected) {
        console.log('Successfully reconnected!');
        const response = await api.query({ message: 'test after reconnect' });
        console.log('Query succeeded:', response);
    }
    
    api.disconnect();
}

// Run all examples
async function runAllExamples() {
    console.log('=== OpEncode API Examples ===\n');
    
    console.log('1. Basic Query:');
    await exampleBasicQuery();
    
    console.log('\n2. Batch Processing:');
    await exampleBatchProcessing();
    
    console.log('\n3. Middleware:');
    await exampleWithMiddleware();
    
    console.log('\n4. Model Management:');
    await exampleModelManagement();
    
    console.log('\n5. Event Handling:');
    await exampleEventHandling();
    
    console.log('\n6. Validation:');
    await exampleValidation();
    
    console.log('\n7. Progress Tracking:');
    await exampleProgressTracking();
    
    console.log('\n8. Error Handling:');
    await exampleErrorHandling();
    
    console.log('\n9. Reconnection:');
    await exampleReconnection();
    
    console.log('\n=== All examples complete ===');
}

// Export examples
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        exampleBasicQuery,
        exampleBatchProcessing,
        exampleWithMiddleware,
        exampleModelManagement,
        exampleEventHandling,
        exampleValidation,
        exampleProgressTracking,
        exampleErrorHandling,
        exampleReconnection,
        runAllExamples
    };
}
