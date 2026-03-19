use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use chrono::{DateTime, Utc};

/// QAM16 Signal for network-based spatialization (replaces EEG)
/// 16 constellation points mapped to 4 FOA quadrants (4 points per quadrant)
/// Quadrants: LFU (0-3), LBD (4-7), RBU (8-11), RFD (12-15)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QAMSignal {
    pub timestamp: DateTime<Utc>,
    pub frame: u64,
    pub constellation: Vec<f64>, // 16 QAM constellation points (0.0-1.0)
    pub snr: f64, // Signal-to-noise ratio in dB
    pub signal_strength: f64, // 0.0-1.0
    pub noise_floor: f64, // 0.0-1.0
    // FOA quadrant values (derived from constellation)
    pub lfu_quadrant: f64,
    pub lbd_quadrant: f64,
    pub rbu_quadrant: f64,
    pub rfd_quadrant: f64,
    // Spatialization results
    pub ambisonic_w: f64,
    pub ambisonic_x: f64,
    pub ambisonic_y: f64,
    pub ambisonic_z: f64,
    pub coherence: f64,
    pub impedance_z: f64,
    // Hemisphere processing
    pub left_hemisphere: Vec<f64>, // 8 points (LFU + LBD)
    pub right_hemisphere: Vec<f64>, // 8 points (RBU + RFD)
    pub left_coherence: f64,
    pub right_coherence: f64,
}

impl QAMSignal {
    pub fn new(frame: u64) -> Self {
        Self {
            timestamp: Utc::now(),
            frame,
            constellation: vec![0.5; 16], // Default mid-scale
            snr: 10.0,
            signal_strength: 0.5,
            noise_floor: 0.1,
            lfu_quadrant: 0.5,
            lbd_quadrant: 0.5,
            rbu_quadrant: 0.5,
            rfd_quadrant: 0.5,
            ambisonic_w: 0.0,
            ambisonic_x: 0.0,
            ambisonic_y: 0.0,
            ambisonic_z: 0.0,
            coherence: 0.5,
            impedance_z: 50.0,
            left_hemisphere: vec![0.5; 8],
            right_hemisphere: vec![0.5; 8],
            left_coherence: 0.5,
            right_coherence: 0.5,
        }
    }
    
    /// Extract quadrant values from constellation
    pub fn compute_quadrants(&mut self) {
        // LFU: points 0-3
        self.lfu_quadrant = self.constellation[0..4].iter().sum::<f64>() / 4.0;
        // LBD: points 4-7
        self.lbd_quadrant = self.constellation[4..8].iter().sum::<f64>() / 4.0;
        // RBU: points 8-11
        self.rbu_quadrant = self.constellation[8..12].iter().sum::<f64>() / 4.0;
        // RFD: points 12-16
        self.rfd_quadrant = self.constellation[12..16].iter().sum::<f64>() / 4.0;
        
        // Populate hemisphere vectors
        self.left_hemisphere.clear();
        self.left_hemisphere.extend_from_slice(&self.constellation[0..8]);
        self.right_hemisphere.clear();
        self.right_hemisphere.extend_from_slice(&self.constellation[8..16]);
    }
    
    /// Compute FOA ambisonic components using Hadamard matrix coefficients
    pub fn compute_ambisonic(&mut self) {
        // W = -(LFU + LBD + RBU + RFD) / 4
        self.ambisonic_w = -(self.lfu_quadrant + self.lbd_quadrant + 
                            self.rbu_quadrant + self.rfd_quadrant) / 4.0;
        
        // X = 2.83 * (-LFU + LBD + RBU - RFD) / 4
        self.ambisonic_x = 2.83 * (-self.lfu_quadrant + self.lbd_quadrant + 
                                   self.rbu_quadrant - self.rfd_quadrant) / 4.0;
        
        // Y = 2.83 * (-LFU - LBD + RBU + RFD) / 4
        self.ambisonic_y = 2.83 * (-self.lfu_quadrant - self.lbd_quadrant + 
                                   self.rbu_quadrant + self.rfd_quadrant) / 4.0;
        
        // Z = 2.83 * (-LFU + LBD - RBU + RFD) / 4 (with coherence modulation)
        self.ambisonic_z = 2.83 * (-self.lfu_quadrant + self.lbd_quadrant - 
                                   self.rbu_quadrant + self.rfd_quadrant) / 4.0;
        
        // Coherence based on amplitude consistency
        let amplitudes = [
            (self.constellation[0] - 0.5).abs() + (self.constellation[1] - 0.5).abs(),
            (self.constellation[2] - 0.5).abs() + (self.constellation[3] - 0.5).abs(),
            (self.constellation[4] - 0.5).abs() + (self.constellation[5] - 0.5).abs(),
            (self.constellation[6] - 0.5).abs() + (self.constellation[7] - 0.5).abs(),
        ];
        let avg_amp = amplitudes.iter().sum::<f64>() / 4.0;
        self.coherence = (avg_amp * 2.0).min(1.0);
        self.impedance_z = (1.0 - self.coherence) * 100.0;
    }
}

