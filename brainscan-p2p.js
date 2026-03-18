/**
 * Peer-to-Peer Brain Communication Module
 * 
 * Enables brain-to-brain communication between two Brainscan users
 * through a signaling server (simplified WebRTC-style approach)
 */

(function() {
    'use strict';

    // Peer-to-peer state
    const peerState = {
        localPeerId: null,
        connectedPeers: new Map(), // peerId -> connection info
        isHost: false,
        signalingConnected: false,
        dataChannel: null,
        receivedBrainData: [],
        initAttempts: 0,
        maxInitAttempts: 10,
        initialized: false
    };

    // ==========================================
    // PEER CONNECTION MANAGEMENT
    // ==========================================

    /**
     * Initialize peer-to-peer functionality
     */
    function initPeerToPeer() {
        if (peerState.initialized) {
            console.log('[P2P] Already initialized, skipping...');
            return;
        }
        
        peerState.initAttempts++;
        console.log(`[P2P] Initializing peer-to-peer communication (attempt ${peerState.initAttempts}/${peerState.maxInitAttempts})...`);
        
        if (peerState.initAttempts > peerState.maxInitAttempts) {
            console.error('[P2P] Max initialization attempts reached, giving up.');
            return;
        }
        
        // Request local peer ID from server
        if (window.BrainscanBridge && window.BrainscanBridge.sendInferenceCommand) {
            console.log('[P2P] Requesting peer ID from server...');
            peerState.initialized = true;
            window.BrainscanBridge.sendInferenceCommand({
                type: 'get_peer_id'
            });
        } else {
            console.log('[P2P] BrainscanBridge not ready, will retry in 1 second...');
            setTimeout(initPeerToPeer, 1000);
        }
    }

    /**
     * Handle incoming peer message from server
     */
    function handlePeerMessage(data) {
        switch (data.subtype) {
            case 'peer_id_assigned':
                peerState.localPeerId = data.peer_id;
                console.log('[P2P] Local peer ID:', data.peer_id);
                updatePeerUI();
                break;
                
            case 'peer_list':
                updatePeerList(data.peers);
                break;
                
            case 'connection_request':
                handleConnectionRequest(data.from_peer, data.from_addr);
                break;
                
            case 'connection_accepted':
                handleConnectionAccepted(data.peer_id);
                break;
                
            case 'connection_rejected':
                handleConnectionRejected(data.peer_id);
                break;
                
            case 'peer_disconnected':
                handlePeerDisconnected(data.peer_id);
                break;
                
            case 'brain_data_received':
                handleBrainDataFromPeer(data.data);
                break;
                
            case 'chat_from_peer':
                handleChatFromPeer(data.from_peer, data.content);
                break;
        }
    }

    /**
     * Request connection to a peer
     */
    function connectToPeer(peerId) {
        console.log('[P2P] Requesting connection to peer:', peerId);
        
        window.BrainscanBridge.sendInferenceCommand({
            type: 'peer_connect_request',
            target_peer: peerId
        });
        
        // Update UI to show connecting state
        const peerEl = document.getElementById(`peer-${peerId}`);
        if (peerEl) {
            peerEl.classList.add('connecting');
            peerEl.querySelector('.peer-status').textContent = 'Connecting...';
        }
    }

    /**
     * Accept connection from a peer
     */
    function acceptPeerConnection(peerId) {
        console.log('[P2P] Accepting connection from peer:', peerId);
        
        window.BrainscanBridge.sendInferenceCommand({
            type: 'peer_accept_connection',
            peer_id: peerId
        });
    }

    /**
     * Reject connection from a peer
     */
    function rejectPeerConnection(peerId) {
        console.log('[P2P] Rejecting connection from peer:', peerId);
        
        window.BrainscanBridge.sendInferenceCommand({
            type: 'peer_reject_connection',
            peer_id: peerId
        });
    }

    /**
     * Disconnect from a peer
     */
    function disconnectFromPeer(peerId) {
        console.log('[P2P] Disconnecting from peer:', peerId);
        
        window.BrainscanBridge.sendInferenceCommand({
            type: 'peer_disconnect',
            peer_id: peerId
        });
        
        peerState.connectedPeers.delete(peerId);
        updatePeerUI();
    }

    /**
     * Share current EEG frame with connected peers
     */
    function shareBrainData(eegData) {
        if (peerState.connectedPeers.size === 0) return;
        
        window.BrainscanBridge.sendInferenceCommand({
            type: 'peer_share_eeg',
            eeg_data: eegData
        });
    }

    /**
     * Send chat message to connected peers
     */
    function sendChatToPeers(message) {
        if (peerState.connectedPeers.size === 0) {
            console.log('[P2P] No peers connected to send message to');
            return;
        }
        
        window.BrainscanBridge.sendInferenceCommand({
            type: 'peer_chat_message',
            content: message
        });
        
        // Add to local chat
        if (window.addChatMessage) {
            window.addChatMessage('peer', `[To Peers] ${message}`, 'both');
        }
    }

    // ==========================================
    // HANDLERS
    // ==========================================

    function handleConnectionRequest(fromPeer, fromAddr) {
        console.log('[P2P] Connection request from:', fromPeer);
        
        // Show connection request dialog
        showConnectionRequestDialog(fromPeer, fromAddr);
    }

    function handleConnectionAccepted(peerId) {
        console.log('[P2P] Connection accepted by peer:', peerId);
        
        peerState.connectedPeers.set(peerId, {
            id: peerId,
            connected: true,
            connectedAt: new Date()
        });
        
        updatePeerUI();
        
        if (window.addChatMessage) {
            window.addChatMessage('system', `Connected to peer: ${peerId.substring(0, 8)}...`, 'both');
        }
    }

    function handleConnectionRejected(peerId) {
        console.log('[P2P] Connection rejected by peer:', peerId);
        
        const peerEl = document.getElementById(`peer-${peerId}`);
        if (peerEl) {
            peerEl.classList.remove('connecting');
            peerEl.querySelector('.peer-status').textContent = 'Rejected';
        }
        
        if (window.addChatMessage) {
            window.addChatMessage('system', `Connection rejected by peer: ${peerId.substring(0, 8)}...`, 'both');
        }
    }

    function handlePeerDisconnected(peerId) {
        console.log('[P2P] Peer disconnected:', peerId);
        
        peerState.connectedPeers.delete(peerId);
        updatePeerUI();
        
        if (window.addChatMessage) {
            window.addChatMessage('system', `Peer disconnected: ${peerId.substring(0, 8)}...`, 'both');
        }
    }

    function handleBrainDataFromPeer(data) {
        console.log('[P2P] Received brain data from peer');
        
        peerState.receivedBrainData.push({
            timestamp: Date.now(),
            data: data
        });
        
        // Limit stored data
        if (peerState.receivedBrainData.length > 1000) {
            peerState.receivedBrainData.shift();
        }
        
        // Visualize peer brain data if function exists
        if (window.visualizePeerBrainData) {
            window.visualizePeerBrainData(data);
        }
    }

    function handleChatFromPeer(fromPeer, content) {
        console.log('[P2P] Chat from peer:', fromPeer, content);
        
        if (window.addChatMessage) {
            window.addChatMessage('peer', `[From ${fromPeer.substring(0, 8)}...] ${content}`, 'both');
        }
    }

    // ==========================================
    // UI UPDATES
    // ==========================================

    function updatePeerUI() {
        const peerIdDisplay = document.getElementById('local-peer-id');
        if (peerIdDisplay && peerState.localPeerId) {
            peerIdDisplay.textContent = peerState.localPeerId.substring(0, 12) + '...';
        }
        
        const connectedCount = document.getElementById('connected-peer-count');
        if (connectedCount) {
            connectedCount.textContent = peerState.connectedPeers.size;
        }
    }

    function updatePeerList(peers) {
        const peerList = document.getElementById('available-peers-list');
        if (!peerList) return;
        
        peerList.innerHTML = '';
        
        peers.forEach(peer => {
            if (peer.id === peerState.localPeerId) return; // Don't show self
            
            const peerEl = document.createElement('div');
            peerEl.id = `peer-${peer.id}`;
            peerEl.className = 'peer-item';
            peerEl.innerHTML = `
                <div class="peer-info">
                    <span class="peer-id">${peer.id.substring(0, 12)}...</span>
                    <span class="peer-status">${peer.state}</span>
                </div>
                <button class="btn btn-connect-peer" data-peer-id="${peer.id}">Connect</button>
            `;
            
            peerList.appendChild(peerEl);
        });
        
        // Add click handlers
        peerList.querySelectorAll('.btn-connect-peer').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const peerId = e.target.dataset.peerId;
                connectToPeer(peerId);
            });
        });
    }

    function showConnectionRequestDialog(fromPeer, fromAddr) {
        // Create modal dialog
        const dialog = document.createElement('div');
        dialog.className = 'p2p-dialog';
        dialog.innerHTML = `
            <div class="dialog-content">
                <h3>Connection Request</h3>
                <p>Peer <strong>${fromPeer.substring(0, 12)}...</strong> wants to connect</p>
                <p>Address: ${fromAddr}</p>
                <div class="dialog-buttons">
                    <button id="accept-peer-btn" class="btn btn-success">Accept</button>
                    <button id="reject-peer-btn" class="btn btn-danger">Reject</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        document.getElementById('accept-peer-btn').addEventListener('click', () => {
            acceptPeerConnection(fromPeer);
            dialog.remove();
        });
        
        document.getElementById('reject-peer-btn').addEventListener('click', () => {
            rejectPeerConnection(fromPeer);
            dialog.remove();
        });
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    window.BrainscanP2P = {
        init: initPeerToPeer,
        handleMessage: handlePeerMessage,
        connectToPeer,
        disconnectFromPeer,
        shareBrainData,
        sendChatToPeers,
        getConnectedPeers: () => Array.from(peerState.connectedPeers.keys()),
        getLocalPeerId: () => peerState.localPeerId,
        getReceivedBrainData: () => peerState.receivedBrainData
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================
    
    // Don't auto-initialize - brainscan-integrated.js will call init() 
    // when the WebSocket connection is established
    console.log('[P2P] Module loaded, waiting for bridge connection...');

})();
