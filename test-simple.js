// Simple test script for REST bridge
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 9002,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};

const data = JSON.stringify({
    model: 'bicameral-standard',
    messages: [{ role: 'user', content: 'test opencode integration' }],
    max_tokens: 100
});

console.log('Sending request to REST bridge...\n');

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}\n`);
    
    let body = '';
    res.on('data', (chunk) => {
        body += chunk;
        console.log('Received chunk:', chunk.length, 'bytes');
    });
    
    res.on('end', () => {
        console.log('\n=== FULL RESPONSE ===');
        try {
            const parsed = JSON.parse(body);
            console.log(JSON.stringify(parsed, null, 2));
            
            if (parsed.choices?.[0]?.message?.content) {
                console.log('\n=== CONTENT PREVIEW ===');
                console.log(parsed.choices[0].message.content.substring(0, 200) + '...');
                console.log('\n✅ TEST PASSED - REST bridge is working!');
            } else {
                console.log('\n❌ TEST FAILED - No content in response');
            }
        } catch (e) {
            console.log('Raw response:', body);
        }
    });
});

req.on('error', (e) => {
    console.error('Request failed:', e.message);
});

req.write(data);
req.end();
