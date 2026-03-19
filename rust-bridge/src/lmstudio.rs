use crate::types::*;
use crate::orchestrator::InferenceRequest;
use anyhow::{anyhow, Result};
use reqwest::Client;
use std::time::Duration;
use tracing::{debug, info};

/// HTTP client for LMStudio API
pub struct LMStudioClient {
    base_url: String,
    api_key: Option<String>,
    client: Client,
    available_models: Vec<String>,
}

impl LMStudioClient {
    pub fn new(base_url: String, api_key: Option<String>) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(60))  // Increased from 30s to 60s for long comparator responses
            .build()
            .expect("Failed to create HTTP client");

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            client,
            available_models: Vec::new(),
        }
    }

    /// Test connection and fetch available models
    pub async fn connect(&mut self) -> Result<()> {
        let models = self.list_models().await?;
        
        if models.is_empty() {
            return Err(anyhow!(
                "No models available in LMStudio. Please load a model first."
            ));
        }

        self.available_models = models.clone();
        
        info!(
            "Connected to LMStudio at {} with {} models",
            self.base_url,
            models.len()
        );
        
        for (i, model) in models.iter().enumerate() {
            info!("  [{}] {}", i + 1, model);
        }

        Ok(())
    }

    /// Get list of available models
    async fn list_models(&self) -> Result<Vec<String>> {
        let url = format!("{}/v1/models", self.base_url);
        
        debug!("Fetching models from {}", url);
        
        let mut request = self.client.get(&url);
        if let Some(ref key) = self.api_key {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
        let response = request.send().await?;
        
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Failed to list models: HTTP {} - {}",
                status,
                text
            ));
        }

        let data: serde_json::Value = response.json().await?;
        let models: Vec<String> = data["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        Ok(models)
    }

    /// Send chat completion request
    pub async fn chat_completion(
        &self,
        model: &str,
        messages: Vec<LMStudioMessage>,
        temperature: f64,
        max_tokens: u32,
        tools: Option<Vec<serde_json::Value>>,  // Tools for function calling
    ) -> Result<String> {
        let url = format!("{}/v1/chat/completions", self.base_url);
        
        let request = LMStudioRequest {
            model: model.to_string(),
            messages,
            temperature,
            max_tokens,
            stream: false,
            tools,  // Pass tools to LM Studio
        };

        debug!(
            "Sending request to {} with model {} (tools: {})",
            url, model, 
            request.tools.as_ref().map(|t| t.len()).unwrap_or(0)
        );

        let mut request_builder = self.client
            .post(&url)
            .json(&request);
        
        if let Some(ref key) = self.api_key {
            request_builder = request_builder.header("Authorization", format!("Bearer {}", key));
        }
        
        let response = request_builder
            .send()
            .await?;

        let status = response.status();
        
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            
            if status.as_u16() == 400 {
                return Err(anyhow!(
                    "Model '{}' not found. Available models: {:?}. \
                    Error: {}",
                    model, self.available_models, text
                ));
            }
            
            return Err(anyhow!(
                "LMStudio request failed: HTTP {} - {}",
                status, text
            ));
        }

        let data: LMStudioResponse = response.json().await?;
        
        if let Some(choice) = data.choices.first() {
            Ok(choice.message.content.clone())
        } else {
            Err(anyhow!("Empty response from LMStudio"))
        }
    }

    /// Process inference request for a hemisphere
    pub async fn process_inference(
        &self,
        request: &InferenceRequest,
    ) -> Result<InferenceResult> {
        let start = std::time::Instant::now();
        
        let prompt = request.get_prompt();
        
        let messages = vec![
            LMStudioMessage {
                role: "system".to_string(),
                content: match request.coherence_state {
                    CoherenceState::High => "You are an expert QAM16 constellation pattern recognition system monitoring network signals.".to_string(),
                    CoherenceState::Low => "You are an expert QAM16 anomaly detection system monitoring network signal integrity.".to_string(),
                    CoherenceState::Medium => "You are an expert QAM16 network signal analysis system.".to_string(),
                },
            },
            LMStudioMessage {
                role: "user".to_string(),
                content: prompt,
            },
        ];

        // Temperature based on coherence state
        let temperature = match request.coherence_state {
            CoherenceState::High => 0.3,
            CoherenceState::Low => 0.2,
            CoherenceState::Medium => 0.25,
        };

        let response = self.chat_completion(
            &request.model_id,
            messages,
            temperature,
            300,
            None,  // No tools for inference
        ).await?;

        let latency = start.elapsed().as_secs_f64() * 1000.0;
        
        // Parse response into structured result
        let result = self.parse_response(
            &response,
            request,
            latency
        );

        debug!(
            "Inference completed in {:.1}ms for {:?} hemisphere",
            latency, request.hemisphere
        );

        Ok(result)
    }

    /// Parse LMStudio response into InferenceResult
    fn parse_response(
        &self,
        response: &str,
        request: &InferenceRequest,
        latency_ms: f64,
    ) -> InferenceResult {
        // Simple parsing - look for STATE: and CONFIDENCE: patterns
        let mut predicted_class = "unknown".to_string();
        let mut confidence = 0.5;

        for line in response.lines() {
            if line.to_uppercase().starts_with("STATE:") {
                predicted_class = line[6..].trim().to_lowercase();
            } else if line.to_uppercase().starts_with("CONFIDENCE:") {
                if let Ok(val) = line[11..].trim().parse::<f64>() {
                    confidence = val.clamp(0.0, 1.0);
                }
            }
        }

        // If no explicit classification found, use first word
        if predicted_class == "unknown" {
            predicted_class = response.split_whitespace()
                .next()
                .unwrap_or("unknown")
                .to_lowercase();
        }

        let mut probabilities = std::collections::HashMap::new();
        probabilities.insert(predicted_class.clone(), confidence);
        probabilities.insert("other".to_string(), 1.0 - confidence);

        // Calculate attention weights based on hemisphere features
        let attention_weights = if request.hemisphere_features.is_empty() {
            vec![0.125; 8]
        } else {
            let sum: f64 = request.hemisphere_features.iter().sum();
            if sum > 0.0 {
                request.hemisphere_features.iter()
                    .map(|&v| v / sum)
                    .collect()
            } else {
                vec![0.125; request.hemisphere_features.len()]
            }
        };

        let mut metadata = std::collections::HashMap::new();
        metadata.insert("raw_response".to_string(), serde_json::json!(response));
        metadata.insert("latency_ms".to_string(), serde_json::json!(latency_ms));
        metadata.insert("coherence_state".to_string(), 
            serde_json::json!(format!("{:?}", request.coherence_state)));
        metadata.insert("coherence_value".to_string(), 
            serde_json::json!(request.coherence_value));

        InferenceResult {
            model_name: format!("LMStudio-{:?}", request.hemisphere),
            timestamp: chrono::Utc::now(),
            predicted_class,
            confidence,
            class_probabilities: probabilities,
            attention_weights,
            hemisphere: request.hemisphere,
            metadata,
        }
    }

    /// Get available models list
    pub fn get_available_models(&self) -> &[String] {
        &self.available_models
    }

    /// Check if a model exists
    pub fn has_model(&self, model_id: &str) -> bool {
        self.available_models.contains(&model_id.to_string())
    }
}
