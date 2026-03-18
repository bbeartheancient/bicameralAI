use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::info;

/// Peer connection state
#[derive(Debug, Clone, PartialEq)]
pub enum PeerState {
    Idle,
    Connecting,
    Connected,
    Disconnected,
}

/// Peer information
#[derive(Debug, Clone)]
pub struct PeerInfo {
    pub id: String,
    pub addr: SocketAddr,
    pub state: PeerState,
    pub connected_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Message types for peer-to-peer communication
#[derive(Debug, Clone)]
pub enum PeerMessage {
    // Signaling messages
    Offer { sdp: String },
    Answer { sdp: String },
    IceCandidate { candidate: String },
    
    // Brain data messages
    EEGFrame { channels: Vec<f64>, timestamp: i64 },
    ChatMessage { content: String, from: String },
    InferenceResult { result: String, confidence: f64 },
    
    // Control messages
    ConnectRequest { peer_id: String },
    ConnectResponse { accepted: bool },
    Disconnect,
}

/// Simple peer-to-peer connection manager
/// This is a simplified implementation that demonstrates the P2P concept
/// Full WebRTC implementation can be added later
pub struct PeerConnectionManager {
    peers: Arc<RwLock<HashMap<String, PeerInfo>>>,
    local_peer_id: String,
    message_tx: mpsc::Sender<(String, PeerMessage)>,
}

impl PeerConnectionManager {
    pub fn new() -> (Self, mpsc::Receiver<(String, PeerMessage)>) {
        let local_peer_id = format!("peer_{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("unknown"));
        let (message_tx, message_rx) = mpsc::channel(100);
        
        let manager = Self {
            peers: Arc::new(RwLock::new(HashMap::new())),
            local_peer_id,
            message_tx,
        };
        
        info!("Created peer connection manager with ID: {}", manager.local_peer_id);
        
        (manager, message_rx)
    }
    
    pub fn get_local_peer_id(&self) -> String {
        self.local_peer_id.clone()
    }
    
    /// Add a discovered peer
    pub async fn add_peer(&self, peer_id: String, addr: SocketAddr) {
        let mut peers = self.peers.write().await;
        
        if !peers.contains_key(&peer_id) {
            let peer_info = PeerInfo {
                id: peer_id.clone(),
                addr,
                state: PeerState::Idle,
                connected_at: None,
            };
            peers.insert(peer_id.clone(), peer_info);
            info!("Added peer {} at {:?}", peer_id, addr);
        }
    }
    
    /// Remove a peer
    pub async fn remove_peer(&self, peer_id: &str) {
        let mut peers = self.peers.write().await;
        if peers.remove(peer_id).is_some() {
            info!("Removed peer {}", peer_id);
        }
    }
    
    /// Get list of available peers
    pub async fn get_available_peers(&self) -> Vec<PeerInfo> {
        let peers = self.peers.read().await;
        peers.values().cloned().collect()
    }
    
    /// Initiate connection to a peer
    pub async fn connect_to_peer(&self, peer_id: String) -> Result<(), String> {
        info!("Initiating connection to peer {}", peer_id);
        
        let mut peers = self.peers.write().await;
        if let Some(peer) = peers.get_mut(&peer_id) {
            peer.state = PeerState::Connecting;
            
            // Send connection request
            let _msg = PeerMessage::ConnectRequest {
                peer_id: self.local_peer_id.clone(),
            };
            
            // In a real implementation, this would send through WebRTC
            // For now, we just update the state
            info!("Connection request sent to peer {}", peer_id);
            Ok(())
        } else {
            Err(format!("Peer {} not found", peer_id))
        }
    }
    
    /// Accept connection from a peer
    pub async fn accept_connection(&self, peer_id: String) -> Result<(), String> {
        let mut peers = self.peers.write().await;
        if let Some(peer) = peers.get_mut(&peer_id) {
            peer.state = PeerState::Connected;
            peer.connected_at = Some(chrono::Utc::now());
            
            info!("Accepted connection from peer {}", peer_id);
            Ok(())
        } else {
            Err(format!("Peer {} not found", peer_id))
        }
    }
    
    /// Disconnect from a peer
    pub async fn disconnect_peer(&self, peer_id: &str) {
        let mut peers = self.peers.write().await;
        if let Some(peer) = peers.get_mut(peer_id) {
            peer.state = PeerState::Disconnected;
            peer.connected_at = None;
            info!("Disconnected from peer {}", peer_id);
        }
    }
    
    /// Send a message to a specific peer
    pub async fn send_to_peer(&self, peer_id: &str, message: PeerMessage) -> Result<(), String> {
        let peers = self.peers.read().await;
        if let Some(peer) = peers.get(peer_id) {
            if peer.state == PeerState::Connected {
                // In a real implementation, this would send through WebRTC data channel
                info!("Sending message to peer {}: {:?}", peer_id, message);
                
                // For now, just echo the message back to the message channel
                // This simulates receiving the message from the peer
                let tx = self.message_tx.clone();
                let peer_id_clone = peer_id.to_string();
                tokio::spawn(async move {
                    let _ = tx.send((peer_id_clone, message)).await;
                });
                
                Ok(())
            } else {
                Err(format!("Peer {} is not connected", peer_id))
            }
        } else {
            Err(format!("Peer {} not found", peer_id))
        }
    }
    
    /// Broadcast a message to all connected peers
    pub async fn broadcast(&self, message: PeerMessage) -> Vec<(String, Result<(), String>)> {
        let peers = self.peers.read().await;
        let connected_peers: Vec<String> = peers
            .iter()
            .filter(|(_, peer)| peer.state == PeerState::Connected)
            .map(|(id, _)| id.clone())
            .collect();
        drop(peers);
        
        let mut results = Vec::new();
        for peer_id in connected_peers {
            let result = self.send_to_peer(&peer_id, message.clone()).await;
            results.push((peer_id, result));
        }
        
        results
    }
    
    /// Share EEG data with connected peers
    pub async fn share_eeg_frame(&self, channels: Vec<f64>, timestamp: i64) {
        let message = PeerMessage::EEGFrame { channels, timestamp };
        let results = self.broadcast(message).await;
        
        let success_count = results.iter().filter(|(_, r)| r.is_ok()).count();
        if success_count > 0 {
            info!("Shared EEG frame with {} peers", success_count);
        }
    }
    
    /// Share a chat message with connected peers
    pub async fn share_chat_message(&self, content: String) {
        let message = PeerMessage::ChatMessage {
            content,
            from: self.local_peer_id.clone(),
        };
        let results = self.broadcast(message).await;
        
        let success_count = results.iter().filter(|(_, r)| r.is_ok()).count();
        info!("Shared chat message with {} peers", success_count);
    }
    
    /// Get connection statistics
    pub async fn get_stats(&self) -> PeerConnectionStats {
        let peers = self.peers.read().await;
        let total = peers.len();
        let connected = peers.values().filter(|p| p.state == PeerState::Connected).count();
        let connecting = peers.values().filter(|p| p.state == PeerState::Connecting).count();
        
        PeerConnectionStats {
            local_peer_id: self.local_peer_id.clone(),
            total_peers: total,
            connected_peers: connected,
            connecting_peers: connecting,
        }
    }
}

/// Peer connection statistics
#[derive(Debug, Clone)]
pub struct PeerConnectionStats {
    pub local_peer_id: String,
    pub total_peers: usize,
    pub connected_peers: usize,
    pub connecting_peers: usize,
}

/// WebRTC peer connection (placeholder for future full implementation)
#[cfg(feature = "webrtc-support")]
pub struct WebRTCPeerConnection {
    // This would contain the actual WebRTC peer connection
    // when the webrtc feature is enabled
}

#[cfg(feature = "webrtc-support")]
impl WebRTCPeerConnection {
    pub async fn new() -> anyhow::Result<Self> {
        // Full WebRTC implementation would go here
        // including RTCPeerConnection, data channels, etc.
        todo!("Full WebRTC implementation pending")
    }
}
