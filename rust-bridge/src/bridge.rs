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
        info!("║   Brainscan Bridge - QAM16 Network Signal Architecture     ║");
        info!("╠══════════════════════════════════════════════════════════╣");
        info!("║  QAM Pipeline: 16-Constellation → FOA Matrix → Visualizer ║");
        info!("║  Quadrants: LFU(0-3) | LBD(4-7) | RBU(8-11) | RFD(12-15)║");
        info!("║  Chat Pipeline: Query → Left/Right Models → Responses     ║");
        info!("╚══════════════════════════════════════════════════════════╝");
        info!("LMStudio: {}", self.config.lmstudio_url);
        info!("Server Port: {}", self.config.inference_port);

        // Setup LMStudio client with API key
        let api_key = self.config.lmstudio_api_key.clone();
        let mut lmstudio = LMStudioClient::new(self.config.lmstudio_url.clone(), api_key);
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

        // Start QAM16 pipeline (replaces EEG - sends 16 constellation points for FOA spatialization)
        let signal_handle = match server.start_qam_pipeline().await {
            Ok(handle) => handle,
            Err(e) => {
                error!("Failed to start QAM16 pipeline: {}", e);
                // Fallback to EEG if QAM fails
                info!("Falling back to EEG pipeline...");
                match server.start_eeg_pipeline().await {
                    Ok(handle) => handle,
                    Err(e2) => {
                        error!("Failed to start EEG pipeline: {}", e2);
                        return Err(e2);
                    }
                }
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
            res = signal_handle => {
                info!("Signal pipeline stopped: {:?}", res);
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
