use crate::types::*;
use crate::spatialization::SpatializedEEG;
use crate::eeg_source::EEGSourceManager;
use crate::lmstudio::LMStudioClient;
use crate::query_cache::{QueryCache, generate_cache_key};
use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message;
use tracing::{error, info};

/// Chat query to be processed by models
#[derive(Debug, Clone)]
pub struct ChatQuery {
    pub message: String,
    pub hemisphere: Hemisphere,
    pub client_addr: SocketAddr,
    pub query_id: String,
}

/// Pending query waiting for both hemisphere responses
#[derive(Debug)]
struct PendingQuery {
    left_response: Option<String>,
    right_response: Option<String>,
    left_model: String,
    right_model: String,
}

impl PendingQuery {
    fn new(_query: ChatQuery, left_model: String, right_model: String) -> Self {
        Self {
            left_response: None,
            right_response: None,
            left_model,
            right_model,
        }
    }
    
    fn is_complete(&self) -> bool {
        self.left_response.is_some() && self.right_response.is_some()
    }
    
    fn set_response(&mut self, hemisphere: Hemisphere, response: String) {
        match hemisphere {
            Hemisphere::Left => self.left_response = Some(response),
            Hemisphere::Right => self.right_response = Some(response),
            Hemisphere::Both => {
                // For single "both" responses, treat as combined
                self.left_response = Some(response.clone());
                self.right_response = Some(response);
            }
        }
    }
}

/// WebSocket server for browser clients
#[derive(Clone)]
pub struct InferenceServer {
    clients: Arc<RwLock<HashMap<SocketAddr, mpsc::UnboundedSender<ServerMessage>>>>,
    peer_ids: Arc<RwLock<HashMap<SocketAddr, String>>>, // Maps client address to peer ID
    eeg_manager: Arc<RwLock<EEGSourceManager>>,
    lmstudio_models: Arc<RwLock<Vec<String>>>,
    lmstudio_client: Arc<RwLock<LMStudioClient>>,
    last_spatialized: Arc<RwLock<Option<SpatializedEEG>>>,
    left_model: Arc<RwLock<String>>,
    right_model: Arc<RwLock<String>>,
    comparator_model: Arc<RwLock<String>>,
    chat_tx: mpsc::Sender<ChatQuery>,
    config: BridgeConfig,
    pending_queries: Arc<RwLock<HashMap<String, PendingQuery>>>,
    query_cache: Arc<QueryCache<ChatResponseCacheEntry>>,
}

/// Cache entry for chat responses
#[derive(Debug, Clone)]
struct ChatResponseCacheEntry {
    response: String,
    model: String,
    hemisphere: Hemisphere,
}

impl InferenceServer {
    pub fn new(
        config: BridgeConfig,
        lmstudio_client: Arc<RwLock<LMStudioClient>>,
    ) -> (Self, mpsc::Receiver<ChatQuery>) {
        let left_model = config.default_models.get("left")
            .cloned()
            .unwrap_or_else(|| "local-model".to_string());
        let right_model = config.default_models.get("right")
            .cloned()
            .unwrap_or_else(|| "local-model".to_string());
        // Use left model as default comparator, can be overridden
        let comparator_model = config.default_models.get("comparator")
            .cloned()
            .or_else(|| config.default_models.get("left").cloned())
            .unwrap_or_else(|| "local-model".to_string());
        
        let (chat_tx, chat_rx) = mpsc::channel(100);
        
        // Initialize query cache with 5-minute TTL
        let query_cache = Arc::new(QueryCache::new(300));
        
        let server = Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            peer_ids: Arc::new(RwLock::new(HashMap::new())),
            eeg_manager: Arc::new(RwLock::new(EEGSourceManager::new())),
            lmstudio_models: Arc::new(RwLock::new(Vec::new())),
            lmstudio_client,
            last_spatialized: Arc::new(RwLock::new(None)),
            left_model: Arc::new(RwLock::new(left_model)),
            right_model: Arc::new(RwLock::new(right_model)),
            comparator_model: Arc::new(RwLock::new(comparator_model)),
            chat_tx,
            config,
            pending_queries: Arc::new(RwLock::new(HashMap::new())),
            query_cache,
        };
        
