use crate::types::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info};

/// Signal processor that extracts features from signal data
pub struct SignalProcessor {
    config: BridgeConfig,
}

impl SignalProcessor {
    pub fn new(config: BridgeConfig) -> Self {
        Self { config }
    }

    /// Extract features from signal frame
    pub fn extract_features(&self, signal: &[f64], frame_count: u64) -> SignalFeatures {
        // Ensure we have 8 channels
        let signal_array: Vec<f64> = if signal.len() >= 8 {
            signal[..8].to_vec()
        } else {
            let mut padded = signal.to_vec();
            padded.resize(8, 0.5);
            padded
        };

        // Octonion transform
        let octonion_output: Vec<f64> = signal_array.iter()
            .map(|v: &f64| (*v - 1.0).tanh())
            .collect();

        // Ambisonic FOA components
        let w = signal_array.iter().sum::<f64>() / 8.0;
        let x = (signal_array[0] - signal_array[1]) / 2.0;
        let y = (signal_array[3] - 0.5) * 2.0;
        let z = (signal_array[6] - 0.5) * 2.0;

        // Tunnel diode simulation
        let v_diode: f64 = 0.09 + z * 0.1;
        let (coherence, impedance) = if v_diode >= 0.05 && v_diode <= 0.35 {
            let c: f64 = 1.0 - ((v_diode - 0.2) / 0.15).abs();
            (c.max(0.0).min(1.0), 10.0 * (1.0 - c))
        } else {
            (0.3, 22.0)
        };

        // Spatial features
        let spatial_mag = (x * x + y * y + z * z).sqrt();
        let spatial_phase = y.atan2(x);

        // Hemisphere split
        // Left hemisphere: F3(0), C3(2), P3(5), P7(6) - channels 0, 2, 5, 6
        // Right hemisphere: F4(1), C4(4), PZ(6), P8(7) - channels 1, 4, 6, 7
        let left_hemisphere = vec![signal_array[0], signal_array[2], signal_array[5], signal_array[6]];
        let right_hemisphere = vec![signal_array[1], signal_array[4], signal_array[6], signal_array[7]];

        // Calculate hemisphere-specific coherence
        let coherence_left = left_hemisphere.iter().sum::<f64>() / left_hemisphere.len() as f64;
        let coherence_right = right_hemisphere.iter().sum::<f64>() / right_hemisphere.len() as f64;

        SignalFeatures {
            timestamp: chrono::Utc::now(),
            frame: frame_count,
            eeg_channels: signal_array,
            octonion_output,
            ambisonic_w: w,
            ambisonic_x: x,
            ambisonic_y: y,
            ambisonic_z: z,
            coherence,
            impedance_z: impedance,
            diode_voltage: v_diode,
            spatial_magnitude: spatial_mag,
            spatial_phase,
            left_hemisphere,
            right_hemisphere,
            coherence_left,
            coherence_right,
        }
    }

    /// Get coherence state for routing
    pub fn get_coherence_state(&self, coherence: f64) -> CoherenceState {
        if coherence >= self.config.coherence_threshold_high {
            CoherenceState::High
        } else if coherence <= self.config.coherence_threshold_low {
            CoherenceState::Low
        } else {
            CoherenceState::Medium
        }
    }
}

/// Model orchestrator that manages hemisphere-specific models
pub struct ModelOrchestrator {
    _config: BridgeConfig,
    processor: SignalProcessor,
    // Current model assignments per hemisphere
    left_model: Arc<RwLock<String>>,
    right_model: Arc<RwLock<String>>,
    // Statistics
    routing_stats: Arc<RwLock<HashMap<String, u64>>>,
}

impl ModelOrchestrator {
    pub fn new(config: BridgeConfig) -> Self {
        let left_model = config.default_models.get("left")
            .cloned()
            .unwrap_or_else(|| "local-model".to_string());
        let right_model = config.default_models.get("right")
            .cloned()
            .unwrap_or_else(|| "local-model".to_string());

        let mut routing_stats = HashMap::new();
        routing_stats.insert("high".to_string(), 0);
        routing_stats.insert("medium".to_string(), 0);
        routing_stats.insert("low".to_string(), 0);

        Self {
            _config: config.clone(),
            processor: SignalProcessor::new(config),
            left_model: Arc::new(RwLock::new(left_model)),
            right_model: Arc::new(RwLock::new(right_model)),
            routing_stats: Arc::new(RwLock::new(routing_stats)),
        }
    }

