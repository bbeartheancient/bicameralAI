/**
 * Brainscan Web Interface - Integrated Version with Full Pipeline Control
 * 
 * Features:
 * - Single WebSocket connection to Rust Bridge (port 8766)
 * - Pipeline controls (start/stop EEG streaming)
 * - Model selection for left/right hemisphere
 * - Chat interface with local LLMs
 * - Real-time EEG visualization and inference results
 * 
 * Architecture:
 * Browser <-> Rust Bridge (WebSocket:8766) <-> LMStudio (HTTP:1234)
 * No Python scripts required!
 */

(function() {
    'use strict';

    // Global state
    const state = {
        inferenceConnected: false,
        inferenceSocket: null,
        eegRunning: false,
        models: {
            left: null,
            right: null,
            comparator: null,
            available: []
        },
        chatHistory: [],
        currentHemisphere: 'both', // 'left', 'right', or 'both'
        inferenceResults: [],
        lastInferenceTime: 0,
        lastEEGFrame: null
    };

    // ==========================================
    // WEBSOCKET CONNECTION
    // ==========================================

    let reconnectTimer = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3; // Reduced from 10
    const RECONNECT_DELAY = 5000; // Increased to 5 seconds
    
    function connectInference(url = 'ws://localhost:8766') {
        // Clear any pending reconnect
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        
        // Don't close existing socket unless it's truly dead
        if (state.inferenceSocket) {
            if (state.inferenceSocket.readyState === WebSocket.OPEN) {
                console.log('[Inference] Already connected');
                return;
            }
            // Only close if it's in a broken state
            if (state.inferenceSocket.readyState !== WebSocket.CLOSED) {
                try {
                    state.inferenceSocket.close();
                } catch (e) {
                    // Ignore close errors
                }
            }
        }

        console.log('[Inference] Connecting to:', url, '(attempt', reconnectAttempts + 1, ')');
        
        try {
            state.inferenceSocket = new WebSocket(url);
            
            state.inferenceSocket.onopen = () => {
                console.log('[Inference] Connected successfully');
                state.inferenceConnected = true;
                reconnectAttempts = 0; // Reset counter on successful connection
                updateInferenceStatus(true);
                
                // Enable real-time visualization mode
                if (window.setRTStatus) {
                    window.setRTStatus(true, 'Bridge connected (simulated EEG)');
                }
                
                // Initialize P2P when bridge is connected
                if (window.BrainscanP2P && window.BrainscanP2P.init) {
                    console.log('[Inference] Initializing P2P module...');
                    window.BrainscanP2P.init();
                }
                
                // Request available models and pipeline status
                sendInferenceCommand({ type: 'get_models' });
                sendInferenceCommand({ type: 'get_stats' });
                sendInferenceCommand({ type: 'get_pipeline_status' });
                
                addChatMessage('system', 'Connected to Brainscan Bridge', 'both');
            };

            state.inferenceSocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleInferenceMessage(data);
                } catch (e) {
                    // Only log parse errors occasionally
                    if (!window.parseErrorCount) window.parseErrorCount = 0;
                    window.parseErrorCount++;
                    if (window.parseErrorCount <= 3) {
                        console.error('[Inference] Parse error:', e);
                    }
                }
            };

            state.inferenceSocket.onclose = (event) => {
                // Only log disconnect once
                if (state.inferenceConnected) {
                    console.log('[Inference] Disconnected', event.code);
                }
                state.inferenceConnected = false;
                state.eegRunning = false;
                updateInferenceStatus(false);
                updateEEGStatus(false);
                
                // Update RT status
                if (window.setRTStatus) {
                    window.setRTStatus(false, 'Bridge disconnected');
                }
                
                // Only attempt reconnect if it wasn't a clean close and we haven't exceeded max attempts
                if (event.code !== 1000 && event.code !== 1001 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    console.log(`[Inference] Will reconnect in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                    reconnectTimer = setTimeout(() => connectInference(url), RECONNECT_DELAY);
                } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.error('[Inference] Max reconnect attempts reached');
                    addChatMessage('system', 'Connection failed - please refresh page', 'both');
                }
            };

            state.inferenceSocket.onerror = (error) => {
                // Don't log full error object to prevent console flooding
                if (!window.errorCount) window.errorCount = 0;
                window.errorCount++;
                if (window.errorCount <= 2) {
                    console.error('[Inference] WebSocket error (code ' + (error?.code || 'unknown') + ')');
                }
            };
        } catch (e) {
            console.error('[Inference] Connection failed:', e);
            addChatMessage('system', 'Failed to create WebSocket connection', 'both');
        }
    }

    function sendInferenceCommand(cmd) {
        if (state.inferenceSocket && state.inferenceConnected) {
            state.inferenceSocket.send(JSON.stringify(cmd));
        }
    }

    // ==========================================
    // DATA HANDLERS
    // ==========================================

    function handleInferenceMessage(data) {
        // Only log first few messages to debug
        if (!window.msgCount) window.msgCount = 0;
        window.msgCount++;
        
        switch (data.type) {
            case 'inference_result':
                handleInferenceResult(data);
                break;
            case 'statistics':
                updateStats(data);
                break;
            case 'models_list':
                updateModelsList(data.models);
                break;
            case 'pipeline_status':
                updatePipelineStatus(data);
                break;
            case 'eeg_frame':
                handleEEGFrame(data);
                break;
            case 'chat_response':
                handleChatResponse(data);
                break;
            case 'cache_stats':
                const statsDisplay = document.getElementById('cache-stats-display');
                if (statsDisplay) {
                    statsDisplay.style.display = 'block';
                    statsDisplay.textContent = `Hits: ${data.hits} | Misses: ${data.misses} | Size: ${data.size} | Hit Rate: ${data.hit_rate.toFixed(1)}%`;
                }
                console.log('[Cache Stats]', data);
                break;
            case 'cache_cleared':
                const clearedDisplay = document.getElementById('cache-stats-display');
                if (clearedDisplay) {
                    clearedDisplay.style.display = 'block';
                    clearedDisplay.textContent = 'Cache cleared';
                }
                break;
            case 'peer_message':
                // Handle peer-to-peer messages
                if (window.BrainscanP2P && window.BrainscanP2P.handleMessage) {
                    window.BrainscanP2P.handleMessage(data);
                }
                break;
            case 'error':
                // Limit error logging to prevent flooding
                if (window.msgCount <= 5) {
                    console.error('[Inference] Error:', data.message);
                }
                addChatMessage('system', `Error: ${data.message}`, 'both');
                break;
            case 'pong':
                // Heartbeat response
                break;
            default:
                // Ignore unknown message types silently
                break;
        }
    }

    let lastEEGProcessTime = 0;
    const EEG_PROCESS_INTERVAL = 1000 / 60; // Cap EEG processing to 60 FPS max
    
    function handleEEGFrame(data) {
        state.lastEEGFrame = data;
        
        // Throttle EEG frame processing - cap at 60 FPS
        const now = performance.now();
        if (now - lastEEGProcessTime < EEG_PROCESS_INTERVAL) {
            // Skip this frame, just store the data
            window.lastEEGFrame = data;
            return;
        }
        lastEEGProcessTime = now;
        
        // Only log very occasionally to avoid flooding console
        if (!window.eegLogCount) window.eegLogCount = 0;
        window.eegLogCount++;
        if (window.eegLogCount === 1) {
            console.log('[EEG] First frame received:', data);
        }
        
        // Call the real-time processing function from eeg-spatializer
        if (window.processRTFrame && data.channels && Array.isArray(data.channels)) {
            try {
                window.processRTFrame(data.channels);
            } catch (e) {
                // Silently ignore errors to prevent console flooding
                if (window.eegLogCount <= 3) {
                    console.error('[EEG] Error calling processRTFrame:', e.message);
                }
            }
        }
        
        // Store for reference
        window.lastEEGFrame = data;
    }

    // Store pending hemisphere responses
    const pendingResponses = {
        left: null,
        right: null,
        query: null
    };

    function handleInferenceResult(data) {
        // Skip processing/thinking status messages - only handle complete responses
        if (data.predicted_class === 'thinking' || data.predicted_class === 'processing') {
            // Update hemisphere window status
            const hemisphere = data.hemisphere;
            if (hemisphere === 'left') {
                updateHemisphereStatus('left', 'Thinking...');
            } else if (hemisphere === 'right') {
                updateHemisphereStatus('right', 'Thinking...');
            }
            return;
        }
        
        if (data.predicted_class === 'complete') {
            // Update hemisphere window status to complete
            const hemisphere = data.hemisphere;
            if (hemisphere === 'left') {
                updateHemisphereStatus('left', 'Complete');
            } else if (hemisphere === 'right') {
                updateHemisphereStatus('right', 'Complete');
            }
            return;
        }
        
        // This is a chat response - extract the content from the actual message
        const content = data.message || 'Response received';
        const hemisphere = data.hemisphere;
        
        // Debug logging
        console.log('[Hemisphere] Received response:', hemisphere, content.substring(0, 50) + '...');
        
        // Store the response for later combination
        if (hemisphere === 'left' || hemisphere === 'both') {
            pendingResponses.left = {
                content: content,
                timestamp: Date.now()
            };
            // Show in left hemisphere window
            showHemisphereResponse('left', content);
            console.log('[Hemisphere] Left window updated');
        }
        
        if (hemisphere === 'right' || hemisphere === 'both') {
            pendingResponses.right = {
                content: content,
                timestamp: Date.now()
            };
            // Show in right hemisphere window
            showHemisphereResponse('right', content);
            console.log('[Hemisphere] Right window updated');
        }
        
        // Only show combined response in chat when both hemispheres have responded
        // or after a timeout
        checkAndShowCombinedResponse();
    }
    
    function updateHemisphereStatus(hemisphere, status) {
        const statusEl = document.getElementById(`${hemisphere}-hemisphere-status`);
        if (statusEl) {
            statusEl.textContent = status;
        }
        
        // Show the window
        const windowEl = document.getElementById(`${hemisphere}-hemisphere-window`);
        if (windowEl) {
            windowEl.style.display = 'block';
        }
    }
    
    function showHemisphereResponse(hemisphere, content) {
        const contentEl = document.getElementById(`${hemisphere}-hemisphere-content`);
        const windowEl = document.getElementById(`${hemisphere}-hemisphere-window`);
        
        console.log(`[Hemisphere] showHemisphereResponse called for ${hemisphere}`, {
            contentEl: !!contentEl,
            windowEl: !!windowEl,
            contentLength: content?.length
        });
        
        if (contentEl && windowEl) {
            // Truncate long responses for the floating window
            let displayContent = content;
            if (displayContent.length > 300) {
                displayContent = displayContent.substring(0, 300) + '... [see chat for full response]';
            }
            contentEl.textContent = displayContent;
            windowEl.style.display = 'block';
            console.log(`[Hemisphere] Window ${hemisphere} displayed with content`);
        } else {
            console.error(`[Hemisphere] Missing elements for ${hemisphere}:`, {
                contentEl: !!contentEl,
                windowEl: !!windowEl
            });
        }
    }
    
    let combinedResponseTimer = null;
    
    function checkAndShowCombinedResponse() {
        // Clear any pending timer
        if (combinedResponseTimer) {
            clearTimeout(combinedResponseTimer);
        }
        
        // If we have both responses, show combined
        if (pendingResponses.left && pendingResponses.right) {
            showCombinedResponse();
        } else {
            // Wait up to 3 seconds for the other hemisphere
            combinedResponseTimer = setTimeout(() => {
                showCombinedResponse();
            }, 3000);
        }
    }
    
    function showCombinedResponse() {
        const leftResponse = pendingResponses.left;
        const rightResponse = pendingResponses.right;
        
        let combinedText = '';
        
        if (leftResponse && rightResponse) {
            // Both hemispheres responded - create combined view with full content
            combinedText = '🧠 **Left Hemisphere:**\n' + leftResponse.content + '\n\n🎨 **Right Hemisphere:**\n' + rightResponse.content;
        } else if (leftResponse) {
            combinedText = leftResponse.content;
        } else if (rightResponse) {
            combinedText = rightResponse.content;
        } else {
            return; // No responses to show
        }
        
        // Add to chat as combined response
        addChatMessage('model', combinedText, 'both');
        
        // Clear pending responses
        pendingResponses.left = null;
        pendingResponses.right = null;
    }

    function updateStats(stats) {
        if (stats.hemisphere_configs) {
            stats.hemisphere_configs.forEach(config => {
                if (config.hemisphere === 'left') {
                    state.models.left = config.model_id;
                } else if (config.hemisphere === 'right') {
                    state.models.right = config.model_id;
                }
            });
            updateModelDisplay();
        }

        if (stats.available_models && stats.available_models.length > 0) {
            state.models.available = stats.available_models;
            updateModelSelector();
        }
    }

    function updateModelsList(models) {
        if (models && models.length > 0) {
            state.models.available = models;
            updateModelSelector();
            console.log('[Models] Available models:', models);
        }
    }

    function updatePipelineStatus(status) {
        state.eegRunning = status.eeg_running;
        updateEEGStatus(status.eeg_running);
        
        // Update button states
        const startBtn = document.getElementById('btn-start-eeg');
        const stopBtn = document.getElementById('btn-stop-eeg');
        
        if (startBtn) {
            startBtn.disabled = status.eeg_running;
            startBtn.style.opacity = status.eeg_running ? '0.5' : '1';
        }
        if (stopBtn) {
            stopBtn.disabled = !status.eeg_running;
            stopBtn.style.opacity = status.eeg_running ? '1' : '0.5';
        }
        
        // Update status text
        const statusText = document.getElementById('pipeline-status-text');
        if (statusText) {
            if (status.eeg_running) {
                statusText.textContent = `Running (${status.eeg_source_type || 'unknown'})`;
                statusText.style.color = '#0f0';
            } else {
                statusText.textContent = 'Stopped';
                statusText.style.color = '#553300';
            }
        }
    }

    function handleChatResponse(data) {
        console.log('[ChatResponse] Received:', data.hemisphere, data.message?.substring(0, 50));
        
        // Show in hemisphere windows
        const hemisphere = data.hemisphere;
        if (hemisphere === 'left' || hemisphere === 'both') {
            showHemisphereResponse('left', data.message);
        }
        if (hemisphere === 'right' || hemisphere === 'both') {
            showHemisphereResponse('right', data.message);
        }
        
        // Only add to chat if it's a combined response (both hemispheres) or single query
        // Filter out individual left/right hemisphere analysis messages
        if (hemisphere === 'both') {
            // This is the combined response - show in chat
            addChatMessage('model', data.message, 'both');
        }
        // Individual 'left' and 'right' messages go only to their windows, not chat
    }

    // ==========================================
    // UI UPDATES
    // ==========================================

    function updateInferenceStatus(connected) {
        const indicator = document.getElementById('inference-status-indicator');
        const text = document.getElementById('inference-status-text');
        
        if (indicator) {
            indicator.style.background = connected ? '#0f0' : '#553300';
            indicator.style.boxShadow = connected ? '0 0 5px #0f0' : 'none';
        }
        
        if (text) {
            text.textContent = connected ? 'Bridge Connected' : 'Bridge Disconnected';
            text.style.color = connected ? '#0f0' : '#553300';
        }

        // Update connect button
        const btn = document.getElementById('btn-connect-bridge');
        if (btn) {
            btn.textContent = connected ? 'Connected' : 'Connect Bridge';
            btn.classList.toggle('active', connected);
        }
    }

    function updateEEGStatus(running) {
        const indicator = document.getElementById('eeg-status-indicator');
        const text = document.getElementById('eeg-status-text');
        
        if (indicator) {
            indicator.style.background = running ? '#0f0' : '#553300';
            indicator.style.boxShadow = running ? '0 0 5px #0f0' : 'none';
        }
        
        if (text) {
            text.textContent = running ? 'EEG Streaming' : 'EEG Stopped';
            text.style.color = running ? '#0f0' : '#553300';
        }
    }

    function updateModelDisplay() {
        const leftEl = document.getElementById('left-model-display');
        const rightEl = document.getElementById('right-model-display');
        const comparatorEl = document.getElementById('comparator-model-display');
        
        if (leftEl && state.models.left) {
            leftEl.textContent = state.models.left.length > 20 
                ? state.models.left.substring(0, 20) + '...'
                : state.models.left;
        }
        
        if (rightEl && state.models.right) {
            rightEl.textContent = state.models.right.length > 20 
                ? state.models.right.substring(0, 20) + '...'
                : state.models.right;
        }
        
        if (comparatorEl) {
            if (state.models.comparator) {
                comparatorEl.textContent = state.models.comparator.length > 20 
                    ? state.models.comparator.substring(0, 20) + '...'
                    : state.models.comparator;
            } else {
                comparatorEl.textContent = 'Auto (first available)';
            }
        }
    }

    function updateModelSelector() {
        const leftSelect = document.getElementById('left-model-select');
        const rightSelect = document.getElementById('right-model-select');
        const comparatorSelect = document.getElementById('comparator-model-select');
        
        const options = state.models.available.map(model => 
            `<option value="${model}">${model}</option>`
        ).join('');
        
        if (leftSelect) {
            leftSelect.innerHTML = '<option value="">Auto-select</option>' + options;
            if (state.models.left) {
                leftSelect.value = state.models.left;
            }
        }
        
        if (rightSelect) {
            rightSelect.innerHTML = '<option value="">Auto-select</option>' + options;
            if (state.models.right) {
                rightSelect.value = state.models.right;
            }
        }
        
        if (comparatorSelect) {
            comparatorSelect.innerHTML = '<option value="">Auto (uses first available)</option>' + options;
            if (state.models.comparator) {
                comparatorSelect.value = state.models.comparator;
            }
        }
    }

    // ==========================================
    // CHAT INTERFACE
    // ==========================================

    function addChatMessage(role, content, hemisphere = 'both') {
        const chatContainer = document.getElementById('chat-messages');
        if (!chatContainer) return;

        const msg = document.createElement('div');
        msg.className = `chat-message chat-${role}`;
        msg.style.cssText = `
            margin-bottom: 8px;
            padding: 8px;
            border-radius: 4px;
            font-size: 11px;
            max-width: 90%;
            word-wrap: break-word;
        `;

        // Color based on role and hemisphere
        let bgColor = '#1a1a00';
        let borderColor = '#553300';
        let textColor = '#fa0';

        if (role === 'user') {
            bgColor = '#0a1a0a';
            borderColor = '#0f0';
            textColor = '#0f0';
            msg.style.marginLeft = 'auto';
        } else if (role === 'system') {
            if (hemisphere === 'left') {
                bgColor = '#1a0a0a';
                borderColor = '#e60003';
            } else if (hemisphere === 'right') {
                bgColor = '#0a0a1a';
                borderColor = '#00f';
            }
        }

        msg.style.background = bgColor;
        msg.style.border = `1px solid ${borderColor}`;
        msg.style.color = textColor;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        msg.innerHTML = `
            <div style="font-size: 9px; opacity: 0.6; margin-bottom: 2px;">
                ${time} ${hemisphere !== 'both' ? '[' + hemisphere + ']' : ''}
            </div>
            <div>${content}</div>
        `;

        chatContainer.appendChild(msg);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // Keep chat history limited
        while (chatContainer.children.length > 50) {
            chatContainer.removeChild(chatContainer.firstChild);
        }

        state.chatHistory.push({ role, content, hemisphere, time });
    }

    function sendChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input || !input.value.trim()) return;

        const message = input.value.trim();
        input.value = '';

        // Add to chat
        addChatMessage('user', message, state.currentHemisphere);

        // Send to inference server
        sendInferenceCommand({
            type: 'chat_message',
            message: message,
            hemisphere: state.currentHemisphere
        });
    }

    // ==========================================
    // 3D VISUALIZATION
    // ==========================================

    function updateInferenceVisualization(data) {
        if (!window.scene) return;

        // Update brain mesh if available
        if (window.brainMesh && window.brainMesh.material.uniforms) {
            const uniforms = window.brainMesh.material.uniforms;
            
            // Update intensity based on confidence
            if (uniforms.uIntensityW) {
                uniforms.uIntensityW.value = data.confidence * 2;
            }

            // Color based on hemisphere
            if (data.hemisphere === 'left') {
                if (uniforms.uColorW) uniforms.uColorW.value.setHex(0xff0000);
            } else if (data.hemisphere === 'right') {
                if (uniforms.uColorW) uniforms.uColorW.value.setHex(0x0000ff);
            } else {
                if (uniforms.uColorW) uniforms.uColorW.value.setHex(0xffaa00);
            }
        }

        // Update attention points (handled by existing inference_viz.js if loaded)
        if (window.updateInferenceMarkers) {
            window.updateInferenceMarkers(data.attention_points);
        }
    }

    // ==========================================
    // UI INITIALIZATION
    // ==========================================

    function createIntegratedUI() {
        // Find the sidebar
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.error('Sidebar not found');
            return;
        }

        // Find the Data Input panel to replace it
        const panels = sidebar.querySelectorAll('.panel');
        let dataInputPanel = null;
        
        for (const panel of panels) {
            const title = panel.querySelector('.panel-title');
            if (title && title.textContent.includes('Data Input')) {
                dataInputPanel = panel;
                break;
            }
        }

        if (!dataInputPanel) {
            console.error('Data Input panel not found');
            return;
        }

        // Replace with new integrated panel
        const newPanel = document.createElement('div');
        newPanel.className = 'panel';
        newPanel.innerHTML = `
            <div class="panel-title">🧠 AI Pipeline Control</div>
            
            <!-- Connection Status -->
            <div style="display: flex; gap: 12px; margin-bottom: 10px; font-size: 10px;">
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span id="inference-status-indicator" style="width: 8px; height: 8px; border-radius: 50%; background: #553300;"></span>
                    <span id="inference-status-text" style="color: #553300;">Bridge</span>
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span id="eeg-status-indicator" style="width: 8px; height: 8px; border-radius: 50%; background: #553300;"></span>
                    <span id="eeg-status-text" style="color: #553300;">EEG</span>
                </div>
            </div>

            <!-- Connect Button -->
            <div style="margin-bottom: 12px;">
                <button id="btn-connect-bridge" class="btn" style="width: 100%; font-size: 11px; padding: 8px;">
                    Connect to Bridge
                </button>
            </div>

            <!-- Pipeline Controls -->
            <div style="margin-bottom: 12px; padding: 10px; border: 1px solid #330000; background: #0a0a00;">
                <div style="font-size: 10px; color: #553300; margin-bottom: 6px; text-transform: uppercase; font-weight: bold;">
                    EEG Pipeline
                </div>
                <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                    <button id="btn-start-eeg" class="btn" style="flex: 1; font-size: 10px; padding: 6px;">
                        ▶ Start
                    </button>
                    <button id="btn-stop-eeg" class="btn" style="flex: 1; font-size: 10px; padding: 6px; opacity: 0.5;" disabled>
                        ⏹ Stop
                    </button>
                </div>
                <div style="font-size: 9px; color: #553300;">
                    Status: <span id="pipeline-status-text" style="color: #553300;">Stopped</span>
                </div>
            </div>

            <!-- Hemisphere Model Selection -->
            <div style="margin-bottom: 12px;">
                <div style="font-size: 10px; color: #553300; margin-bottom: 4px; text-transform: uppercase;">
                    Left Hemisphere Model
                </div>
                <div style="display: flex; gap: 4px;">
                    <select id="left-model-select" style="flex: 1; background: #000; border: 2px solid #553300; color: #fa0; padding: 4px; font-size: 10px;">
                        <option value="">Connect to load models...</option>
                    </select>
                    <button id="btn-set-left-model" class="btn" style="padding: 4px 8px; font-size: 9px;">Set</button>
                </div>
                <div id="left-model-display" style="font-size: 9px; color: #fa0; margin-top: 2px; overflow: hidden; text-overflow: ellipsis;">
                    Not configured
                </div>
            </div>

            <div style="margin-bottom: 12px;">
                <div style="font-size: 10px; color: #553300; margin-bottom: 4px; text-transform: uppercase;">
                    Right Hemisphere Model
                </div>
                <div style="display: flex; gap: 4px;">
                    <select id="right-model-select" style="flex: 1; background: #000; border: 2px solid #553300; color: #fa0; padding: 4px; font-size: 10px;">
                        <option value="">Connect to load models...</option>
                    </select>
                    <button id="btn-set-right-model" class="btn" style="padding: 4px 8px; font-size: 9px;">Set</button>
                </div>
                <div id="right-model-display" style="font-size: 9px; color: #fa0; margin-top: 2px; overflow: hidden; text-overflow: ellipsis;">
                    Not configured
                </div>
            </div>

            <!-- Comparator Model Selection -->
            <div style="margin-bottom: 12px;">
                <div style="font-size: 10px; color: #553300; margin-bottom: 4px; text-transform: uppercase;">
                    Comparator/Synthesizer Model
                </div>
                <div style="display: flex; gap: 4px;">
                    <select id="comparator-model-select" style="flex: 1; background: #000; border: 2px solid #553300; color: #fa0; padding: 4px; font-size: 10px;">
                        <option value="">Auto (uses first available)</option>
                    </select>
                    <button id="btn-set-comparator-model" class="btn" style="padding: 4px 8px; font-size: 9px;">Set</button>
                </div>
                <div id="comparator-model-display" style="font-size: 9px; color: #fa0; margin-top: 2px; overflow: hidden; text-overflow: ellipsis;">
                    Auto-selected from available models
                </div>
            </div>

            <!-- Cache Controls -->
            <div style="margin-bottom: 12px; padding: 8px; background: #0a0a0a; border: 1px solid #553300; border-radius: 4px;">
                <div style="font-size: 10px; color: #553300; margin-bottom: 4px; text-transform: uppercase;">
                    Query Cache
                </div>
                <div style="display: flex; gap: 4px; margin-bottom: 4px;">
                    <button id="btn-clear-cache" class="btn" style="flex: 1; font-size: 9px; padding: 4px;">Clear Cache</button>
                    <button id="btn-cache-stats" class="btn" style="flex: 1; font-size: 9px; padding: 4px;">Stats</button>
                </div>
                <div id="cache-stats-display" style="font-size: 9px; color: #fa0; display: none;">
                    Hits: 0 | Misses: 0 | Hit Rate: 0%
                </div>
            </div>

            <!-- Peer-to-Peer Controls -->
            <div style="margin-bottom: 12px; padding: 8px; background: #0a1a0a; border: 1px solid #0f0; border-radius: 4px;">
                <div style="font-size: 10px; color: #0f0; margin-bottom: 4px; text-transform: uppercase;">
                    Brain-to-Brain (P2P)
                </div>
                <div style="font-size: 9px; color: #0a0; margin-bottom: 4px;">
                    Your ID: <span id="local-peer-id" style="color: #0f0;">Not assigned</span>
                </div>
                <div style="font-size: 9px; color: #0a0; margin-bottom: 4px;">
                    Connected: <span id="connected-peer-count" style="color: #0f0;">0</span> peers
                </div>
                <div style="display: flex; gap: 4px; margin-bottom: 4px;">
                    <button id="btn-refresh-peers" class="btn" style="flex: 1; font-size: 9px; padding: 4px;">Find Peers</button>
                    <button id="btn-share-brain" class="btn" style="flex: 1; font-size: 9px; padding: 4px;">Share EEG</button>
                </div>
                <div id="available-peers-list" style="font-size: 9px; max-height: 60px; overflow-y: auto;">
                    <div style="color: #553300;">No peers available</div>
                </div>
            </div>

            <!-- Chat Target Selection -->
            <div style="margin-bottom: 8px;">
                <div style="font-size: 10px; color: #553300; margin-bottom: 4px;">
                    Chat Target
                </div>
                <div style="display: flex; gap: 4px;">
                    <button id="chat-target-left" class="btn chat-target-btn" data-target="left" style="flex: 1; font-size: 9px; padding: 4px;">Left</button>
                    <button id="chat-target-both" class="btn chat-target-btn active" data-target="both" style="flex: 1; font-size: 9px; padding: 4px;">Both</button>
                    <button id="chat-target-right" class="btn chat-target-btn" data-target="right" style="flex: 1; font-size: 9px; padding: 4px;">Right</button>
                </div>
            </div>

            <!-- Chat Window -->
            <div id="chat-messages" style="
                height: 150px;
                background: #050505;
                border: 2px solid #553300;
                border-radius: 4px;
                padding: 8px;
                overflow-y: auto;
                margin-bottom: 8px;
                font-family: 'Roboto Condensed', monospace;
            "></div>

            <!-- Chat Input -->
            <div style="display: flex; gap: 4px;">
                <input id="chat-input" type="text" placeholder="Ask about brain state..." style="
                    flex: 1;
                    background: #000;
                    border: 2px solid #553300;
                    color: #fa0;
                    padding: 6px;
                    font-size: 11px;
                    font-family: 'Roboto Condensed', sans-serif;
                " />
                <button id="btn-chat-send" class="btn" style="padding: 6px 12px; font-size: 10px;">Send</button>
            </div>
        `;

        // Replace the old panel
        dataInputPanel.parentNode.replaceChild(newPanel, dataInputPanel);

        // Add event listeners
        setupEventListeners();

        // Auto-connect after a short delay
        setTimeout(() => {
            if (!state.inferenceConnected) {
                connectInference();
            }
        }, 1000);
    }

    function setupEventListeners() {
        // Connect button
        document.getElementById('btn-connect-bridge')?.addEventListener('click', () => {
            connectInference();
        });

        // Pipeline controls
        document.getElementById('btn-start-eeg')?.addEventListener('click', () => {
            sendInferenceCommand({
                type: 'start_eeg',
                source_type: 'simulated',
                sample_rate: 256
            });
            addChatMessage('system', 'Starting EEG stream...', 'both');
        });

        document.getElementById('btn-stop-eeg')?.addEventListener('click', () => {
            sendInferenceCommand({ type: 'stop_eeg' });
            addChatMessage('system', 'Stopping EEG stream...', 'both');
        });

        // Model selection buttons
        document.getElementById('btn-set-left-model')?.addEventListener('click', () => {
            const select = document.getElementById('left-model-select');
            if (select && select.value) {
                sendInferenceCommand({
                    type: 'set_model',
                    hemisphere: 'left',
                    model_id: select.value
                });
                state.models.left = select.value;
                updateModelDisplay();
                addChatMessage('system', `Left hemisphere model set to: ${select.value.substring(0, 20)}...`, 'left');
            }
        });

        document.getElementById('btn-set-right-model')?.addEventListener('click', () => {
            const select = document.getElementById('right-model-select');
            if (select && select.value) {
                sendInferenceCommand({
                    type: 'set_model',
                    hemisphere: 'right',
                    model_id: select.value
                });
                state.models.right = select.value;
                updateModelDisplay();
                addChatMessage('system', `Right hemisphere model set to: ${select.value.substring(0, 20)}...`, 'right');
            }
        });

        // Comparator model selection
        document.getElementById('btn-set-comparator-model')?.addEventListener('click', () => {
            const select = document.getElementById('comparator-model-select');
            if (select && select.value) {
                sendInferenceCommand({
                    type: 'set_model',
                    hemisphere: 'comparator',
                    model_id: select.value
                });
                state.models.comparator = select.value;
                updateModelDisplay();
                addChatMessage('system', `Comparator/synthesizer model set to: ${select.value.substring(0, 20)}...`, 'both');
            }
        });

        // Cache controls
        document.getElementById('btn-clear-cache')?.addEventListener('click', () => {
            sendInferenceCommand({ type: 'clear_cache' });
            addChatMessage('system', 'Query cache cleared', 'both');
        });

        document.getElementById('btn-cache-stats')?.addEventListener('click', () => {
            sendInferenceCommand({ type: 'get_cache_stats' });
        });

        // Peer-to-peer controls
        document.getElementById('btn-refresh-peers')?.addEventListener('click', () => {
            console.log('[P2P] Requesting peer list from server...');
            sendInferenceCommand({ type: 'get_peer_list' });
            addChatMessage('system', 'Searching for available peers...', 'both');
        });

        document.getElementById('btn-share-brain')?.addEventListener('click', () => {
            if (window.BrainscanP2P && window.BrainscanP2P.getConnectedPeers().length > 0) {
                if (state.lastEEGFrame) {
                    window.BrainscanP2P.shareBrainData(state.lastEEGFrame);
                    addChatMessage('system', 'Sharing brain data with connected peers', 'both');
                } else {
                    addChatMessage('system', 'No EEG data available to share', 'both');
                }
            } else {
                addChatMessage('system', 'No peers connected. Find peers first.', 'both');
            }
        });

        // Chat target buttons
        document.querySelectorAll('.chat-target-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.chat-target-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                state.currentHemisphere = e.target.dataset.target;
            });
        });

        // Chat input
        document.getElementById('btn-chat-send')?.addEventListener('click', sendChatMessage);
        document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    window.BrainscanBridge = {
        connectInference,
        sendInferenceCommand,  // <-- ADD THIS
        sendChatMessage,
        setHemisphereModel: (hemisphere, modelId) => {
            sendInferenceCommand({
                type: 'set_model',
                hemisphere,
                model_id: modelId
            });
        },
        startEEG: () => {
            sendInferenceCommand({
                type: 'start_eeg',
                source_type: 'simulated',
                sample_rate: 256
            });
        },
        stopEEG: () => {
            sendInferenceCommand({ type: 'stop_eeg' });
        },
        getPipelineStatus: () => {
            sendInferenceCommand({ type: 'get_pipeline_status' });
        },
        getState: () => ({ ...state }),
        isConnected: () => state.inferenceConnected,
        isEEGRunning: () => state.eegRunning,
        addChatMessage
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createIntegratedUI();
            // Auto-connect after UI is created
            setTimeout(() => connectInference(), 500);
        });
    } else {
        createIntegratedUI();
        // Auto-connect after UI is created
        setTimeout(() => connectInference(), 500);
    }

    console.log('[BrainscanBridge] Integrated module loaded - No Python required!');
    
    // Test function to verify hemisphere windows exist
    window.testHemisphereWindows = function() {
        const leftWindow = document.getElementById('left-hemisphere-window');
        const rightWindow = document.getElementById('right-hemisphere-window');
        const leftContent = document.getElementById('left-hemisphere-content');
        const rightContent = document.getElementById('right-hemisphere-content');
        
        console.log('Window elements found:', {
            leftWindow: !!leftWindow,
            rightWindow: !!rightWindow,
            leftContent: !!leftContent,
            rightContent: !!rightContent
        });
        
        if (leftWindow && rightWindow) {
            leftWindow.style.display = 'block';
            rightWindow.style.display = 'block';
            if (leftContent) leftContent.textContent = 'Test Left Hemisphere';
            if (rightContent) rightContent.textContent = 'Test Right Hemisphere';
            console.log('Windows should now be visible');
        }
    };

})();