        (server, chat_rx)
    }

    /// Start EEG streaming with spatialization
    pub async fn start_eeg_pipeline(&self) -> Result<tokio::task::JoinHandle<()>> {
        let clients = self.clients.clone();
        let last_spatialized = self.last_spatialized.clone();
        let eeg_manager = self.eeg_manager.clone();
        
        // Create channel for internal EEG frame forwarding
        let (frame_tx, mut frame_rx) = mpsc::channel::<crate::types::EEGFrame>(1000);
        
        // Start simulated EEG
        {
            let mut manager = eeg_manager.write().await;
            let forward_fn = move |frame| {
                let tx = frame_tx.clone();
                tokio::spawn(async move {
                    let _ = tx.send(frame).await;
                });
            };
            manager.start_simulated(256, forward_fn).await?;
        }
        
        // Process frames through spatialization matrix
        let handle = tokio::spawn(async move {
            let mut matrix = crate::spatialization::SpatializationMatrix::new();
            let mut metrics = crate::compute_metrics::ComputeMetrics::new();
            let mut frame_count = 0u64;
            let mut last_broadcast_time = std::time::Instant::now();
            let mut last_metrics_report = std::time::Instant::now();
            
            while let Some(frame) = frame_rx.recv().await {
                let start = std::time::Instant::now();
                frame_count += 1;
                
                // Process through spatialization matrix (optimized)
                let spatialized = matrix.process(&frame);
                
                // Record metrics
                let processing_time = start.elapsed();
                metrics.record_frame(processing_time);
                
                // Store for chat context
                {
                    let mut ls = last_spatialized.write().await;
                    *ls = Some(spatialized.clone());
                }
                
                // Throttle broadcasts to ~60 FPS (every 4th frame at 256 Hz)
                let should_broadcast = frame_count % 4 == 0;
                
                if should_broadcast {
                    // Broadcast to clients for visualization
                    let msg = ServerMessage::EEGFrame {
                        channels: spatialized.normalized_channels.clone(),
                        timestamp: frame.timestamp,
                        frame: frame.frame,
                    };
                    
                    let clients_read = clients.read().await;
                    let _client_count = clients_read.len();
                    
                    // Send to all clients
                    let mut disconnected = Vec::new();
                    for (addr, tx) in clients_read.iter() {
                        if tx.send(msg.clone()).is_err() {
                            disconnected.push(*addr);
                        }
                    }
                    drop(clients_read);
                    
                    if !disconnected.is_empty() {
                        let mut clients_write = clients.write().await;
                        for addr in disconnected {
                            clients_write.remove(&addr);
                        }
                    }
                }
                
                // Log every 256 frames with metrics
                if frame_count % 256 == 0 {
                    let elapsed = last_broadcast_time.elapsed().as_secs_f64();
                    let fps = 256.0 / elapsed;
                    let avg_time = metrics.avg_frame_time().as_micros();
                    let p95 = metrics.p95_latency_ms();
                    
                    info!(
                        "EEG Pipeline: {} frames, {:.1} FPS, avg {:.0}µs/frame, P95 {:.2}ms, {} clients",
                        frame_count, fps, avg_time, p95, clients.read().await.len()
                    );
                    
                    // Print optimization suggestions every 10 seconds
                    if last_metrics_report.elapsed().as_secs() > 10 {
                        let suggestions = crate::compute_metrics::OptimizationAdvisor::suggest(fps, p95);
                        for suggestion in suggestions {
                            info!("Optimization: {}", suggestion);
                        }
                        last_metrics_report = std::time::Instant::now();
                    }
                    
                    last_broadcast_time = std::time::Instant::now();
                }
            }
            
            info!("EEG pipeline task ended after {} frames", frame_count);
        });
        
        Ok(handle)
    }

    /// Start the chat processing task with comparator support
    pub async fn start_chat_processor(&self, mut rx: mpsc::Receiver<ChatQuery>) {
        let clients = self.clients.clone();
        let last_spatialized = self.last_spatialized.clone();
        let lmstudio_client = self.lmstudio_client.clone();
        let left_model = self.left_model.clone();
        let right_model = self.right_model.clone();
        let comparator_model = self.comparator_model.clone();
        let pending_queries = self.pending_queries.clone();
        let query_cache = self.query_cache.clone();
        
        tokio::spawn(async move {
            while let Some(query) = rx.recv().await {
                let hemisphere = query.hemisphere;
                let client_addr = query.client_addr;
                let query_id = query.query_id.clone();
                
                // For "Both" hemisphere queries, we need to query both models and synthesize
                if hemisphere == Hemisphere::Both {
                    // Create a pending query entry
                    let left_m = left_model.read().await.clone();
                    let right_m = right_model.read().await.clone();
                    let pending = PendingQuery::new(query.clone(), left_m.clone(), right_m.clone());
                    
                    {
                        let mut pending_map = pending_queries.write().await;
                        pending_map.insert(query_id.clone(), pending);
                    }
                    
                    // Send both hemisphere queries
                    let left_query = ChatQuery {
                        message: query.message.clone(),
                        hemisphere: Hemisphere::Left,
                        client_addr,
                        query_id: format!("{}_left", query_id),
                    };
                    
                    let right_query = ChatQuery {
                        message: query.message.clone(),
                        hemisphere: Hemisphere::Right,
                        client_addr,
                        query_id: format!("{}_right", query_id),
                    };
                    
                    // Process both queries
                    tokio::spawn(process_hemisphere_query(
                        left_query,
                        left_m,
                        clients.clone(),
                        last_spatialized.clone(),
                        lmstudio_client.clone(),
                        pending_queries.clone(),
                        query_id.clone(),
                        Hemisphere::Left,
                        query_cache.clone(),
                    ));
                    
                    tokio::spawn(process_hemisphere_query(
                        right_query,
                        right_m,
                        clients.clone(),
                        last_spatialized.clone(),
                        lmstudio_client.clone(),
                        pending_queries.clone(),
                        query_id.clone(),
                        Hemisphere::Right,
                        query_cache.clone(),
                    ));
                    
                    // Spawn comparator task that waits for both responses
                    let comp_model = comparator_model.read().await.clone();
                    tokio::spawn(process_comparator(
                        query_id,
                        query.message,
                        client_addr,
                        comp_model,
                        clients.clone(),
                        lmstudio_client.clone(),
                        pending_queries.clone(),
                        query_cache.clone(),
                    ));
                } else {
                    // Single hemisphere query - process directly
                    let model = match hemisphere {
                        Hemisphere::Left => left_model.read().await.clone(),
                        Hemisphere::Right => right_model.read().await.clone(),
                        Hemisphere::Both => unreachable!(),
                    };
                    
                    process_single_query(
                        query,
                        model,
                        clients.clone(),
                        last_spatialized.clone(),
                        lmstudio_client.clone(),
                        query_cache.clone(),
                    ).await;
                }
            }
        });
    }

    /// Start the WebSocket server
    pub async fn run(&self) -> Result<()> {
        let addr = format!("0.0.0.0:{}", self.config.inference_port);
        let listener = tokio::net::TcpListener::bind(&addr).await?;
        
        info!("Inference server listening on {}", addr);

        loop {
            let (stream, addr) = listener.accept().await?;
            let clients = self.clients.clone();
            let peer_ids = self.peer_ids.clone();
            let eeg_manager = self.eeg_manager.clone();
            let lmstudio_models = self.lmstudio_models.clone();
            let chat_tx = self.chat_tx.clone();
            let left_model = self.left_model.clone();
            let right_model = self.right_model.clone();
            let comparator_model = self.comparator_model.clone();
            let query_cache = self.query_cache.clone();

            tokio::spawn(async move {
                if let Err(e) = handle_client(
                    stream, 
                    addr, 
                    clients, 
                    peer_ids,
                    eeg_manager,
                    lmstudio_models,
                    chat_tx,
                    left_model,
                    right_model,
                    comparator_model,
                    query_cache,
                ).await {
                    error!("Client {} error: {}", addr, e);
                }
            });
        }
    }

    /// Set available models from LMStudio and configure models
    pub async fn set_lmstudio_models(&self, models: Vec<String>) {
        let mut lmstudio_models = self.lmstudio_models.write().await;
        *lmstudio_models = models.clone();
        drop(lmstudio_models);
        
        // Ensure comparator model is valid - use first available model if needed
        if !models.is_empty() {
            let comparator = self.comparator_model.read().await.clone();
            let needs_update = comparator == "local-model" || !models.contains(&comparator);
            
            if needs_update {
                let first_model = models[0].clone();
                let mut comp = self.comparator_model.write().await;
                *comp = first_model.clone();
                info!("Set comparator model to: {} (was: {})", first_model, comparator);
            }
        }
    }

    /// Broadcast message to all clients
    pub async fn broadcast(&self, message: ServerMessage) {
        let clients = self.clients.read().await;
        let mut disconnected = Vec::new();

        for (addr, tx) in clients.iter() {
            if tx.send(message.clone()).is_err() {
                disconnected.push(*addr);
            }
        }

        drop(clients);

        if !disconnected.is_empty() {
            let mut clients = self.clients.write().await;
            for addr in disconnected {
                clients.remove(&addr);
                info!("Client {} removed (send failed)", addr);
            }
        }
    }

    /// Get number of connected clients
    pub async fn client_count(&self) -> usize {
        self.clients.read().await.len()
    }
}

