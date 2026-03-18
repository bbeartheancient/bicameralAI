use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use chrono::{DateTime, Utc};

/// EEG Signal Features extracted from 8-channel input
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
    ChatMessage { message: String, hemisphere: Option<Hemisphere> },
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
