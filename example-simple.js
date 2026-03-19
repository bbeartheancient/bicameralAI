/**
 * OpenCode Desktop + Bicameral AI
 * Simple usage example
 */

const bicameral = require('./bicameral-simple.js');

// Example 1: Simple chat
async function simpleExample() {
    const response = await bicameral.chat('imagine a purple cat');
    console.log('AI says:', response);
}

// Example 2: Technical mode
async function technicalExample() {
    const response = await bicameral.chat(
        'analyze QAM16 signal processing',
        { mode: 'internal_analysis' }
    );
    console.log('Technical response:', response);
}

// Example 3: Left hemisphere (analytical)
async function analyticalExample() {
    const response = await bicameral.chat(
        'solve this math problem: 2+2',
        { hemisphere: 'left' }
    );
    console.log('Analytical response:', response);
}

// Run it
simpleExample().catch(console.error);