    /// Process a frame and determine which model(s) to use
    pub async fn process_frame(&self, features: &SignalFeatures) -> Vec<InferenceRequest> {
        let mut requests = Vec::new();

        // Determine coherence for each hemisphere
        let left_state = self.processor.get_coherence_state(features.coherence_left);
        let right_state = self.processor.get_coherence_state(features.coherence_right);

        // Update statistics
        {
            let mut stats = self.routing_stats.write().await;
            *stats.entry(format!("{:?}", left_state).to_lowercase()).or_insert(0) += 1;
        }

        // Route left hemisphere
        let left_model = self.left_model.read().await.clone();
        requests.push(InferenceRequest {
            hemisphere: Hemisphere::Left,
            model_id: left_model,
            features: features.clone(),
            coherence_state: left_state,
            hemisphere_features: features.left_hemisphere.clone(),
            coherence_value: features.coherence_left,
        });

        // Route right hemisphere
        let right_model = self.right_model.read().await.clone();
        requests.push(InferenceRequest {
            hemisphere: Hemisphere::Right,
            model_id: right_model,
            features: features.clone(),
            coherence_state: right_state,
            hemisphere_features: features.right_hemisphere.clone(),
            coherence_value: features.coherence_right,
        });

        debug!(
            "Frame {}: Left={:?} (coherence={:.2}), Right={:?} (coherence={:.2})",
            features.frame, left_state, features.coherence_left, 
            right_state, features.coherence_right
        );

        requests
    }

    /// Set model for a specific hemisphere
    pub async fn set_hemisphere_model(&self, hemisphere: Hemisphere, model_id: String) {
        match hemisphere {
            Hemisphere::Left => {
                let mut model = self.left_model.write().await;
                *model = model_id.clone();
                info!("Set left hemisphere model to: {}", model_id);
            }
            Hemisphere::Right => {
                let mut model = self.right_model.write().await;
                *model = model_id.clone();
                info!("Set right hemisphere model to: {}", model_id);
            }
            Hemisphere::Both => {
                let mut left = self.left_model.write().await;
                let mut right = self.right_model.write().await;
                *left = model_id.clone();
                *right = model_id.clone();
                info!("Set both hemispheres model to: {}", model_id);
            }
        }
    }

    /// Get current hemisphere configurations
    pub async fn get_hemisphere_configs(&self) -> Vec<HemisphereConfig> {
        let left_model = self.left_model.read().await.clone();
        let right_model = self.right_model.read().await.clone();

        vec![
            HemisphereConfig {
                hemisphere: Hemisphere::Left,
                model_id: left_model,
                purpose: "pattern".to_string(),
                temperature: 0.3,
                max_tokens: 2048,
            },
            HemisphereConfig {
                hemisphere: Hemisphere::Right,
                model_id: right_model,
                purpose: "anomaly".to_string(),
                temperature: 0.2,
                max_tokens: 2048,
            },
        ]
    }

    /// Get routing statistics
    pub async fn get_stats(&self) -> HashMap<String, u64> {
        self.routing_stats.read().await.clone()
    }

    /// Get left hemisphere model
    pub async fn get_left_model(&self) -> String {
        self.left_model.read().await.clone()
    }

    /// Get right hemisphere model
    pub async fn get_right_model(&self) -> String {
        self.right_model.read().await.clone()
    }
}

/// Inference request for a specific hemisphere
#[derive(Debug, Clone)]
pub struct InferenceRequest {
    pub hemisphere: Hemisphere,
    pub model_id: String,
    pub features: SignalFeatures,
    pub coherence_state: CoherenceState,
    pub hemisphere_features: Vec<f64>,
    pub coherence_value: f64,
}

impl InferenceRequest {
    /// Build LMStudio prompt for pattern recognition
    pub fn build_pattern_prompt(&self) -> String {
        let channel_names = match self.hemisphere {
            Hemisphere::Left => vec!["Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"], // LFU + LBD
            Hemisphere::Right => vec!["Q8", "Q9", "Q10", "Q11", "Q12", "Q13", "Q14", "Q15"], // RBU + RFD
            Hemisphere::Both => vec!["Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", 
                                       "Q8", "Q9", "Q10", "Q11", "Q12", "Q13", "Q14", "Q15"],
        };

        let channels_str = self.hemisphere_features.iter()
            .zip(channel_names.iter())
            .map(|(val, name)| format!("{}={:.2}", name, val))
            .collect::<Vec<_>>()
            .join(", ");

        format!(
            "Analyze QAM16 constellation pattern for {:?} hemisphere:\n\
            Channels: {}\n\
            Coherence: {:.2}\n\
            State: {:?}\n\n\
            Classify the network signal state and provide confidence score.",
            self.hemisphere, channels_str, self.coherence_value, self.coherence_state
        )
    }

    /// Build LMStudio prompt for anomaly detection
    pub fn build_anomaly_prompt(&self) -> String {
        format!(
            "Detect anomalies in {:?} hemisphere:\n\
            Coherence: {:.2}\n\
            Impedance: {:.1}Ω\n\n\
            Identify any unusual patterns or artifacts.",
            self.hemisphere, self.coherence_value, self.features.impedance_z
        )
    }

    /// Get appropriate prompt based on coherence state
    pub fn get_prompt(&self) -> String {
        match self.coherence_state {
            CoherenceState::High => self.build_pattern_prompt(),
            CoherenceState::Low => self.build_anomaly_prompt(),
            CoherenceState::Medium => format!(
                "{}",
                self.build_pattern_prompt()
            ),
        }
    }
}
