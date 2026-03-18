use crate::types::*;
use crate::lmstudio::LMStudioClient;
use crate::server::InferenceServer;
use anyhow::Result;
use std::sync::Arc;
use tracing::{error, info};

/// Main bridge - Simplified Bicameral Architecture
/// 
/// Data Flow:
/// 1. EEG Generation → Spatialization Matrix → Visualization ONLY
/// 2. Chat Query → Both Hemispheres → LMStudio → Responses
/// 
/// Models are ONLY queried for chat, not continuous EEG analysis
pub struct BrainscanBridge {
    config: BridgeConfig,
}

impl BrainscanBridge {
    pub async fn new(config: BridgeConfig) -> Result<Self> {
        Ok(Self { config })
    }

    /// Run the complete bridge
    pub async fn run(self) -> Result<()> {
        info!("╔══════════════════════════════════════════════════════════╗");
        info!("║   Brainscan Bridge - Bicameral Chat Architecture         ║");
        info!("╠══════════════════════════════════════════════════════════╣");
        info!("║  EEG Pipeline: Simulated → Matrix → Visualizer          ║");
        info!("║  Chat Pipeline: Query → Left/Right Models → Responses   ║");
        info!("╚══════════════════════════════════════════════════════════╝");
        info!("LMStudio: {}", self.config.lmstudio_url);
        info!("Server Port: {}", self.config.inference_port);

        // Setup LMStudio client
        let mut lmstudio = LMStudioClient::new(self.config.lmstudio_url.clone());
        lmstudio.connect().await?;
        let lmstudio = Arc::new(tokio::sync::RwLock::new(lmstudio));
        
        // Create server
        let (server, chat_rx) = InferenceServer::new(
            self.config.clone(),
            lmstudio.clone(),
        );
        
        // Update available models
        let models = lmstudio.read().await.get_available_models().to_vec();
        server.set_lmstudio_models(models).await;

        // Start EEG pipeline (runs continuously for visualization)
        let eeg_handle = match server.start_eeg_pipeline().await {
            Ok(handle) => handle,
            Err(e) => {
                error!("Failed to start EEG pipeline: {}", e);
                return Err(e);
            }
        };

        // Start chat processor (only responds to chat queries)
        server.start_chat_processor(chat_rx).await;

        // Start WebSocket server
        let server_clone = server.clone();
        let server_handle = tokio::spawn(async move {
            if let Err(e) = server_clone.run().await {
                error!("Server failed: {}", e);
            }
        });

        // Wait for tasks - both should run indefinitely
        let _result = tokio::select! {
            res = eeg_handle => {
                info!("EEG pipeline stopped: {:?}", res);
                res
            }
            res = server_handle => {
                info!("Server stopped");
                res
            }
        };

        // If we get here, something stopped - log it
        error!("Bridge shutting down unexpectedly");
        Ok(())
    }
}