/// Legacy EEG Signal Features (for backward compatibility)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalFeatures {
    pub timestamp: DateTime<Utc>,
    pub frame: u64,
    pub eeg_channels: Vec<f64>, // 8 channels
    pub octonion_output: Vec<f64>, // 8 basis elements
    pub ambisonic_w: f64,
    pub ambisonic_x: f64,
    pub ambisonic_y: f64,
    pub ambisonic_z: f64,
    pub coherence: f64,
    pub impedance_z: f64,
    pub diode_voltage: f64,
    pub spatial_magnitude: f64,
    pub spatial_phase: f64,
    // Hemisphere-specific features
    pub left_hemisphere: Vec<f64>,
    pub right_hemisphere: Vec<f64>,
    pub coherence_left: f64,
    pub coherence_right: f64,
}

/// Coherence states determine model routing
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CoherenceState {
    High,
    Medium,
    Low,
}

/// Hemisphere assignments
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Hemisphere {
    Left,
    Right,
    Both,
}

/// Inference result from AI model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceResult {
    pub model_name: String,
    pub timestamp: DateTime<Utc>,
    pub predicted_class: String,
    pub confidence: f64,
    pub class_probabilities: HashMap<String, f64>,
    pub attention_weights: Vec<f64>,
    pub hemisphere: Hemisphere,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Model assignment per hemisphere
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HemisphereConfig {
    pub hemisphere: Hemisphere,
    pub model_id: String,
    pub purpose: String, // e.g., "pattern", "anomaly", "language"
    pub temperature: f64,
    pub max_tokens: u32,
}

/// LMStudio API Request
#[derive(Debug, Clone, Serialize)]
pub struct LMStudioRequest {
    pub model: String,
    pub messages: Vec<LMStudioMessage>,
    pub temperature: f64,
    pub max_tokens: u32,
    pub stream: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LMStudioMessage {
    pub role: String,
    pub content: String,
}

/// LMStudio API Response
#[derive(Debug, Clone, Deserialize)]
pub struct LMStudioResponse {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<LMStudioChoice>,
    pub usage: Option<LMStudioUsage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LMStudioChoice {
    pub index: u32,
    pub message: LMStudioMessage,
    pub finish_reason: Option<String>,
}

/// Ambisonic components for QAM spatialization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AmbisonicMessage {
    pub w: f64, // Omnidirectional
    pub x: f64, // Left-right  
    pub y: f64, // Front-back
    pub z: f64, // Up-down (Z-vector)
}

/// FOA quadrant values for QAM constellation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuadrantValues {
    pub lfu: f64, // Left Front Up
    pub lbd: f64, // Left Back Down
    pub rbu: f64, // Right Back Up
    pub rfd: f64, // Right Front Down
}

#[derive(Debug, Clone, Deserialize)]
pub struct LMStudioUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// EEG Frame from bridge server
#[derive(Debug, Clone, Deserialize)]
pub struct EEGFrame {
    pub channels: Vec<f64>,
    pub timestamp: i64,
    pub frame: u64,
}