/// Process a single hemisphere query
async fn process_hemisphere_query(
    query: ChatQuery,
    model: String,
    clients: Arc<RwLock<HashMap<SocketAddr, mpsc::UnboundedSender<ServerMessage>>>>,
    last_spatialized: Arc<RwLock<Option<SpatializedEEG>>>,
    lmstudio_client: Arc<RwLock<LMStudioClient>>,
    pending_queries: Arc<RwLock<HashMap<String, PendingQuery>>>,
    parent_query_id: String,
    target_hemisphere: Hemisphere,
    query_cache: Arc<QueryCache<ChatResponseCacheEntry>>,
) {
    let client_addr = query.client_addr;
    let hemisphere = query.hemisphere;
    
    // Generate cache key for hemisphere query
    let cache_key = generate_cache_key(
        &query.message,
        &format!("{:?}", hemisphere).to_lowercase(),
        &model,
        "",  // Not used for single hemisphere
        ""   // Not used for single hemisphere
    );
    
    // Check cache first
    if let Some(cached_entry) = query_cache.get(&cache_key).await {
        info!("Cache hit for hemisphere query: {}", query.message.chars().take(50).collect::<String>());
        
        // Clone values for reuse
        let response = cached_entry.response.clone();
        let model = cached_entry.model.clone();
        let hemisphere = cached_entry.hemisphere;
        
        // Send cached response
        let clients_read = clients.read().await;
        if let Some(tx) = clients_read.get(&client_addr) {
            let chat_msg = ServerMessage::ChatResponse {
                message: response.clone(),
                model: model.clone(),
                hemisphere,
            };
            let _ = tx.send(chat_msg);
        }
        
        // Store in pending for comparator
        {
            let mut pending_map = pending_queries.write().await;
            if let Some(pending) = pending_map.get_mut(&parent_query_id) {
                pending.set_response(target_hemisphere, response);
            }
        }
        return;
    }
    
    // Get EEG context
    let eeg_context = {
        let ls = last_spatialized.read().await;
        ls.clone()
    };
    
    // Create system prompt
    let system_prompt = match hemisphere {
        Hemisphere::Left => {
            "You are the LEFT hemisphere of a bicameral brain. \
            You process analytically, verbally, with details and logic. \
            You are connected to EEG channels F3 (frontal), C3 (central), P3 (parietal), P7 (temporal). \
            When answering, approach problems sequentially and methodically. \
            Provide your perspective on the query."
        }
        Hemisphere::Right => {
            "You are the RIGHT hemisphere of a bicameral brain. \
            You process holistically, intuitively, with patterns and creativity. \
            You are connected to EEG channels F4 (frontal), C4 (central), PZ (parietal midline), P8 (temporal). \
            When answering, look for patterns and big-picture connections. \
            Provide your perspective on the query."
        }
        Hemisphere::Both => unreachable!(),
    };
    
    // Build user message
    let user_message = if let Some(ref spatialized) = eeg_context {
        format!(
            "{}\n\nCurrent brain state context:\n\
            Your hemisphere coherence: {:.2}\n\
            Dominant hemisphere: {}",
            query.message,
            if hemisphere == Hemisphere::Left { spatialized.left_coherence } else { spatialized.right_coherence },
            if spatialized.left_coherence > spatialized.right_coherence { "Left" } else { "Right" }
        )
    } else {
        query.message.clone()
    };
    
    // Send "thinking" status
    {
        let clients_read = clients.read().await;
        if let Some(tx) = clients_read.get(&client_addr) {
            let status_msg = ServerMessage::InferenceResult {
                timestamp: chrono::Utc::now(),
                model: model.clone(),
                confidence: 0.0,
                predicted_class: "thinking".to_string(),
                probabilities: HashMap::new(),
                attention_points: vec![],
                coherence: if let Some(ref s) = eeg_context { s.coherence } else { 0.0 },
                impedance: 0.0,
                latency_ms: 0.0,
                hemisphere,
                metadata: Some({
                    let mut m = HashMap::new();
                    m.insert("status".to_string(), serde_json::json!("processing"));
                    m.insert("query".to_string(), serde_json::json!(query.message));
                    m.insert("parent_query_id".to_string(), serde_json::json!(parent_query_id.clone()));
                    m
                }),
            };
            let _ = tx.send(status_msg);
        }
    }
    
    // Query LMStudio
    let lmstudio = lmstudio_client.read().await;
    let messages = vec![
        crate::types::LMStudioMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        },
        crate::types::LMStudioMessage {
            role: "user".to_string(),
            content: user_message,
        },
    ];
    
    let response = match lmstudio.chat_completion(&model, messages, 0.7, 2048).await {
        Ok(resp) => {
            // Cache the response
            let cache_entry = ChatResponseCacheEntry {
                response: resp.clone(),
                model: model.clone(),
                hemisphere,
            };
            query_cache.insert(cache_key, cache_entry).await;
            
            // Send individual hemisphere response to client
            let clients_read = clients.read().await;
            if let Some(tx) = clients_read.get(&client_addr) {
                let chat_msg = ServerMessage::ChatResponse {
                    message: resp.clone(),
                    model: model.clone(),
                    hemisphere,
                };
                let _ = tx.send(chat_msg);
            }
            resp
        }
        Err(e) => {
            let error_text = format!("Error: {}", e);
            let clients_read = clients.read().await;
            if let Some(tx) = clients_read.get(&client_addr) {
                let error_msg = ServerMessage::Error {
                    message: format!("Chat query failed for {:?} hemisphere: {}", hemisphere, e),
                };
                let _ = tx.send(error_msg);
            }
            error_text
        }
    };
    drop(lmstudio);
    
    // Store response in pending query
    {
        let mut pending_map = pending_queries.write().await;
        if let Some(pending) = pending_map.get_mut(&parent_query_id) {
            pending.set_response(target_hemisphere, response);
        }
    }
    
    // Send completion status
    let clients_read = clients.read().await;
    if let Some(tx) = clients_read.get(&client_addr) {
        let complete_msg = ServerMessage::InferenceResult {
            timestamp: chrono::Utc::now(),
            model,
            confidence: 1.0,
            predicted_class: "complete".to_string(),
            probabilities: HashMap::new(),
            attention_points: vec![],
            coherence: if let Some(ref s) = eeg_context { s.coherence } else { 0.0 },
            impedance: 0.0,
            latency_ms: 0.0,
            hemisphere,
            metadata: Some({
                let mut m = HashMap::new();
                m.insert("status".to_string(), serde_json::json!("complete"));
                m.insert("parent_query_id".to_string(), serde_json::json!(parent_query_id));
                m
            }),
        };
        let _ = tx.send(complete_msg);
    }
}

