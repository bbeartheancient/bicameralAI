/**
 * Test script for REST Bridge
 * 
 * Tests the REST-to-WebSocket bridge for OpenCode Desktop compatibility
 */

const http = require('http');

const BASE_URL = 'localhost';
const PORT = 9002;

function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_URL,
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve(body);
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function runTests() {
    console.log('🚀 Testing Bicameral REST Bridge\n');
    console.log(`Base URL: http://${BASE_URL}:${PORT}/v1\n`);

    try {
        // Test 1: Check if server is running
        console.log('Test 1: Server connectivity...');
        try {
            await makeRequest('/v1/models');
            console.log('✓ Server is running\n');
        } catch {
            console.error('✗ Server not running on port', PORT);
            console.log('\nStart the bridge with:');
            console.log('  node rest-bridge.js');
            return;
        }

        // Test 2: List models
        console.log('Test 2: List available models...');
        const models = await makeRequest('/v1/models');
        console.log(`✓ Found ${models.data?.length || 0} models:`);
        models.data?.forEach(m => console.log(`  - ${m.id}: ${m.name || m.id}`));
        console.log();

        // Test 3: Standard mode chat
        console.log('Test 3: Standard mode chat...');
        const standardResponse = await makeRequest('/v1/chat/completions', 'POST', {
            model: 'bicameral-standard',
            messages: [{ role: 'user', content: 'imagine a purple cat' }],
            max_tokens: 2048
        });
        
        if (standardResponse.choices?.[0]?.message?.content) {
            console.log('✓ Standard mode works');
            console.log(`  Response preview: ${standardResponse.choices[0].message.content.substring(0, 100)}...\n`);
        } else {
            console.log('✗ Standard mode failed');
            console.log('  Error:', standardResponse.error || 'Unknown error');
            console.log();
        }

        // Test 4: Technical mode chat
        console.log('Test 4: Technical mode chat...');
        const technicalResponse = await makeRequest('/v1/chat/completions', 'POST', {
            model: 'bicameral-technical',
            messages: [{ role: 'user', content: 'analyze QAM16 signal patterns' }],
            max_tokens: 2048
        });
        
        if (technicalResponse.choices?.[0]?.message?.content) {
            console.log('✓ Technical mode works');
            console.log(`  Response preview: ${technicalResponse.choices[0].message.content.substring(0, 100)}...\n`);
        } else {
            console.log('✗ Technical mode failed');
            console.log('  Error:', technicalResponse.error || 'Unknown error');
            console.log();
        }

        console.log('✅ All tests complete!\n');
        console.log('Ready for OpenCode Desktop integration.');
        console.log('Configure with baseURL: "http://localhost:9002/v1"');

    } catch (error) {
        console.error('\n❌ Test failed with error:');
        console.error(error.message);
        
        if (error.message.includes('ECONNREFUSED')) {
            console.log('\nMake sure to start the REST bridge first:');
            console.log('  node rest-bridge.js');
        }
    }
}

runTests();