/// Browser client message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "get_stats")]
    GetStats,
    #[serde(rename = "set_model")]
    SetModel { hemisphere: Hemisphere, model_id: String },
    #[serde(rename = "set_comparator_model")]
    SetComparatorModel { model_id: String },
    #[serde(rename = "chat_message")]
    ChatMessage { message: String, hemisphere: Option<Hemisphere>, mode: Option<String> },
    #[serde(rename = "get_models")]
    GetModels,
    #[serde(rename = "start_eeg")]
    StartEEG { source_type: String, sample_rate: Option<u32> },
    #[serde(rename = "stop_eeg")]
    StopEEG,
    #[serde(rename = "get_pipeline_status")]
    GetPipelineStatus,
    #[serde(rename = "clear_cache")]
    ClearCache,
    #[serde(rename = "get_cache_stats")]
    GetCacheStats,
    
    // OPTIMIZATION: Batch message handling for WebSocket efficiency
    #[serde(rename = "batch")]
    Batch { messages: Vec<ClientMessage> },
    
    // Peer-to-peer messaging
    #[serde(rename = "get_peer_id")]
    GetPeerId,
    #[serde(rename = "get_peer_list")]
    GetPeerList,
    #[serde(rename = "peer_connect_request")]
    PeerConnectRequest { target_peer: String },
    #[serde(rename = "peer_accept_connection")]
    PeerAcceptConnection { peer_id: String },
    #[serde(rename = "peer_reject_connection")]
    PeerRejectConnection { peer_id: String },
    #[serde(rename = "peer_disconnect")]
    PeerDisconnect { peer_id: String },
    #[serde(rename = "peer_share_eeg")]
    PeerShareEeg { eeg_data: serde_json::Value },
    #[serde(rename = "peer_chat_message")]
    PeerChatMessage { content: String },
}

/// Server message types
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "pong")]
    Pong,
    #[serde(rename = "inference_result")]
    InferenceResult {
        timestamp: DateTime<Utc>,
        model: String,
        confidence: f64,
        predicted_class: String,
        probabilities: HashMap<String, f64>,
        attention_points: Vec<AttentionPoint>,
        coherence: f64,
        impedance: f64,
        latency_ms: f64,
        hemisphere: Hemisphere,
        metadata: Option<HashMap<String, serde_json::Value>>,
    },
    #[serde(rename = "statistics")]
    Statistics {
        total_frames: u64,
        routing: HashMap<String, u64>,
        avg_coherence: f64,
        available_models: Vec<String>,
        hemisphere_configs: Vec<HemisphereConfig>,
    },
    #[serde(rename = "chat_response")]
    ChatResponse {
        message: String,
        model: String,
        hemisphere: Hemisphere,
    },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "models_list")]
    ModelsList { models: Vec<String> },
    #[serde(rename = "pipeline_status")]
    PipelineStatus {
        eeg_running: bool,
        eeg_source_type: Option<String>,
        inference_active: bool,
        lmstudio_connected: bool,
        connected_clients: usize,
    },
    #[serde(rename = "eeg_frame")]
    EEGFrame {
        channels: Vec<f64>,
        timestamp: i64,
        frame: u64,
    },
    #[serde(rename = "qam_signal")]
    QAMSignalMessage {
        constellation: Vec<f64>, // 16 QAM constellation points
        snr: f64,
        signal_strength: f64,
        coherence: f64,
        impedance_z: f64,
        ambisonic: AmbisonicMessage,
        quadrants: QuadrantValues,
        timestamp: i64,
        frame: u64,
    },
    #[serde(rename = "cache_stats")]
    CacheStats {
        hits: u64,
        misses: u64,
        evictions: u64,
        size: usize,
        hit_rate: f64,
    },
    #[serde(rename = "cache_cleared")]
    CacheCleared,
    
    // Peer-to-peer server messages
    #[serde(rename = "peer_message")]
    PeerMessage {
        subtype: String,
        peer_id: Option<String>,
        peer_addr: Option<SocketAddr>,
        peers: Option<Vec<PeerInfo>>,
        from_peer: Option<String>,
        content: Option<String>,
        data: Option<serde_json::Value>,
        eeg_data: Option<serde_json::Value>,
    },
}

#[derive(Debug, Clone, Serialize)]
pub struct PeerInfo {
    pub id: String,
    pub addr: SocketAddr,
    pub state: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AttentionPoint {
    pub channel: String,
    pub position: [f64; 3],
    pub attention: f64,
    pub index: usize,
}

/// Configuration for the bridge
#[derive(Debug, Clone, Deserialize)]
pub struct BridgeConfig {
    pub eeg_ws_url: String,
    pub lmstudio_url: String,
    pub inference_port: u16,
    pub default_models: HashMap<String, String>, // hemisphere -> model_id
    pub coherence_threshold_high: f64,
    pub coherence_threshold_low: f64,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        let mut default_models = HashMap::new();
        default_models.insert("left".to_string(), "local-model".to_string());
        default_models.insert("right".to_string(), "local-model".to_string());
        
        Self {
            eeg_ws_url: "ws://localhost:8765".to_string(),
            lmstudio_url: "http://localhost:1234".to_string(),
            inference_port: 8766,
            default_models,
            coherence_threshold_high: 0.7,
            coherence_threshold_low: 0.3,
        }
    }
}