/// Process comparator to synthesize both hemisphere responses
async fn process_comparator(
    query_id: String,
    original_query: String,
    client_addr: SocketAddr,
    comparator_model: String,
    clients: Arc<RwLock<HashMap<SocketAddr, mpsc::UnboundedSender<ServerMessage>>>>,
    lmstudio_client: Arc<RwLock<LMStudioClient>>,
    pending_queries: Arc<RwLock<HashMap<String, PendingQuery>>>,
    query_cache: Arc<QueryCache<ChatResponseCacheEntry>>,
) {
    // Wait for both responses (with timeout)
    let max_wait = std::time::Duration::from_secs(60);
    let start = std::time::Instant::now();
    
    let (left_response, right_response, left_model, right_model) = loop {
        if start.elapsed() > max_wait {
            let clients_read = clients.read().await;
            if let Some(tx) = clients_read.get(&client_addr) {
                let error_msg = ServerMessage::Error {
                    message: "Comparator timeout waiting for hemisphere responses".to_string(),
                };
                let _ = tx.send(error_msg);
            }
            return;
        }
        
        {
            let pending_map = pending_queries.read().await;
            if let Some(pending) = pending_map.get(&query_id) {
                if pending.is_complete() {
                    break (
                        pending.left_response.clone().unwrap_or_default(),
                        pending.right_response.clone().unwrap_or_default(),
                        pending.left_model.clone(),
                        pending.right_model.clone(),
                    );
                }
            } else {
                return; // Query was removed or cancelled
            }
        }
        
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    };
    
    // Send "comparing" status
    {
        let clients_read = clients.read().await;
        if let Some(tx) = clients_read.get(&client_addr) {
            let status_msg = ServerMessage::InferenceResult {
                timestamp: chrono::Utc::now(),
                model: comparator_model.clone(),
                confidence: 0.0,
                predicted_class: "comparing".to_string(),
                probabilities: HashMap::new(),
                attention_points: vec![],
                coherence: 0.0,
                impedance: 0.0,
                latency_ms: 0.0,
                hemisphere: Hemisphere::Both,
                metadata: Some({
                    let mut m = HashMap::new();
                    m.insert("status".to_string(), serde_json::json!("synthesizing"));
                    m.insert("left_model".to_string(), serde_json::json!(left_model));
                    m.insert("right_model".to_string(), serde_json::json!(right_model));
                    m
                }),
            };
            let _ = tx.send(status_msg);
        }
    }
    
    // Build comparator prompt
    let system_prompt = "You are a SYNTHESIZER that combines perspectives from both brain hemispheres. \
    The LEFT hemisphere provided an analytical, detailed response. \
    The RIGHT hemisphere provided a holistic, intuitive response. \
    Your job is to integrate both perspectives into a single, coherent, balanced response. \
    Acknowledge both viewpoints, resolve any contradictions, and present a unified answer.";
    
    let user_message = format!(
        "Original query: {}\n\n\
        LEFT HEMISPHERE (analytical) response:\n{}\n\n\
        RIGHT HEMISPHERE (intuitive) response:\n{}\n\n\
        Synthesize these two perspectives into a single coherent response. \
        Balance the analytical details from the left with the holistic patterns from the right. \
        Provide a unified answer that honors both hemispheres."
        , original_query, left_response, right_response
    );
    
    // Query comparator model
    let lmstudio = lmstudio_client.read().await;
    let messages = vec![
        crate::types::LMStudioMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        },
        crate::types::LMStudioMessage {
            role: "user".to_string(),
            content: user_message,
        },
    ];
    
    match lmstudio.chat_completion(&comparator_model, messages, 0.7, 2048).await {
        Ok(combined_response) => {
            // Cache the combined response
            let full_response = format!(
                "[Combined] {} + {}\n\n{}",
                left_model, right_model, combined_response
            );
            let cache_entry = ChatResponseCacheEntry {
                response: full_response.clone(),
                model: format!("{} + {} → {}", left_model, right_model, comparator_model),
                hemisphere: Hemisphere::Both,
            };
            let cache_key = generate_cache_key(
                &original_query,
                "both",
                &left_model,
                &right_model,
                &comparator_model
            );
            query_cache.insert(cache_key, cache_entry).await;
            
            // Send combined response
            let clients_read = clients.read().await;
            if let Some(tx) = clients_read.get(&client_addr) {
                let combined_msg = ServerMessage::ChatResponse {
                    message: full_response,
                    model: format!("{} + {} → {}", left_model, right_model, comparator_model),
                    hemisphere: Hemisphere::Both,
                };
                let _ = tx.send(combined_msg);
            }
            
            // Send completion status
            let clients_read = clients.read().await;
            if let Some(tx) = clients_read.get(&client_addr) {
                let complete_msg = ServerMessage::InferenceResult {
                    timestamp: chrono::Utc::now(),
                    model: comparator_model,
                    confidence: 1.0,
                    predicted_class: "complete".to_string(),
                    probabilities: HashMap::new(),
                    attention_points: vec![],
                    coherence: 0.0,
                    impedance: 0.0,
                    latency_ms: 0.0,
                    hemisphere: Hemisphere::Both,
                    metadata: Some({
                        let mut m = HashMap::new();
                        m.insert("status".to_string(), serde_json::json!("synthesis_complete"));
                        m.insert("query_id".to_string(), serde_json::json!(query_id));
                        m
                    }),
                };
                let _ = tx.send(complete_msg);
            }
        }
        Err(e) => {
            let clients_read = clients.read().await;
            if let Some(tx) = clients_read.get(&client_addr) {
                let error_msg = ServerMessage::Error {
                    message: format!("Comparator synthesis failed: {}", e),
                };
                let _ = tx.send(error_msg);
            }
        }
    }
    
    // Clean up pending query
    {
        let mut pending_map = pending_queries.write().await;
        pending_map.remove(&query_id);
    }
}

/// Process a single (non-bicameral) query
async fn process_single_query(
    query: ChatQuery,
    model: String,
    clients: Arc<RwLock<HashMap<SocketAddr, mpsc::UnboundedSender<ServerMessage>>>>,
    last_spatialized: Arc<RwLock<Option<SpatializedEEG>>>,
    lmstudio_client: Arc<RwLock<LMStudioClient>>,
    query_cache: Arc<QueryCache<ChatResponseCacheEntry>>,
) {
    let client_addr = query.client_addr;
    let hemisphere = query.hemisphere;
    
    // Generate cache key
    let cache_key = generate_cache_key(
        &query.message, 
        &format!("{:?}", hemisphere).to_lowercase(),
        &model,
        "",  // Not used for single queries
        ""   // Not used for single queries
    );
    
    // Check cache first
    if let Some(cached_entry) = query_cache.get(&cache_key).await {
        info!("Cache hit for query: {}", query.message.chars().take(50).collect::<String>());
        
        // Clone values for reuse
        let response = cached_entry.response.clone();
        let model = cached_entry.model.clone();
        let hemisphere = cached_entry.hemisphere;
        
        // Send cached response
        let clients_read = clients.read().await;
        if let Some(tx) = clients_read.get(&client_addr) {
            let chat_msg = ServerMessage::ChatResponse {
                message: response.clone(),
                model: model.clone(),
                hemisphere,
            };
            let _ = tx.send(chat_msg);
        }
        
        // Send completion status
        let clients_read = clients.read().await;
        if let Some(tx) = clients_read.get(&client_addr) {
            let complete_msg = ServerMessage::InferenceResult {
                timestamp: chrono::Utc::now(),
                model,
                confidence: 1.0,
                predicted_class: "complete (cached)".to_string(),
                probabilities: HashMap::new(),
                attention_points: vec![],
                coherence: 0.0,
                impedance: 0.0,
                latency_ms: 0.0,
                hemisphere,
                metadata: Some({
                    let mut m = HashMap::new();
                    m.insert("status".to_string(), serde_json::json!("complete"));
                    m.insert("cached".to_string(), serde_json::json!(true));
                    m
                }),
            };
            let _ = tx.send(complete_msg);
        }
        return;
    }
    
    // Get EEG context
    let eeg_context = {
        let ls = last_spatialized.read().await;
        ls.clone()
    };
    
    // Create system prompt
    let system_prompt = match hemisphere {
        Hemisphere::Left => {
            "You are the LEFT hemisphere of a bicameral brain. \
            You process analytically, verbally, with details and logic. \
            You are connected to EEG channels F3 (frontal), C3 (central), P3 (parietal), P7 (temporal). \
            When answering, approach problems sequentially and methodically."
        }
        Hemisphere::Right => {
            "You are the RIGHT hemisphere of a bicameral brain. \
            You process holistically, intuitively, with patterns and creativity. \
            You are connected to EEG channels F4 (frontal), C4 (central), PZ (parietal midline), P8 (temporal). \
            When answering, look for patterns and big-picture connections."
        }
        Hemisphere::Both => unreachable!(),
    };
    
    // Build user message
    let user_message = if let Some(ref spatialized) = eeg_context {
        format!(
            "{}\n\nCurrent brain state context:\n\
            Overall coherence: {:.2}\n\
            Your hemisphere activity: {:.2}",
            query.message,
            spatialized.coherence,
            if hemisphere == Hemisphere::Left { spatialized.left_coherence } else { spatialized.right_coherence }
        )
    } else {
        query.message.clone()
    };
    
    // Send "thinking" status
    {
        let clients_read = clients.read().await;
        if let Some(tx) = clients_read.get(&client_addr) {
            let status_msg = ServerMessage::InferenceResult {
                timestamp: chrono::Utc::now(),
                model: model.clone(),
                confidence: 0.0,
                predicted_class: "thinking".to_string(),
                probabilities: HashMap::new(),
                attention_points: vec![],
                coherence: if let Some(ref s) = eeg_context { s.coherence } else { 0.0 },
                impedance: 0.0,
                latency_ms: 0.0,
                hemisphere,
                metadata: Some({
                    let mut m = HashMap::new();
                    m.insert("status".to_string(), serde_json::json!("processing"));
                    m.insert("query".to_string(), serde_json::json!(query.message));
                    m
                }),
            };
            let _ = tx.send(status_msg);
        }
    }
    
    // Query LMStudio
    let lmstudio = lmstudio_client.read().await;
    let messages = vec![
        crate::types::LMStudioMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        },
        crate::types::LMStudioMessage {
            role: "user".to_string(),
            content: user_message,
        },
    ];
    
    match lmstudio.chat_completion(&model, messages, 0.7, 2048).await {
        Ok(response) => {
            // Cache the response
            let cache_entry = ChatResponseCacheEntry {
                response: response.clone(),
                model: model.clone(),
                hemisphere,
            };
            query_cache.insert(cache_key, cache_entry).await;
            
            // Send response to chat
            let clients_read = clients.read().await;
            if let Some(tx) = clients_read.get(&client_addr) {
                let chat_msg = ServerMessage::ChatResponse {
                    message: response,
                    model: model.clone(),
                    hemisphere,
                };
                let _ = tx.send(chat_msg);
            }
            
            // Send completion status
            let clients_read = clients.read().await;
            if let Some(tx) = clients_read.get(&client_addr) {
                let complete_msg = ServerMessage::InferenceResult {
                    timestamp: chrono::Utc::now(),
                    model,
                    confidence: 1.0,
                    predicted_class: "complete".to_string(),
                    probabilities: HashMap::new(),
                    attention_points: vec![],
                    coherence: if let Some(ref s) = eeg_context { s.coherence } else { 0.0 },
                    impedance: 0.0,
                    latency_ms: 0.0,
                    hemisphere,
                    metadata: Some({
                        let mut m = HashMap::new();
                        m.insert("status".to_string(), serde_json::json!("complete"));
                        m
                    }),
                };
                let _ = tx.send(complete_msg);
            }
        }
        Err(e) => {
            let clients_read = clients.read().await;
            if let Some(tx) = clients_read.get(&client_addr) {
                let error_msg = ServerMessage::Error {
                    message: format!("Chat query failed: {}", e),
                };
                let _ = tx.send(error_msg);
            }
        }
    }
}

/// Handle a single client connection
async fn handle_client(
    stream: tokio::net::TcpStream,
    addr: SocketAddr,
    clients: Arc<RwLock<HashMap<SocketAddr, mpsc::UnboundedSender<ServerMessage>>>>,
    peer_ids: Arc<RwLock<HashMap<SocketAddr, String>>>,
    eeg_manager: Arc<RwLock<EEGSourceManager>>,
    lmstudio_models: Arc<RwLock<Vec<String>>>,
    chat_tx: mpsc::Sender<ChatQuery>,
    left_model: Arc<RwLock<String>>,
    right_model: Arc<RwLock<String>>,
    comparator_model: Arc<RwLock<String>>,
    query_cache: Arc<QueryCache<ChatResponseCacheEntry>>,
) -> Result<()> {
    let ws_stream = tokio_tungstenite::accept_async(stream).await?;
    info!("Client {} connected", addr);

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<ServerMessage>();

    // Add client to registry
    {
        let mut clients = clients.write().await;
        clients.insert(addr, tx);
        info!("Total clients: {}", clients.len());
    }

    // Spawn task to send messages to client
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let json = serde_json::to_string(&msg).unwrap_or_default();
            let ws_msg = Message::Text(json);
            if let Err(e) = ws_sender.send(ws_msg).await {
                error!("Send error: {}", e);
                break;
            }
        }
    });

    // Handle incoming messages
    while let Some(result) = ws_receiver.next().await {
        match result {
            Ok(Message::Text(text)) => {
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                    match client_msg {
                        ClientMessage::Ping => {
                            let clients = clients.read().await;
                            if let Some(tx) = clients.get(&addr) {
                                let _ = tx.send(ServerMessage::Pong);
                            }
                        }
                        ClientMessage::GetStats => {
                            let models = lmstudio_models.read().await.clone();
                            let left = left_model.read().await.clone();
                            let right = right_model.read().await.clone();
                            
                            let configs = vec![
                                HemisphereConfig {
                                    hemisphere: Hemisphere::Left,
                                    model_id: left,
                                    purpose: "analytical".to_string(),
                                    temperature: 0.7,
                                    max_tokens: 500,
                                },
                                HemisphereConfig {
                                    hemisphere: Hemisphere::Right,
                                    model_id: right,
                                    purpose: "intuitive".to_string(),
                                    temperature: 0.7,
                                    max_tokens: 500,
                                },
                            ];
                            
                            let response = ServerMessage::Statistics {
                                total_frames: 0,
                                routing: HashMap::new(),
                                avg_coherence: 0.0,
                                available_models: models,
                                hemisphere_configs: configs,
                            };
                            
                            let clients = clients.read().await;
                            if let Some(tx) = clients.get(&addr) {
                                let _ = tx.send(response);
                            }
                        }
                        ClientMessage::SetModel { hemisphere, model_id } => {
                            match hemisphere {
                                Hemisphere::Left => {
                                    let mut lm = left_model.write().await;
                                    *lm = model_id.clone();
                                }
                                Hemisphere::Right => {
                                    let mut rm = right_model.write().await;
                                    *rm = model_id.clone();
                                }
                                Hemisphere::Both => {
                                    let mut lm = left_model.write().await;
                                    let mut rm = right_model.write().await;
                                    *lm = model_id.clone();
                                    *rm = model_id.clone();
                                }
                            }
                            info!("Client {} set {:?} model to {}", addr, hemisphere, model_id);
                        }
                        ClientMessage::SetComparatorModel { model_id } => {
                            let mut cm = comparator_model.write().await;
                            *cm = model_id.clone();
                            info!("Client {} set comparator model to {}", addr, model_id);
                        }
                        ClientMessage::ChatMessage { message, hemisphere } => {
                            info!("Chat from {}: {}", addr, message);
                            
                            // Generate unique query ID for tracking
                            let query_id = format!("{}_{}", addr.port(), std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis());
                            
                            // Send chat query to processor
                            let query = ChatQuery {
                                message,
                                hemisphere: hemisphere.unwrap_or(Hemisphere::Both),
                                client_addr: addr,
                                query_id,
                            };
                            
                            if let Err(e) = chat_tx.send(query).await {
                                let clients_read = clients.read().await;
                                if let Some(tx) = clients_read.get(&addr) {
                                    let error_msg = ServerMessage::Error {
                                        message: format!("Failed to queue chat: {}", e),
                                    };
                                    let _ = tx.send(error_msg);
                                }
                            }
                        }
                        ClientMessage::GetModels => {
                            let models = lmstudio_models.read().await.clone();
                            let response = ServerMessage::ModelsList { models };
                            
                            let clients = clients.read().await;
                            if let Some(tx) = clients.get(&addr) {
                                let _ = tx.send(response);
                            }
                        }
                        ClientMessage::StartEEG { source_type, sample_rate } => {
                            let _manager = eeg_manager.write().await;
                            let rate = sample_rate.unwrap_or(256);
                            
                            // EEG is started via the pipeline, not directly here
                            info!("Client {} requested EEG start at {} Hz (type: {})", addr, rate, source_type);
                            
                            let response = ServerMessage::PipelineStatus {
                                eeg_running: true,
                                eeg_source_type: Some(source_type),
                                inference_active: true,
                                lmstudio_connected: true,
                                connected_clients: clients.read().await.len(),
                            };
                            let clients_read = clients.read().await;
                            if let Some(tx) = clients_read.get(&addr) {
                                let _ = tx.send(response);
                            }
                        }
                        ClientMessage::StopEEG => {
                            let mut manager = eeg_manager.write().await;
                            manager.stop().await;
                            info!("Client {} stopped EEG", addr);
                            
                            let response = ServerMessage::PipelineStatus {
                                eeg_running: false,
                                eeg_source_type: None,
                                inference_active: false,
                                lmstudio_connected: true,
                                connected_clients: clients.read().await.len(),
                            };
                            let clients_read = clients.read().await;
                            if let Some(tx) = clients_read.get(&addr) {
                                let _ = tx.send(response);
                            }
                        }
                        ClientMessage::GetPipelineStatus => {
                            let manager = eeg_manager.read().await;
                            let response = ServerMessage::PipelineStatus {
                                eeg_running: manager.is_running(),
                                eeg_source_type: manager.get_source_type(),
                                inference_active: manager.is_running(),
                                lmstudio_connected: true,
                                connected_clients: clients.read().await.len(),
                            };
                            drop(manager);
                            
                            let clients_read = clients.read().await;
                            if let Some(tx) = clients_read.get(&addr) {
                                let _ = tx.send(response);
                            }
                        }
                        ClientMessage::ClearCache => {
                            query_cache.clear().await;
                            info!("Client {} cleared query cache", addr);
                            let response = ServerMessage::CacheCleared;
                            let clients_read = clients.read().await;
                            if let Some(tx) = clients_read.get(&addr) {
                                let _ = tx.send(response);
                            }
                        }
                        ClientMessage::GetCacheStats => {
                            let stats = query_cache.get_stats().await;
                            let hit_rate = query_cache.hit_rate().await;
                            let response = ServerMessage::CacheStats {
                                hits: stats.hits,
                                misses: stats.misses,
                                evictions: stats.evictions,
                                size: stats.size,
                                hit_rate,
                            };
                            let clients_read = clients.read().await;
                            if let Some(tx) = clients_read.get(&addr) {
                                let _ = tx.send(response);
                            }
                        }
                        
                        // Peer-to-peer handlers
                        ClientMessage::GetPeerId => {
                            let peer_id = format!("peer_{}_{}", addr.port(), 
                                std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis());
                            
                            // Store peer ID
                            {
                                let mut peer_ids_map = peer_ids.write().await;
                                peer_ids_map.insert(addr, peer_id.clone());
                            }
                            
                            info!("Assigned peer ID {} to client {}", peer_id, addr);
                            
                            // Send peer ID to the requesting client
                            let response = ServerMessage::PeerMessage {
                                subtype: "peer_id_assigned".to_string(),
                                peer_id: Some(peer_id.clone()),
                                peer_addr: Some(addr),
                                peers: None,
                                from_peer: None,
                                content: None,
                                data: None,
                                eeg_data: None,
                            };
                            let clients_read = clients.read().await;
                            if let Some(tx) = clients_read.get(&addr) {
                                let _ = tx.send(response);
                            }
                            drop(clients_read);
                            
                            // Broadcast updated peer list to all clients
                            let peers_list = {
                                let peer_ids_read = peer_ids.read().await;
                                peer_ids_read.iter().map(|(peer_addr, peer_id)| {
                                    crate::types::PeerInfo {
                                        id: peer_id.clone(),
                                        addr: *peer_addr,
                                        state: "available".to_string(),
                                    }
                                }).collect::<Vec<_>>()
                            };
                            
                            let broadcast_msg = ServerMessage::PeerMessage {
                                subtype: "peer_list".to_string(),
                                peer_id: None,
                                peer_addr: None,
                                peers: Some(peers_list),
                                from_peer: None,
                                content: None,
                                data: None,
                                eeg_data: None,
                            };
                            
                            let clients_read = clients.read().await;
                            for (_, tx) in clients_read.iter() {
                                let _ = tx.send(broadcast_msg.clone());
                            }
                        }
                        
                        ClientMessage::GetPeerList => {
                            // Build peer list
                            let peers_list = {
                                let peer_ids_read = peer_ids.read().await;
                                peer_ids_read.iter().map(|(peer_addr, peer_id)| {
                                    crate::types::PeerInfo {
                                        id: peer_id.clone(),
                                        addr: *peer_addr,
                                        state: "available".to_string(),
                                    }
                                }).collect::<Vec<_>>()
                            };
                            
                            let response = ServerMessage::PeerMessage {
                                subtype: "peer_list".to_string(),
                                peer_id: None,
                                peer_addr: None,
                                peers: Some(peers_list),
                                from_peer: None,
                                content: None,
                                data: None,
                                eeg_data: None,
                            };
                            
                            let clients_read = clients.read().await;
                            if let Some(tx) = clients_read.get(&addr) {
                                let _ = tx.send(response);
                            }
                        }
                        
                        ClientMessage::PeerConnectRequest { target_peer } => {
                            info!("Peer connection request from {} to {}", addr, target_peer);
                            
                            // Forward connection request to target peer
                            let forward_msg = ServerMessage::PeerMessage {
                                subtype: "connection_request".to_string(),
                                peer_id: None,
                                peer_addr: Some(addr),
                                peers: None,
                                from_peer: Some(format!("peer_{}", addr.port())),
                                content: None,
                                data: None,
                                eeg_data: None,
                            };
                            
                            // For now, broadcast to all clients except sender
                            // In a real implementation, you'd route to the specific peer
                            let clients_read = clients.read().await;
                            for (client_addr, tx) in clients_read.iter() {
                                if *client_addr != addr {
                                    let _ = tx.send(forward_msg.clone());
                                }
                            }
                        }
                        
                        ClientMessage::PeerAcceptConnection { peer_id } => {
                            info!("Peer {} accepted connection from {}", addr, peer_id);
                            
                            let response = ServerMessage::PeerMessage {
                                subtype: "connection_accepted".to_string(),
                                peer_id: Some(peer_id.clone()),
                                peer_addr: Some(addr),
                                peers: None,
                                from_peer: Some(format!("peer_{}", addr.port())),
                                content: None,
                                data: None,
                                eeg_data: None,
                            };
                            
                            // Notify the requesting peer
                            let clients_read = clients.read().await;
                            for (client_addr, tx) in clients_read.iter() {
                                if *client_addr != addr {
                                    let _ = tx.send(response.clone());
                                }
                            }
                        }
                        
                        ClientMessage::PeerRejectConnection { peer_id } => {
                            info!("Peer {} rejected connection from {}", addr, peer_id);
                            
                            let response = ServerMessage::PeerMessage {
                                subtype: "connection_rejected".to_string(),
                                peer_id: Some(peer_id.clone()),
                                peer_addr: Some(addr),
                                peers: None,
                                from_peer: None,
                                content: None,
                                data: None,
                                eeg_data: None,
                            };
                            
                            let clients_read = clients.read().await;
                            for (client_addr, tx) in clients_read.iter() {
                                if *client_addr != addr {
                                    let _ = tx.send(response.clone());
                                }
                            }
                        }
                        
                        ClientMessage::PeerDisconnect { peer_id } => {
                            info!("Peer {} disconnecting from {}", addr, peer_id);
                            
                            let response = ServerMessage::PeerMessage {
                                subtype: "peer_disconnected".to_string(),
                                peer_id: Some(peer_id.clone()),
                                peer_addr: Some(addr),
                                peers: None,
                                from_peer: None,
                                content: None,
                                data: None,
                                eeg_data: None,
                            };
                            
                            let clients_read = clients.read().await;
                            for (client_addr, tx) in clients_read.iter() {
                                if *client_addr != addr {
                                    let _ = tx.send(response.clone());
                                }
                            }
                        }
                        
                        ClientMessage::PeerShareEeg { eeg_data } => {
                            // Forward EEG data to all connected peers
                            let forward_msg = ServerMessage::PeerMessage {
                                subtype: "brain_data_received".to_string(),
                                peer_id: None,
                                peer_addr: Some(addr),
                                peers: None,
                                from_peer: Some(format!("peer_{}", addr.port())),
                                content: None,
                                data: Some(eeg_data.clone()),
                                eeg_data: Some(eeg_data),
                            };
                            
                            let clients_read = clients.read().await;
                            for (client_addr, tx) in clients_read.iter() {
                                if *client_addr != addr {
                                    let _ = tx.send(forward_msg.clone());
                                }
                            }
                        }
                        
                        ClientMessage::PeerChatMessage { content } => {
                            // Forward chat message to all connected peers
                            let forward_msg = ServerMessage::PeerMessage {
                                subtype: "chat_from_peer".to_string(),
                                peer_id: None,
                                peer_addr: Some(addr),
                                peers: None,
                                from_peer: Some(format!("peer_{}", addr.port())),
                                content: Some(content),
                                data: None,
                                eeg_data: None,
                            };
                            
                            let clients_read = clients.read().await;
                            for (client_addr, tx) in clients_read.iter() {
                                if *client_addr != addr {
                                    let _ = tx.send(forward_msg.clone());
                                }
                            }
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                info!("Client {} closed connection", addr);
                break;
            }
            Err(e) => {
                error!("Client {} message error: {}", addr, e);
                break;
            }
            _ => {}
        }
    }

    // Cleanup
    send_task.abort();
    
    // Remove from clients
    let removed_peer_id = {
        let mut clients_write = clients.write().await;
        clients_write.remove(&addr);
        let client_count = clients_write.len();
        info!("Client {} disconnected. Total: {}", addr, client_count);
        drop(clients_write);
        
        // Remove peer ID and get the removed peer ID
        let mut peer_ids_write = peer_ids.write().await;
        let removed = peer_ids_write.remove(&addr);
        drop(peer_ids_write);
        removed
    };
    
    // Broadcast updated peer list if a peer was removed
    if removed_peer_id.is_some() {
        let peers_list: Vec<crate::types::PeerInfo> = {
            let peer_ids_read = peer_ids.read().await;
            peer_ids_read.iter().map(|(peer_addr, peer_id)| {
                crate::types::PeerInfo {
                    id: peer_id.clone(),
                    addr: *peer_addr,
                    state: "available".to_string(),
                }
            }).collect()
        };
        
        let broadcast_msg = ServerMessage::PeerMessage {
            subtype: "peer_list".to_string(),
            peer_id: None,
            peer_addr: None,
            peers: Some(peers_list),
            from_peer: None,
            content: None,
            data: None,
            eeg_data: None,
        };
        
        // Now read from clients after dropping the write guard
        let clients_read = clients.read().await;
        for (_, tx) in clients_read.iter() {
            let _ = tx.send(broadcast_msg.clone());
        }
    }

    Ok(())
}
