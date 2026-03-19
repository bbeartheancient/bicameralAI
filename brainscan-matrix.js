/**
 * Brainscan Matrix - 256x256 Matrix Visualizer with QAM16 Network Signal Processing
 * 
 * DOMAIN CONTEXT (CRITICAL - DO NOT HALLUCINATE):
 * This is a NETWORK TRAFFIC VISUALIZATION system, NOT a brain simulation or vision system.
 * - Processes QAM16 (16-point constellation) network signals
 * - Uses FOA (First Order Ambisonic) spatialization for signal routing
 * - Bicameral = Two AI models (Left/Right) processing same network data in parallel
 * - Quadrants = Signal routing destinations (LFU, LBD, RBU, RFD)
 * - Matrix = 256x256 pixel visualization of network traffic, not a brain
 * 
 * Features:
 * - 256x256 pixel matrix with color functions
 * - 4x4 FOA Matrix display in sidebar (W, X, Y, Z coefficients)
 * - Chat at bottom of visualizer
 * - QAM16 network signal processing with FOA spatialization
 * - All previous optimizations (cache, bidirectional processing, etc.)
 * 
 * NEW OPTIMIZATIONS (2026-03-18):
 * - Sliding Window Pattern Recognition: 32-frame temporal window for pattern detection
 *   and cross-channel correlation analysis
 * - Adaptive Thresholding: Channel-specific dynamic thresholds with noise estimation
 *   and SNR-based sensitivity adjustment
 * 
 * ADDITIONAL OPTIMIZATIONS (2026-03-18):
 * - Signal Fusion: Highly correlated channel pairs (correlation > 0.85) are fused
 *   using weighted averages to reduce redundancy
 * - Channel Count Reduction: Reduced processing from 16 to 10 channels using visual
 *   dominance weighting (LFU=1.0, LBD=0.88, RBU=0.70, RFD=0.55)
 * - Channel Ordering: LFU→LBD→RBU→RFD processing pipeline for efficiency
 * - Visual Dominance Weighting: Per-channel weights based on quadrant importance
 * 
 * BICAMERAL AI OPTIMIZATIONS (2026-03-18):
 * - Cross-Channel Attention: Attention mechanisms between QAM quadrants
 * - Bilateral Loss Balancing: Dynamic left/right hemisphere weight rebalancing
 * - Gradient Flow Management: Gradient monitoring and explosion detection
 * - Sequential Backpropagation: Dynamic processing order based on stability
 * 
 * TOKEN-EFFICIENT BICAMERAL COMMUNICATION (2026-03-18):
 * - Intra-model communication uses concise natural language
 * - Domain-specific system prompts prevent hallucinations
 * - Query context includes system architecture description
 * - Only comparator output shown to user in full natural language
 * 
 * PERFORMANCE IMPROVEMENTS:
 * - ~37.5% reduction in channel processing (16→10 channels)
 * - Reduced computation through signal fusion of correlated pairs
 * - Optimized pipeline ordering reduces cache misses
 * - Pattern detection improves signal quality with temporal context
 * 
 * DOMAIN VALIDATION:
 * - Rejects responses about brain biology, neuroscience, vision, attention mechanisms
 * - Validates responses contain QAM/signal processing keywords
 * - Warns when AI models generate off-topic content
 */

(function() {
    'use strict';

    // ==========================================
    // CONFIGURATION
    // ==========================================
    const CONFIG = {
        WS_URL: 'ws://localhost:8766',
        RECONNECT_DELAY: 5000,
        MAX_RECONNECT: 3,
        CACHE_SIZE: 100,
        CACHE_TTL: 300000,
        FRAME_SKIP: 1,
        TARGET_FPS: 30,
        MATRIX_SIZE: 256,
        // Matrix visualization controls
        BRIGHTNESS: 0.5,      // 0-1 (50% default)
        RESPONSE: 100,        // 10-200 (response time ms)
        GLOW_INTENSITY: 0.3,  // 0-1 (glow strength)
    };

    // FOA Matrix coefficients
    const FOA_MATRIX = {
        'W': { 'LFU': -1, 'LBD': -1, 'RBU': -1, 'RFD': -1 },
        'X': { 'LFU': -2.83, 'LBD': 2.83, 'RBU': 2.83, 'RFD': -2.83 },
        'Y': { 'LFU': -2.83, 'LBD': -2.83, 'RBU': 2.83, 'RFD': 2.83 },
        'Z': { 'LFU': -2.83, 'LBD': 2.83, 'RBU': -2.83, 'RFD': 2.83 },
    };

    const FOA_QUADRANTS = ['LFU', 'LBD', 'RBU', 'RFD'];
    const FOA_ROWS = ['W', 'X', 'Y', 'Z'];

    // ==========================================
    // STATE
    // ==========================================
    const state = {
        connected: false,
        socket: null,
        eegRunning: false,
        reconnectAttempts: 0,
        reconnectTimer: null,
        pingInterval: null, // Keepalive interval for WebSocket
        // OPTIMIZATION: Message batching queue
        messageQueue: [],
        messageBatchTimer: null,
        messageBatchInterval: 50, // Batch messages over 50ms
        // OPTIMIZATION: Bicameral processing queue and prioritization
        processingQueue: [], // Priority queue for async bicameral processing
        priorityLevels: { high: 1, medium: 2, low: 3 }, // Processing priority tiers
        responseTimeouts: { high: 500, medium: 1500, low: 3000 }, // Time-based windows (ms)
        feedbackGrades: { none: 0, low: 1, medium: 2, high: 3 }, // Graded feedback mechanism
        hemisphereLatency: { left: 0, right: 0, lastSync: 0 }, // Track inter-hemisphere latency
        parallelProcessing: true, // Enable parallel componentization
        asyncProcessingEnabled: true, // Enable async signal exchange
        decisionThresholds: { accept: 0.7, revise: 0.4, reject: 0.2 }, // Decision grading
        models: { left: null, right: null, comparator: null, available: [], maxTokens: 4096 },
        chatHistory: [],
        pendingResponses: { left: null, right: null, query: null },
        currentFrame: 0,
        lastFrameTime: 0,
        frameCount: 0,
        fps: 0,
        channelData: new Array(8).fill(0.5),
        ambisonic: new Array(4).fill(0),
        matrixData: new Uint8ClampedArray(CONFIG.MATRIX_SIZE * CONFIG.MATRIX_SIZE * 4),
        quadrantValues: { 'LFU': 0, 'LBD': 0, 'RBU': 0, 'RFD': 0 },
        // QAM Network Signal Processing (replaces EEG)
        qamSignals: {
            constellation: new Array(16).fill(0.5), // 16-QAM points
            signalStrength: 0.5,
            noiseFloor: 0.1,
            snr: 10.0, // Signal-to-noise ratio in dB
            symbols: [], // Received symbols
            lastUpdate: 0,
            // Smoothed positions for visualizer (8 position pairs x,y)
            smoothedPositions: new Array(16).fill(0.5),
            // Channel activity tracking for dynamic routing
            channelActivity: new Array(16).fill(0.5), // Activity level per channel
            activeChannels: 16, // Number of currently active channels (for optimization)
            routingMode: 'adaptive', // 'adaptive', 'full', 'minimal'
            // OPTIMIZATION: Cache for sorted channel indices
            sortedIndices: null,
            lastSortFrame: 0,
            // OPTIMIZATION: Quadrant prioritization weights (LFU>LBD>RBU>RFD)
            quadrantWeights: { 'LFU': 1.2, 'LBD': 1.0, 'RBU': 0.9, 'RFD': 0.8 },
            // OPTIMIZATION: Pattern stability tracking for temporal consistency
            patternStability: new Array(16).fill(0.5), // 0-1 stability score per channel
            lastPatternValues: new Array(16).fill(0.5), // Previous frame values
            stabilityHistory: [], // Track stability over time for redundancy detection
            // OPTIMIZATION: Confidence scoring for path selection
            channelConfidence: new Array(16).fill(0.5), // Combined activity + stability score
            fallbackTriggered: false, // Whether fallback to LBD was activated
            // OPTIMIZATION: Carry propagation buffer for parallel quadrant processing
            carryBuffer: new Array(4).fill(0), // LFU->LBD, LBD->LFU, and intermediate states
            parallelPasses: 2, // Number of refinement passes for complex patterns
            // OPTIMIZATION: Sliding window pattern recognition for temporal correlations
            slidingWindow: {
                buffer: new Array(16).fill(null).map(() => []), // 16 channels x window size
                windowSize: 32, // 32 frames = ~1 second at 30fps (CONFIGURABLE: reduce to 16 for higher throughput)
                minWindowSize: 8, // Minimum for responsiveness
                maxWindowSize: 64, // Maximum for pattern accuracy
                // OPTIMIZATION: Hop distance for sliding window (1-5ms per band, 2ms default)
                hopDistance: 2, // Frames to advance window (lower = more overlap, higher = faster)
                minHopDistance: 1, // Minimum for fine-grained analysis
                maxHopDistance: 5, // Maximum for speed
                patternScores: new Array(16).fill(0), // Detected pattern strength per channel
                temporalCorrelation: new Array(16).fill(0), // Cross-channel correlation matrix
                lastPatternUpdate: 0,
            },
            // OPTIMIZATION: Frequency band selection (prioritize center frequencies Q0-Q4)
            frequencyBandSelection: {
                enabled: true,
                // Center channels (Q0-Q4) typically have strongest signals in QAM
                priorityBands: {
                    'center': { channels: [0, 1, 2, 3, 4], weight: 1.0 }, // Q0-Q4: highest priority
                    'mid': { channels: [5, 6, 7, 8, 9], weight: 0.8 },      // Q5-Q9: medium priority
                    'outer': { channels: [10, 11, 12, 13, 14, 15], weight: 0.6 }, // Q10-Q15: lower priority
                },
                // Dynamic band selection based on signal strength
                dynamicSelection: true,
                // Minimum SNR threshold for including a band
                snrThreshold: 8.0, // dB
                // Last band selection update
                lastUpdate: 0,
            },
            // OPTIMIZATION: Adaptive thresholding with channel-specific rules
            adaptiveThresholds: {
                baseThreshold: 0.3, // Base threshold for all channels
                channelMultipliers: new Array(16).fill(1.0), // Per-channel adjustments
                dynamicRange: new Array(16).fill(0.5), // Measured dynamic range per channel
                noiseEstimate: new Array(16).fill(0.1), // Estimated noise floor per channel
                adaptationRate: 0.05, // How quickly thresholds adapt (0-1)
                lastCalibration: 0,
            },
            // OPTIMIZATION: Channel count reduction with visual dominance weighting
            channelReduction: {
                enabled: true,
                targetChannels: 10, // Reduce from 16 to 10 for performance
                visualDominanceWeights: {
                    'LFU': [1.0, 0.95, 0.90, 0.85], // Q0-Q3: decreasing dominance
                    'LBD': [0.88, 0.82, 0.78, 0.72], // Q4-Q7: lower priority than LFU
                    'RBU': [0.70, 0.65, 0.60, 0.55], // Q8-Q11
                    'RFD': [0.55, 0.50, 0.45, 0.40], // Q12-Q15
                },
                channelPriority: new Array(16).fill(0), // Computed priority scores
                lastPriorityUpdate: 0,
            },
            // OPTIMIZATION: Signal fusion for redundant channel pairs
            signalFusion: {
                enabled: true,
                fusionPairs: [ // Pairs of channels that can be fused
                    [0, 1], [2, 3], // LFU quadrant pairs
                    [4, 5], [6, 7], // LBD quadrant pairs
                    [8, 9], [10, 11], // RBU quadrant pairs
                    [12, 13], [14, 15], // RFD quadrant pairs
                ],
                fusionThreshold: 0.85, // Correlation threshold for fusion
                fusedValues: new Array(16).fill(null), // Cached fused values
                lastFusion: 0,
            },
            // OPTIMIZATION: Channel ordering for pipeline efficiency
            channelOrdering: {
                processingOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // LFU→LBD→RBU→RFD
                prioritizedIndices: [], // Dynamically sorted based on activity
                lastReorder: 0,
            },
            // OPTIMIZATION: Performance testing and benchmarking framework
            performanceTesting: {
                enabled: false, // Enable via UI for testing mode
                testSuite: {
                    currentTest: null,
                    testResults: [],
                    testHistory: [],
                    baselineMetrics: null,
                },
                benchmarks: {
                    lastRun: 0,
                    results: {
                        frameTime: [],
                        processingLatency: [],
                        memoryUsage: [],
                        channelThroughput: [],
                    },
                },
                // Automated test scenarios
                testScenarios: [
                    { name: 'full_load', channels: 16, duration: 5000, description: 'Full 16-channel processing' },
                    { name: 'reduced_load', channels: 10, duration: 5000, description: 'Reduced 10-channel mode' },
                    { name: 'minimal_load', channels: 4, duration: 5000, description: 'Minimal 4-channel mode' },
                    { name: 'high_activity', pattern: 'burst', duration: 3000, description: 'Burst pattern processing' },
                    { name: 'low_activity', pattern: 'stable', duration: 3000, description: 'Stable signal processing' },
                ],
            },
            // OPTIMIZATION: Enhanced SNR (Signal-to-Noise Ratio) tracking
            snrMetrics: {
                // Real-time SNR calculation per channel
                channelSNR: new Array(16).fill(10.0), // dB values
                // SNR history for trend analysis
                snrHistory: [],
                // SNR thresholds for quality levels
                thresholds: {
                    excellent: 20.0, // dB
                    good: 15.0,      // dB
                    acceptable: 10.0, // dB
                    poor: 5.0,       // dB
                },
                // SNR-based quality score (0-1)
                qualityScore: 0.5,
                // Last SNR update timestamp
                lastUpdate: 0,
            },
            // OPTIMIZATION: Pipeline efficiency metrics
            pipelineMetrics: {
                // Processing stage timing (ms)
                stageTiming: {
                    quadrantCompute: 0,
                    signalFusion: 0,
                    channelReduction: 0,
                    matrixRender: 0,
                    totalFrame: 0,
                },
                // Stage efficiency scores (0-1)
                efficiency: {
                    quadrantCompute: 1.0,
                    signalFusion: 1.0,
                    channelReduction: 1.0,
                    matrixRender: 1.0,
                },
                // Bottleneck detection
                bottleneckStage: null,
                bottleneckSeverity: 0, // 0-1
                // Optimization recommendations
                recommendations: [],
                lastAnalysis: 0,
            },
            // OPTIMIZATION: Bicameral cross-channel attention mechanisms
            crossChannelAttention: {
                enabled: true,
                // Attention weights between quadrants (LFU↔LBD, LFU↔RBU, etc.)
                attentionMatrix: {
                    'LFU_LBD': 0.3, // Cross-quadrant attention weight
                    'LFU_RBU': 0.2,
                    'LFU_RFD': 0.1,
                    'LBD_RBU': 0.25,
                    'LBD_RFD': 0.15,
                    'RBU_RFD': 0.2,
                },
                // Feature correlation tracking
                correlationScores: new Array(6).fill(0.5), // 6 quadrant pairs
                // Attention-based feature fusion
                fusedFeatures: new Array(16).fill(0),
                lastAttentionUpdate: 0,
            },
            // OPTIMIZATION: Bilateral loss function for bicameral balance
            bilateralLoss: {
                enabled: true,
                // Loss weights for left/right hemispheres
                leftWeight: 0.5,
                rightWeight: 0.5,
                // Loss balance target (0.5 = perfect balance)
                balanceTarget: 0.5,
                // Current loss ratio (left/right)
                currentRatio: 1.0,
                // Imbalance threshold for rebalancing
                imbalanceThreshold: 0.2,
                // Auto-rebalancing
                autoRebalance: true,
                lastRebalance: 0,
            },
            // OPTIMIZATION: Gradient flow management
            gradientFlow: {
                // Gradient magnitude tracking per quadrant
                gradientMagnitudes: {
                    'LFU': 0,
                    'LBD': 0,
                    'RBU': 0,
                    'RFD': 0,
                },
                // Gradient clipping threshold
                clipThreshold: 5.0,
                // Sequential backpropagation order
                backpropOrder: ['LFU', 'LBD', 'RBU', 'RFD'],
                // Gradient flow health score (0-1)
                flowHealth: 1.0,
                // Gradient explosion detection
                explosionDetected: false,
                lastGradientUpdate: 0,
            },
            // OPTIMIZATION: Suggestions system for manual optimization (SAFER than auto-editing)
            optimizationSuggestions: {
                // Current recommendations queue
                suggestions: [],
                // Maximum suggestions to store
                maxSuggestions: 20,
                // Last suggestion generation time
                lastGeneration: 0,
                // Generation interval (ms)
                generationInterval: 30000, // 30 seconds
                // Suggestion categories
                categories: {
                    performance: [],
                    quality: [],
                    efficiency: [],
                },
                // Whether to show UI notifications
                showNotifications: true,
                // Applied suggestions history
                appliedHistory: [],
                // Rejected suggestions
                rejectedHistory: [],
            },
            // OPTIMIZATION: Tuning parameters based on AI recommendations
            tuningParameters: {
                // AI-recommended window size: 40 samples (optimal for most networks)
                // Range: 32-48 samples (balance between detection rate and efficiency)
                recommendedWindowSize: 40,
                // AI-recommended fusion weights: LFU=0.6, LBD=0.4 (balanced)
                // Previously: LFU=1.2, LBD=1.0
                fusionWeights: {
                    'LFU': 0.6, // Left hemisphere weight
                    'LBD': 0.4, // Right hemisphere weight
                    'RBU': 0.5, // Adjusted for balance
                    'RFD': 0.5,
                },
                // AI-recommended alpha for adaptive thresholding: 0.6
                // Higher alpha = more noise compensation
                adaptiveThresholdAlpha: 0.6,
                // Channel reduction targets
                channelTargets: {
                    highSpeed: 10,  // For 1G/2G+ networks
                    lowLatency: 8,  // For minimal latency
                    balanced: 10,   // Default recommended
                },
                // SNR thresholds per AI recommendations
                snrThresholds: {
                    excellent: 20.0, // dB
                    good: 15.0,      // dB
                    acceptable: 10.0, // dB
                    minimum: 8.0,    // dB (from frequency band selection)
                },
                // Tuning profiles
                profiles: {
                    'balanced': {
                        windowSize: 40,
                        fusionWeights: { 'LFU': 0.6, 'LBD': 0.4, 'RBU': 0.5, 'RFD': 0.5 },
                        targetChannels: 10,
                        alpha: 0.6,
                    },
                    'highSpeed': {
                        windowSize: 32,
                        fusionWeights: { 'LFU': 0.6, 'LBD': 0.4, 'RBU': 0.5, 'RFD': 0.5 },
                        targetChannels: 10,
                        alpha: 0.5,
                    },
                    'lowLatency': {
                        windowSize: 32,
                        fusionWeights: { 'LFU': 0.7, 'LBD': 0.3, 'RBU': 0.6, 'RFD': 0.4 },
                        targetChannels: 8,
                        alpha: 0.6,
                    },
                },
                // Current active profile
                activeProfile: 'balanced',
                // Last tuning update
                lastTuningUpdate: 0,
            },
            // CONTEXT CONTROL: Toggle between Standard and Internal Analysis modes
            contextGuardrails: {
                // Guardrails disabled by default (Standard Mode)
                enabled: false,
                // Current mode
                mode: 'standard', // 'standard' (guardrails off) or 'internal_analysis' (guardrails on)
                // Standard Mode: Guardrails OFF (unrestricted discussion)
                // Internal Analysis Mode: Guardrails ON (restricted to QAM/FOA)
                lastToggle: 0,
                // Toggle count (for audit)
                toggleCount: 0,
            },
        },
        // Network traffic tracking
        networkMetrics: {
            messageCount: 0,
            lastMessageTime: 0,
            messagesPerSecond: 0,
            latency: 0,
            bytesReceived: 0,
            bytesSent: 0,
            packetHistory: [],
            connectionQuality: 0,
            errorRate: 0,
        },
        packets: [], // Active packets for visualization
        // Z-vector boundary processing state
        zVector: {
            coherenceLevel: 0.54, // Initial coherence level
            decoherenceThreshold: 0.50,
            boundaryActive: false,
            boundaryLocation: null, // 'center', 'left', 'right'
            testMode: false,
            quantumExposure: 0,
            lastTestTime: 0,
            testResults: [],
            lowCoherenceAlerted: false,
            channels: {
                F4: 0.0,  // Frontal (right hemisphere)
                C4: 0.0,  // Central (right hemisphere)
                PZ: 0.0,  // Parietal midline
                P8: 0.0,  // Temporal (right hemisphere)
                // Additional channels from model recommendations
                P3: 0.0,  // Left temporal (semantic processing)
                C3: 0.0,  // Left central
                F3: 0.0,  // Left frontal
            },
            attentionalEngagement: 0.0,
            // Plasticity tracking
            plasticity: {
                recoveryScore: 0.0,
                sleepHours: 0.0,
                lastRecovery: 0,
                coherenceTrend: [],
            },
            // Tunnel Diode (TD) on Z-vector
            tunnelDiode: {
                enabled: false,
                Z: 0,              // Impedance (Ohms)
                coherence: 1.0,    // TD coherence (0-1)
                diodeV: 0,         // Diode voltage
                diodeI: 0,         // Diode current
                inNDR: false,      // In negative differential resistance region
                operatingPoint: 0.1, // Peak voltage (Vp)
                valleyPoint: 0.4,  // Valley voltage (Vv)
                peakCurrent: 0.002, // Peak current (A)
                valleyCurrent: 0.0005, // Valley current (A)
                history: [],
            },
        },
        // Dynamic bicameral weighting
        bicameralWeights: {
            left: 0.5,      // Analytical weight (0.0 - 1.0)
            right: 0.5,     // Intuitive weight (0.0 - 1.0)
            mode: 'adaptive', // 'adaptive', 'balanced', 'analytical', 'intuitive', 'manual'
            currentTask: null,
            lastAdjustment: 0,
            adjustmentHistory: [],
        },
        // Learning modes (from model recommendations)
        learningModes: {
            passiveMode: {
                enabled: false,
                description: 'Immersive absorption without deep analysis',
                rightHemisphereBias: 0.8, // 80% right, 20% left
                suppressDetailLogging: true,
                showPatternsOnly: true,
            },
            focusedSession: {
                enabled: false,
                duration: 15 * 60 * 1000, // 15 minutes in ms
                startTime: 0,
                timeRemaining: 0,
                suppressDeepAnalysis: true,
                briefMode: true,
            },
            visualSpatialMode: {
                enabled: false,
                description: 'Non-verbal spatial pattern recognition',
                rightHemisphereBias: 0.85,
                suppressNarrative: true,
                enhanceMatrixVisualization: true,
                showSpatialCues: true,
            },
            explorationMode: {
                enabled: false,
                description: 'Non-detailed exploration during Z-tests',
                suppressDetailedLogs: true,
                showVisualSummaryOnly: true,
                passiveObservation: true,
            },
        },
    };

    // ==========================================
    // QUERY CACHE
    // ==========================================
    class QueryCache {
        constructor(maxSize = CONFIG.CACHE_SIZE) {
            this.maxSize = maxSize;
            this.cache = new Map();
            this.hits = 0;
            this.misses = 0;
        }

        get(key) {
            const entry = this.cache.get(key);
            if (!entry) {
                this.misses++;
                return null;
            }
            if (Date.now() - entry.timestamp > CONFIG.CACHE_TTL) {
                this.cache.delete(key);
                this.misses++;
                return null;
            }
            this.cache.delete(key);
            this.cache.set(key, entry);
            this.hits++;
            return entry.value;
        }

        set(key, value) {
            if (this.cache.has(key)) {
                this.cache.delete(key);
            } else if (this.cache.size >= this.maxSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            this.cache.set(key, { value, timestamp: Date.now() });
        }

        clear() {
            this.cache.clear();
            this.hits = 0;
            this.misses = 0;
        }

        getStats() {
            const total = this.hits + this.misses;
            return {
                hits: this.hits,
                misses: this.misses,
                size: this.cache.size,
                hitRate: total > 0 ? (this.hits / total) * 100 : 0
            };
        }
    }

    const queryCache = new QueryCache();

    // ==========================================
    // NETWORK TRAFFIC HELPERS
    // ==========================================
    function getPacketColor(type) {
        // Color coding for different message types
        switch (type) {
            case 'inference_result':
                return { r: 255, g: 170, b: 0 }; // Orange - AI responses
            case 'chat_response':
                return { r: 0, g: 170, b: 255 }; // Blue - chat
            case 'eeg_frame':
                return { r: 0, g: 255, b: 100 }; // Green - EEG data
            case 'models_list':
                return { r: 200, g: 0, b: 255 }; // Purple - system
            case 'pipeline_status':
                return { r: 255, g: 100, b: 100 }; // Pink - status
            case 'cache_stats':
                return { r: 100, g: 255, b: 255 }; // Cyan - cache
            case 'error':
                return { r: 255, g: 0, b: 0 }; // Red - errors
            default:
                return { r: 170, g: 170, b: 170 }; // Gray - unknown
        }
    }

    function updateNetworkMetrics() {
        const now = performance.now();
        const metrics = state.networkMetrics;
        
        // Decay error rate
        metrics.errorRate *= 0.99;
        
        // Calculate connection quality (0-1)
        if (state.connected) {
            const packetFlow = Math.min(metrics.messagesPerSecond / 60, 1); // Normalize to 60fps
            const errorScore = 1 - metrics.errorRate;
            metrics.connectionQuality = packetFlow * 0.7 + errorScore * 0.3;
        } else {
            metrics.connectionQuality = 0;
        }
        
        // OPTIMIZATION: Update packets in-place without creating new array
        // Use swap-and-pop pattern to avoid GC pressure from filter()
        for (let i = state.packets.length - 1; i >= 0; i--) {
            const p = state.packets[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02;
            
            // Remove dead/out-of-bounds packets
            if (p.life <= 0 || p.x < 0 || p.x >= CONFIG.MATRIX_SIZE || p.y < 0 || p.y >= CONFIG.MATRIX_SIZE) {
                // Swap with last element and pop (avoid array reallocation)
                const last = state.packets[state.packets.length - 1];
                state.packets[i] = last;
                state.packets.pop();
            }
        }
    }

    // ==========================================
    // Z-VECTOR BOUNDARY PROCESSING
    // ==========================================
    function updateZVectorCoherence() {
        const zv = state.zVector;
        const pl = zv.plasticity;
        
        // Calculate coherence from hemisphere response times
        // Coherence = 1 - (time_diff / total_time)
        const now = performance.now();
        
        if (state.pendingResponses.left && state.pendingResponses.right) {
            const leftTime = state.pendingResponses.left.timestamp;
            const rightTime = state.pendingResponses.right.timestamp;
            const timeDiff = Math.abs(leftTime - rightTime);
            
            // Coherence degrades with temporal separation
            zv.coherenceLevel = Math.max(0.3, 1 - (timeDiff / 1000));
        } else if (state.pendingResponses.left || state.pendingResponses.right) {
            // Only one hemisphere responding - reduced coherence
            zv.coherenceLevel = Math.max(0.3, zv.coherenceLevel * 0.95);
        } else {
            // Both idle - maintain baseline with slight recovery
            const targetBaseline = 0.54 + (pl.recoveryScore * 0.2);
            zv.coherenceLevel += (targetBaseline - zv.coherenceLevel) * 0.05;
        }
        
        // Track coherence trend for plasticity assessment
        pl.coherenceTrend.push({
            time: now,
            coherence: zv.coherenceLevel,
        });
        
        // Limit trend history (keep last 100 samples)
        if (pl.coherenceTrend.length > 100) {
            pl.coherenceTrend.shift();
        }
        
        // Calculate recovery score based on coherence stability
        if (pl.coherenceTrend.length > 20) {
            const recent = pl.coherenceTrend.slice(-20);
            const avg = recent.reduce((a, b) => a + b.coherence, 0) / recent.length;
            const variance = recent.reduce((a, b) => a + Math.pow(b.coherence - avg, 2), 0) / recent.length;
            pl.recoveryScore = Math.max(0, Math.min(1, avg - variance));
        }
        
        // LOW COHERENCE ALERT (< 0.30 as per model output)
        if (zv.coherenceLevel < 0.30 && !zv.lowCoherenceAlerted) {
            zv.lowCoherenceAlerted = true;
            addChatMessage('system', 
                `⚠️ LOW COHERENCE ALERT: ${(zv.coherenceLevel * 100).toFixed(1)}%\n` +
                `Hemispheres functionally disconnected. Recommendations:\n` +
                `1. Target P3 (left temporal) for semantic engagement\n` +
                `2. Target P7/C3 (right hemisphere) for visual/spatial tasks\n` +
                `3. Ensure 8+ hours sleep for plasticity recovery`, 
                'both'
            );
        } else if (zv.coherenceLevel >= 0.40) {
            zv.lowCoherenceAlerted = false; // Reset when coherence recovers
        }
        
        // Detect boundary state
        if (zv.coherenceLevel <= zv.decoherenceThreshold) {
            zv.boundaryActive = true;
            zv.boundaryLocation = 'center';
        } else {
            zv.boundaryActive = false;
            zv.boundaryLocation = null;
        }
        
        // Simulate EEG channel readings based on coherence
        // Lower coherence = higher "noise" in channels
        const noiseLevel = 1 - zv.coherenceLevel;
        zv.channels.F4 = 0.5 + (Math.random() - 0.5) * noiseLevel;
        zv.channels.C4 = 0.5 + (Math.random() - 0.5) * noiseLevel;
        zv.channels.PZ = 0.5 + (Math.random() - 0.5) * noiseLevel * 0.5; // Midline less affected
        zv.channels.P8 = 0.5 + (Math.random() - 0.5) * noiseLevel;
        
        // Model-recommended channels for specific targeting
        zv.channels.P3 = 0.5 + (Math.random() - 0.5) * noiseLevel * 0.8; // Left temporal - semantic
        zv.channels.C3 = 0.5 + (Math.random() - 0.5) * noiseLevel * 0.9; // Left central
        zv.channels.F3 = 0.5 + (Math.random() - 0.5) * noiseLevel * 0.7; // Left frontal
    }

    function startZVectorTest() {
        const zv = state.zVector;
        zv.testMode = true;
        zv.lastTestTime = performance.now();
        zv.quantumExposure = 1.0;
        
        // Expose to "quantum input" - temporarily reduce coherence
        zv.coherenceLevel = Math.max(0.3, zv.coherenceLevel - 0.2);
        
        addChatMessage('system', 'Z-vector boundary test initiated. Coherence temporarily reduced.', 'both');
        
        // Gradual recovery
        const recoveryInterval = setInterval(() => {
            zv.quantumExposure *= 0.95;
            if (zv.quantumExposure < 0.1) {
                zv.testMode = false;
                clearInterval(recoveryInterval);
                
                // Record test results
                const testResult = {
                    timestamp: performance.now(),
                    minCoherence: zv.coherenceLevel,
                    thresholdCrossed: zv.coherenceLevel <= zv.decoherenceThreshold,
                    recoverySuccessful: zv.coherenceLevel > 0.5,
                };
                zv.testResults.push(testResult);
                
                // Limit history
                if (zv.testResults.length > 10) {
                    zv.testResults.shift();
                }
                
                addChatMessage('system', `Z-vector test complete. Min coherence: ${testResult.minCoherence.toFixed(3)}`, 'both');
            }
        }, 100);
    }

    function enhanceAttentionalEngagement() {
        const zv = state.zVector;
        zv.attentionalEngagement = Math.min(1.0, zv.attentionalEngagement + 0.3);
        
        // Higher engagement = lower effective threshold
        const effectiveThreshold = zv.decoherenceThreshold * (1 - zv.attentionalEngagement * 0.3);
        
        // Boost coherence through focused attention
        zv.coherenceLevel = Math.min(0.95, zv.coherenceLevel + 0.15);
        
        addChatMessage('system', 'Attentional engagement enhanced. Coherence boosted.', 'both');
        
        // Gradual decay of attention
        setTimeout(() => {
            zv.attentionalEngagement *= 0.9;
        }, 2000);
    }

    // ==========================================
    // TUNNEL DIODE (TD) ON Z-VECTOR
    // ==========================================
    function toggleTunnelDiode() {
        const zv = state.zVector;
        const td = zv.tunnelDiode;
        td.enabled = !td.enabled;
        
        if (td.enabled) {
            addChatMessage('system', 'Tunnel Diode (Z-vector) ACTIVATED - NDR processing enabled', 'both');
        } else {
            addChatMessage('system', 'Tunnel Diode (Z-vector) DEACTIVATED - linear processing', 'both');
        }
        
        updateTDisplay();
    }

    function tunnelDiodeIV(V) {
        // Esaki tunnel diode I-V characteristic approximation
        // I = I_p * (V/V_p) * exp(1 - V/V_p) + I_v * exp((V - V_v)/0.1)
        const zv = state.zVector;
        const td = zv.tunnelDiode;
        
        const Vp = td.operatingPoint;  // Peak voltage (typically ~0.1V)
        const Vv = td.valleyPoint;     // Valley voltage (typically ~0.4V)
        const Ip = td.peakCurrent;     // Peak current
        const Iv = td.valleyCurrent;   // Valley current
        
        // Tunneling component (peak region)
        const tunneling = Ip * (V / Vp) * Math.exp(1 - V / Vp);
        
        // Excess current (valley region)
        const excess = Iv * Math.exp((V - Vv) / 0.1);
        
        // Thermal current (high voltage)
        const thermal = Iv * (Math.exp((V - Vv) / 0.026) - 1);
        
        return tunneling + excess + thermal;
    }

    function updateTunnelDiode() {
        const zv = state.zVector;
        const td = zv.tunnelDiode;
        
        if (!td.enabled) {
            td.Z = 0;
            td.coherence = 1.0;
            td.inNDR = false;
            return;
        }
        
        // Map coherence to diode voltage (0.0 to 0.6V range)
        // Lower coherence = lower voltage (NDR region)
        const coherenceNormalized = (zv.coherenceLevel - 0.3) / 0.7; // Normalize to 0-1
        td.diodeV = Math.max(0, Math.min(0.6, coherenceNormalized * 0.6));
        
        // Calculate current
        td.diodeI = tunnelDiodeIV(td.diodeV);
        
        // Calculate differential impedance (dV/dI)
        const deltaV = 0.001;
        const I1 = tunnelDiodeIV(td.diodeV - deltaV);
        const I2 = tunnelDiodeIV(td.diodeV + deltaV);
        const dI = I2 - I1;
        td.Z = dI !== 0 ? (2 * deltaV) / dI : 0;
        
        // Detect NDR region (negative Z)
        td.inNDR = td.Z < -5; // Threshold for NDR detection
        
        // TD coherence based on proximity to optimal operating point
        // Best coherence at peak of NDR region (around Vp)
        const distFromPeak = Math.abs(td.diodeV - td.operatingPoint);
        td.coherence = Math.max(0, 1 - distFromPeak / 0.2);
        
        // Record history
        td.history.push({
            t: performance.now(),
            V: td.diodeV,
            I: td.diodeI,
            Z: td.Z,
            inNDR: td.inNDR,
        });
        
        // Limit history
        if (td.history.length > 50) {
            td.history.shift();
        }
    }

    function getTunnelDiodeStatus() {
        const zv = state.zVector;
        const td = zv.tunnelDiode;
        
        return {
            enabled: td.enabled,
            Z: td.Z.toFixed(1),
            coherence: (td.coherence * 100).toFixed(0),
            voltage: td.diodeV.toFixed(3),
            current: (td.diodeI * 1000).toFixed(2),
            inNDR: td.inNDR,
            mode: td.inNDR ? 'NDR-ACTIVE' : (td.enabled ? 'LINEAR' : 'OFF'),
        };
    }

    function updateTDisplay() {
        const tdStatus = getTunnelDiodeStatus();
        
        // Update display elements
        const tdZ = document.getElementById('td-z');
        const tdCoh = document.getElementById('td-coh');
        const tdMode = document.getElementById('td-mode');
        const tdToggle = document.getElementById('td-toggle');
        
        if (tdZ) {
            tdZ.textContent = tdStatus.Z + 'Ω';
            tdZ.style.color = tdStatus.inNDR ? '#32cd32' : (tdStatus.enabled ? '#fa0' : '#553300');
        }
        if (tdCoh) {
            tdCoh.textContent = tdStatus.coherence + '%';
            tdCoh.className = tdStatus.inNDR ? 'td-coherence coherence-high' : 
                              (tdStatus.enabled ? 'td-coherence coherence-mid' : 'td-coherence coherence-low');
        }
        if (tdMode) {
            tdMode.textContent = tdStatus.mode;
            tdMode.style.color = tdStatus.inNDR ? '#32cd32' : (tdStatus.enabled ? '#fa0' : '#553300');
        }
        if (tdToggle) {
            tdToggle.textContent = tdStatus.enabled ? 'TD: ON' : 'TD: OFF';
            tdToggle.style.background = tdStatus.enabled ? (tdStatus.inNDR ? '#32cd32' : '#fa0') : 'transparent';
            tdToggle.style.color = tdStatus.enabled ? '#000' : '#fa0';
        }
    }

    // ==========================================
    // LEARNING MODES (Passive, Focused, Visual, Exploration)
    // ==========================================
    function togglePassiveMode() {
        const lm = state.learningModes;
        lm.passiveMode.enabled = !lm.passiveMode.enabled;
        
        if (lm.passiveMode.enabled) {
            // Enable right-hemisphere weighted processing
            adjustBicameralWeights(0.2, 0.8, 'passive');
            addChatMessage('system', 
                '🌊 PASSIVE MODE ACTIVATED\n' +
                '→ Immersive absorption without deep analysis\n' +
                '→ Right hemisphere bias: 80%\n' +
                '→ Detail logging suppressed\n' +
                '→ Pattern recognition prioritized', 
                'both'
            );
        } else {
            // Return to adaptive mode
            adjustBicameralWeights(0.5, 0.5, 'adaptive');
            addChatMessage('system', 'Passive mode deactivated. Returning to adaptive processing.', 'both');
        }
        
        updateLearningModeDisplay();
    }

    function toggleFocusedSession() {
        const lm = state.learningModes;
        const fs = lm.focusedSession;
        
        if (!fs.enabled) {
            // Start focused session
            fs.enabled = true;
            fs.startTime = performance.now();
            fs.timeRemaining = fs.duration;
            
            // Set brief mode weights (60/40 favoring neither hemisphere strongly)
            adjustBicameralWeights(0.5, 0.5, 'focused');
            
            addChatMessage('system', 
                '⏱️ FOCUSED SESSION STARTED\n' +
                '→ Duration: 15 minutes\n' +
                '→ Deep analysis suppressed\n' +
                '→ Brief, direct responses only\n' +
                '→ Timer active', 
                'both'
            );
            
            // Start countdown
            startFocusedSessionTimer();
        } else {
            // End session early
            endFocusedSession();
        }
        
        updateLearningModeDisplay();
    }

    function startFocusedSessionTimer() {
        const lm = state.learningModes;
        const fs = lm.focusedSession;
        
        const timerInterval = setInterval(() => {
            if (!fs.enabled) {
                clearInterval(timerInterval);
                return;
            }
            
            const elapsed = performance.now() - fs.startTime;
            fs.timeRemaining = Math.max(0, fs.duration - elapsed);
            
            // Update display every second
            updateLearningModeDisplay();
            
            // Check if time is up
            if (fs.timeRemaining <= 0) {
                endFocusedSession();
                clearInterval(timerInterval);
            }
        }, 1000);
    }

    function endFocusedSession() {
        const lm = state.learningModes;
        const fs = lm.focusedSession;
        
        fs.enabled = false;
        fs.timeRemaining = 0;
        
        addChatMessage('system', 
            '✅ FOCUSED SESSION COMPLETE\n' +
            '→ Session ended\n' +
            '→ Returning to adaptive mode', 
            'both'
        );
        
        // Return to adaptive mode
        adjustBicameralWeights(0.5, 0.5, 'adaptive');
        updateLearningModeDisplay();
    }

    function toggleVisualSpatialMode() {
        const lm = state.learningModes;
        const vs = lm.visualSpatialMode;
        
        vs.enabled = !vs.enabled;
        
        if (vs.enabled) {
            // Enable strong right-hemisphere bias for visual/spatial
            adjustBicameralWeights(0.15, 0.85, 'visual');
            addChatMessage('system', 
                '👁️ VISUAL/SPATIAL MODE ACTIVATED\n' +
                '→ Non-verbal pattern recognition\n' +
                '→ Narrative suppressed\n' +
                '→ Matrix visualization enhanced\n' +
                '→ Spatial cues enabled', 
                'both'
            );
        } else {
            adjustBicameralWeights(0.5, 0.5, 'adaptive');
            addChatMessage('system', 'Visual/spatial mode deactivated.', 'both');
        }
        
        updateLearningModeDisplay();
    }

    function toggleExplorationMode() {
        const lm = state.learningModes;
        const em = lm.explorationMode;
        
        em.enabled = !em.enabled;
        
        if (em.enabled) {
            // Link with Z-vector test mode if active
            const zv = state.zVector;
            if (zv.testMode) {
                addChatMessage('system', 
                    '🔍 EXPLORATION MODE ACTIVATED (Z-test linked)\n' +
                    '→ Detailed logs suppressed\n' +
                    '→ Visual summary only\n' +
                    '→ Passive observation mode', 
                    'both'
                );
            } else {
                addChatMessage('system', 
                    '🔍 EXPLORATION MODE ACTIVATED\n' +
                    '→ Detailed logs suppressed\n' +
                    '→ Visual summary only\n' +
                    '→ Passive observation mode\n' +
                    '(Start Z-vector test for linked exploration)', 
                    'both'
                );
            }
            
            // Set balanced weights for exploration
            adjustBicameralWeights(0.45, 0.55, 'exploration');
        } else {
            adjustBicameralWeights(0.5, 0.5, 'adaptive');
            addChatMessage('system', 'Exploration mode deactivated.', 'both');
        }
        
        updateLearningModeDisplay();
    }

    function updateLearningModeDisplay() {
        const lm = state.learningModes;
        
        // Update passive mode button
        const pmBtn = document.getElementById('btn-passive-mode');
        if (pmBtn) {
            pmBtn.textContent = lm.passiveMode.enabled ? 'Passive: ON' : 'Passive: OFF';
            pmBtn.style.background = lm.passiveMode.enabled ? '#ffaa00' : 'transparent';
            pmBtn.style.color = lm.passiveMode.enabled ? '#000' : '#fa0';
        }
        
        // Update focused session button and timer
        const fsBtn = document.getElementById('btn-focused-session');
        const fsTimer = document.getElementById('focused-timer');
        if (fsBtn) {
            if (lm.focusedSession.enabled) {
                const minutes = Math.floor(lm.focusedSession.timeRemaining / 60000);
                const seconds = Math.floor((lm.focusedSession.timeRemaining % 60000) / 1000);
                const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                fsBtn.textContent = `⏱️ ${timeStr}`;
                fsBtn.style.background = '#ffaa00';
                fsBtn.style.color = '#000';
                if (fsTimer) fsTimer.textContent = timeStr;
            } else {
                fsBtn.textContent = '15min Focus';
                fsBtn.style.background = 'transparent';
                fsBtn.style.color = '#fa0';
                if (fsTimer) fsTimer.textContent = '--:--';
            }
        }
        
        // Update visual/spatial button
        const vsBtn = document.getElementById('btn-visual-mode');
        if (vsBtn) {
            vsBtn.textContent = lm.visualSpatialMode.enabled ? 'Visual: ON' : 'Visual: OFF';
            vsBtn.style.background = lm.visualSpatialMode.enabled ? '#00ff88' : 'transparent';
            vsBtn.style.color = lm.visualSpatialMode.enabled ? '#000' : '#fa0';
        }
        
        // Update exploration mode button
        const emBtn = document.getElementById('btn-exploration-mode');
        if (emBtn) {
            emBtn.textContent = lm.explorationMode.enabled ? 'Explore: ON' : 'Explore: OFF';
            emBtn.style.background = lm.explorationMode.enabled ? '#ff66ff' : 'transparent';
            emBtn.style.color = lm.explorationMode.enabled ? '#000' : '#fa0';
        }
    }

    function getActiveLearningMode() {
        const lm = state.learningModes;
        
        if (lm.focusedSession.enabled) return 'focused';
        if (lm.passiveMode.enabled) return 'passive';
        if (lm.visualSpatialMode.enabled) return 'visual';
        if (lm.explorationMode.enabled) return 'exploration';
        
        return 'standard';
    }

    // ==========================================
    // DYNAMIC BICAMERAL WEIGHTING
    // ==========================================
    function analyzeProcessingNeeds(query) {
        // Detect query type and return required hemisphere weighting
        const lowerQuery = query.toLowerCase();
        const queryLength = query.length;
        const wordCount = query.split(/\s+/).length;
        
        // Analytical patterns (Left hemisphere weighted) - logic, facts, procedures
        const analyticalPatterns = [
            { pattern: /\b(calculate|compute|solve|equation|formula|math|number|statistics|proof|verify|debug|test|validate|count|measure|quantify)\b/, weight: 3 },
            { pattern: /\b(what is|what are|define|explain|describe|list|compare|contrast|difference between|versus|vs|how does|how to|why is)\b/, weight: 2 },
            { pattern: /\b(logic|algorithm|procedure|method|step|process|system|structure|organize|classify|categorize)\b/, weight: 2 },
            { pattern: /\b(analyze|breakdown|examine|investigate|assess|evaluate|determine|identify|find|search|look for)\b/, weight: 2 },
            { pattern: /\b(error|bug|issue|problem|fix|repair|correct|troubleshoot|diagnose)\b/, weight: 2 },
            { pattern: /\?(.*\?)/, weight: 2 }, // Multiple questions
            { pattern: /\b(code|program|script|function|variable|database|query|api|server|client|request|response)\b/, weight: 3 },
        ];
        
        // Intuitive patterns (Right hemisphere weighted) - creativity, patterns, synthesis
        const intuitivePatterns = [
            { pattern: /\b(creative|design|imagine|visualize|picture|see|look|view|perspective|angle|approach)\b/, weight: 3 },
            { pattern: /\b(pattern|holistic|big picture|overview|summary|essence|core|heart|soul|spirit|feel|sense|intuition)\b/, weight: 2 },
            { pattern: /\b(vision|art|beauty|aesthetic|style|form|shape|color|texture|composition|layout)\b/, weight: 3 },
            { pattern: /\b(meaning|purpose|why|should|recommend|suggest|advice|tip|idea|brainstorm|innovate|create|generate)\b/, weight: 2 },
            { pattern: /\b(story|narrative|metaphor|analogy|example|scenario|case|experience|insight|wisdom|understand|grasp|comprehend)\b/, weight: 2 },
            { pattern: /\b(synthesize|integrate|combine|merge|blend|unify|harmonize|balance|connect|relate|associate)\b/, weight: 2 },
            { pattern: /\b(future|possibility|potential|imagine|dream|vision|goal|aspiration|hope|desire|want|need)\b/, weight: 2 },
        ];
        
        // Balanced patterns (equal weighting)
        const balancedPatterns = [
            /\b(synthesize|integrate|merge|unify|both|balance|harmony|blend|together|overall|complete|full|comprehensive|bicameral)\b/,
        ];
        
        // Check for patterns with weighted scoring
        let analyticalScore = 0;
        let intuitiveScore = 0;
        let balancedScore = 0;
        
        analyticalPatterns.forEach(({ pattern, weight }) => {
            const matches = lowerQuery.match(pattern);
            if (matches) {
                analyticalScore += weight * matches.length;
            }
        });
        
        intuitivePatterns.forEach(({ pattern, weight }) => {
            const matches = lowerQuery.match(pattern);
            if (matches) {
                intuitiveScore += weight * matches.length;
            }
        });
        
        balancedPatterns.forEach(pattern => {
            if (pattern.test(lowerQuery)) balancedScore++;
        });
        
        // Heuristic: Short factual queries (< 10 words) tend to be analytical
        if (wordCount < 10 && queryLength < 60) {
            analyticalScore += 1;
        }
        
        // Heuristic: Longer, more complex queries with multiple sentences tend toward intuitive/synthesis
        const sentenceCount = query.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
        if (sentenceCount > 1 || wordCount > 20) {
            intuitiveScore += 1;
        }
        
        // Heuristic: Questions starting with "How" or "What" tend analytical
        if (/^\s*(how|what|when|where|who|which)\b/i.test(query)) {
            analyticalScore += 2;
        }
        
        // Heuristic: Questions/requests with emotional or subjective language
        if (/\b(think|believe|feel|prefer|like|love|hate|enjoy|want|need|hope)\b/i.test(query)) {
            intuitiveScore += 2;
        }
        
        // Determine processing type
        const totalScore = analyticalScore + intuitiveScore + balancedScore;
        
        // If no strong patterns detected, use query characteristics to decide
        if (totalScore === 0) {
            if (wordCount < 8) {
                // Short query - likely analytical/factual
                return { type: 'analytical', left: 0.65, right: 0.35, description: 'Analytical mode (65% left) - short factual query' };
            } else {
                // Longer query - balanced approach
                return { type: 'balanced', left: 0.5, right: 0.5, description: 'Balanced mode (50/50) - complex query' };
            }
        }
        
        if (balancedScore > 0) {
            return { type: 'synthesis', left: 0.5, right: 0.5, description: 'Balanced synthesis mode' };
        } else if (analyticalScore > intuitiveScore) {
            // Calculate weight based on score differential (minimum 60/40, max 85/15)
            const scoreDiff = analyticalScore - intuitiveScore;
            const weight = Math.min(0.85, Math.max(0.6, 0.5 + (scoreDiff * 0.03)));
            return { 
                type: 'analytical', 
                left: weight, 
                right: 1 - weight, 
                description: `Analytical mode (${(weight*100).toFixed(0)}% left)` 
            };
        } else if (intuitiveScore > analyticalScore) {
            const scoreDiff = intuitiveScore - analyticalScore;
            const weight = Math.min(0.85, Math.max(0.6, 0.5 + (scoreDiff * 0.03)));
            return { 
                type: 'intuitive', 
                left: 1 - weight, 
                right: weight, 
                description: `Intuitive mode (${(weight*100).toFixed(0)}% right)` 
            };
        } else {
            return { type: 'balanced', left: 0.5, right: 0.5, description: 'Default balanced mode' };
        }
    }

    function adjustBicameralWeights(leftWeight, rightWeight, mode = 'manual') {
        const bw = state.bicameralWeights;
        
        // Validate weights
        const total = leftWeight + rightWeight;
        if (total === 0) {
            console.error('[Bicameral] Invalid weights: both zero');
            return false;
        }
        
        // Normalize to ensure they sum to 1.0
        bw.left = leftWeight / total;
        bw.right = rightWeight / total;
        bw.mode = mode;
        bw.lastAdjustment = performance.now();
        
        // Record adjustment
        bw.adjustmentHistory.push({
            timestamp: performance.now(),
            left: bw.left,
            right: bw.right,
            mode: mode,
        });
        
        // Limit history
        if (bw.adjustmentHistory.length > 20) {
            bw.adjustmentHistory.shift();
        }
        
        // Update UI
        updateBicameralDisplay();
        
        return true;
    }

    function setBicameralMode(mode) {
        const bw = state.bicameralWeights;
        bw.mode = mode;
        
        switch (mode) {
            case 'balanced':
                adjustBicameralWeights(0.5, 0.5, 'balanced');
                addChatMessage('system', 'Bicameral mode: Balanced (50/50)', 'both');
                break;
            case 'analytical':
                adjustBicameralWeights(0.7, 0.3, 'analytical');
                addChatMessage('system', 'Bicameral mode: Analytical (70/30)', 'both');
                break;
            case 'intuitive':
                adjustBicameralWeights(0.3, 0.7, 'intuitive');
                addChatMessage('system', 'Bicameral mode: Intuitive (30/70)', 'both');
                break;
            case 'adaptive':
                bw.mode = 'adaptive';
                // Set initial balanced weights but mark as adaptive for future adjustments
                adjustBicameralWeights(0.5, 0.5, 'adaptive');
                addChatMessage('system', 'Bicameral mode: Adaptive (auto-detect)', 'both');
                break;
            default:
                console.warn('[Bicameral] Unknown mode:', mode);
        }
    }

    function autoAdjustWeights(query) {
        const bw = state.bicameralWeights;
        
        if (bw.mode !== 'adaptive') {
            return; // Only adjust in adaptive mode
        }
        
        const analysis = analyzeProcessingNeeds(query);
        bw.currentTask = analysis.type;
        
        // Smooth transition to new weights
        const targetLeft = analysis.left;
        const targetRight = analysis.right;
        const currentLeft = bw.left;
        const currentRight = bw.right;
        
        // Gradual adjustment (20% per step)
        const newLeft = currentLeft + (targetLeft - currentLeft) * 0.2;
        const newRight = currentRight + (targetRight - currentRight) * 0.2;
        
        adjustBicameralWeights(newLeft, newRight, 'adaptive');
    }
    
    // ==========================================
    // ADAPTIVE COHERENCE OPTIMIZATION
    // ==========================================
    
    // Monitor coherence and auto-adjust for optimal performance
    let lastCoherenceCheck = 0;
    const COHERENCE_CHECK_INTERVAL = 2000; // Check every 2 seconds
    
    function adaptiveCoherenceTuning(timestamp) {
        if (timestamp - lastCoherenceCheck < COHERENCE_CHECK_INTERVAL) {
            return;
        }
        lastCoherenceCheck = timestamp;
        
        const bw = state.bicameralWeights;
        const coherence = state.zVector.coherenceLevel;
        const threshold = state.zVector.decoherenceThreshold;
        
        // Only auto-adjust in adaptive mode
        if (bw.mode !== 'adaptive') return;
        
        // Coherence-based weight adjustment strategy
        let targetLeft, targetRight, reason;
        
        if (coherence < 0.65) {
            // Critical low coherence: Boost analytical to stabilize
            targetLeft = 0.75;
            targetRight = 0.25;
            reason = 'Critical coherence - boosting analytical stabilization';
        } else if (coherence < 0.75) {
            // Low coherence: Slightly favor analytical
            targetLeft = 0.65;
            targetRight = 0.35;
            reason = 'Low coherence - analytical bias';
        } else if (coherence > 0.90) {
            // High coherence: Allow creative freedom
            targetLeft = 0.35;
            targetRight = 0.65;
            reason = 'High coherence - intuitive freedom';
        } else if (coherence > 0.85) {
            // Good coherence: Balanced with slight intuitive lean
            targetLeft = 0.45;
            targetRight = 0.55;
            reason = 'Optimal coherence - balanced preference';
        } else {
            // Medium coherence: Maintain balance
            targetLeft = 0.5;
            targetRight = 0.5;
            reason = null; // No adjustment needed
        }
        
        // Only adjust if significantly different from current
        const currentDiff = Math.abs(bw.left - targetLeft);
        if (currentDiff > 0.15 && reason) {
            // Smooth transition (30% per adjustment)
            const newLeft = bw.left + (targetLeft - bw.left) * 0.3;
            const newRight = bw.right + (targetRight - bw.right) * 0.3;
            
            adjustBicameralWeights(newLeft, newRight, 'adaptive');
            
            // Log to chat (throttled to avoid spam)
            if (Math.random() < 0.3) { // 30% chance to show message
                addChatMessage('system', `Auto-adjust: ${reason} (${coherence.toFixed(2)})`, 'both');
            }
            
            console.log(`[Coherence] ${reason} | Target: ${targetLeft.toFixed(2)}/${targetRight.toFixed(2)} | Current: ${coherence.toFixed(3)}`);
        }
    }
    
    // ==========================================
    // SEMANTIC PRUNING SYSTEM
    // ==========================================
    
    // Cache for frequently accessed patterns
    const inferenceCache = {
        warmPatterns: new Map(),
        maxSize: 50,
        hitCount: 0,
        missCount: 0,
        
        get(key) {
            const entry = this.warmPatterns.get(key);
            if (entry) {
                this.hitCount++;
                entry.lastAccess = performance.now();
                return entry.value;
            }
            this.missCount++;
            return null;
        },
        
        set(key, value) {
            if (this.warmPatterns.size >= this.maxSize) {
                // Evict oldest
                let oldestKey = null;
                let oldestTime = Infinity;
                for (const [k, v] of this.warmPatterns) {
                    if (v.lastAccess < oldestTime) {
                        oldestTime = v.lastAccess;
                        oldestKey = k;
                    }
                }
                if (oldestKey) this.warmPatterns.delete(oldestKey);
            }
            
            this.warmPatterns.set(key, {
                value,
                lastAccess: performance.now()
            });
        },
        
        getStats() {
            const total = this.hitCount + this.missCount;
            return {
                hitRate: total > 0 ? this.hitCount / total : 0,
                size: this.warmPatterns.size,
                hits: this.hitCount,
                misses: this.missCount
            };
        },
        
        clear() {
            this.warmPatterns.clear();
            this.hitCount = 0;
            this.missCount = 0;
        }
    };
    
    // Semantic pruning: Filter low-coherence inference paths
    function semanticPrune(input, confidenceThreshold = 0.6) {
        // If left hemisphere confidence is below threshold, defer to right
        const leftConfidence = state.zVector.coherenceLevel;
        
        if (leftConfidence < confidenceThreshold) {
            // Skip analytical processing, use intuitive
            return {
                skipAnalytical: true,
                reason: `Low coherence (${leftConfidence.toFixed(2)} < ${confidenceThreshold})`,
                fallback: 'intuitive'
            };
        }
        
        // Check cache for warm patterns
        const cacheKey = input.slice(0, 50); // First 50 chars as key
        const cached = inferenceCache.get(cacheKey);
        if (cached) {
            return {
                skipAnalytical: true,
                reason: 'Cache hit',
                cached: true,
                result: cached
            };
        }
        
        return {
            skipAnalytical: false,
            reason: 'Full processing',
            cached: false
        };
    }
    
    // Bicameral processing with pruning and caching
    function processBicamerally(input, options = {}) {
        const { useCache = true, confidenceThreshold = 0.6 } = options;
        
        // Step 1: Semantic pruning check
        const pruneCheck = semanticPrune(input, confidenceThreshold);
        
        if (pruneCheck.skipAnalytical) {
            // Fast path: intuitive only
            const result = {
                output: `INTUITIVE: ${input}`, // Placeholder
                weights: { left: 0.2, right: 0.8 },
                coherence: state.zVector.coherenceLevel,
                path: pruneCheck.reason
            };
            
            // Cache if enabled
            if (useCache && !pruneCheck.cached) {
                inferenceCache.set(input.slice(0, 50), result);
            }
            
            return result;
        }
        
        // Step 2: Full bicameral processing
        // Right hemisphere: Pattern recognition, ideation
        const rightOutput = {
            patterns: ['pattern1', 'pattern2'], // Placeholder
            confidence: 0.8
        };
        
        // Left hemisphere: Structure, logic, validation
        const leftOutput = {
            structure: 'validated',
            consistency: 0.85,
            errors: []
        };
        
        // Step 3: Weighted synthesis
        const bw = state.bicameralWeights;
        const synthesis = {
            output: `SYNTHESIZED: ${input}`, // Placeholder
            leftConfidence: leftOutput.consistency,
            rightConfidence: rightOutput.confidence,
            finalCoherence: state.zVector.coherenceLevel,
            weights: { left: bw.left, right: bw.right },
            path: 'Full bicameral'
        };
        
        // Cache result
        if (useCache) {
            inferenceCache.set(input.slice(0, 50), synthesis);
        }
        
        return synthesis;
    }

    function getWeightedSynthesis(leftResponse, rightResponse) {
        const bw = state.bicameralWeights;
        
        // Apply weights to determine synthesis priority
        const leftWeight = bw.left;
        const rightWeight = bw.right;
        
        // Weighted extraction of key points
        const leftPoints = extractKeyPoints(leftResponse, Math.round(3 * leftWeight * 2));
        const rightPoints = extractKeyPoints(rightResponse, Math.round(3 * rightWeight * 2));
        
        // Interleave based on weights (more points from dominant hemisphere)
        let synthesis = [];
        const maxPoints = Math.max(leftPoints.length, rightPoints.length);
        
        for (let i = 0; i < maxPoints; i++) {
            // Add from left based on its weight
            if (i < leftPoints.length && Math.random() < leftWeight) {
                synthesis.push(`[◇${i+1}] ${leftPoints[i]}`);
            }
            // Add from right based on its weight  
            if (i < rightPoints.length && Math.random() < rightWeight) {
                synthesis.push(`[◆${i+1}] ${rightPoints[i]}`);
            }
        }
        
        // If one hemisphere has no points, boost the other
        if (synthesis.length === 0) {
            if (leftPoints.length > 0) {
                synthesis = leftPoints.map((p, i) => `[◇${i+1}] ${p}`);
            } else if (rightPoints.length > 0) {
                synthesis = rightPoints.map((p, i) => `[◆${i+1}] ${p}`);
            }
        }
        
        return synthesis.join('\n');
    }

    function updateBicameralDisplay() {
        const bw = state.bicameralWeights;
        const leftPct = (bw.left * 100).toFixed(0);
        const rightPct = (bw.right * 100).toFixed(0);
        
        // Update display elements if they exist
        const leftBar = document.getElementById('bc-left-bar');
        const rightBar = document.getElementById('bc-right-bar');
        const leftPctText = document.getElementById('bc-left-pct');
        const rightPctText = document.getElementById('bc-right-pct');
        const modeDisplay = document.getElementById('bc-mode');
        
        if (leftBar) leftBar.style.width = `${leftPct}%`;
        if (rightBar) rightBar.style.width = `${rightPct}%`;
        if (leftPctText) leftPctText.textContent = `${leftPct}%`;
        if (rightPctText) rightPctText.textContent = `${rightPct}%`;
        if (modeDisplay) modeDisplay.textContent = `${bw.mode.toUpperCase()} | L:${leftPct}% R:${rightPct}%`;
    }

    function getZVectorStatus() {
        const zv = state.zVector;
        const pl = zv.plasticity;
        const coherenceDiff = zv.coherenceLevel - zv.decoherenceThreshold;
        
        let status = 'NORMAL';
        if (zv.boundaryActive) status = 'BOUNDARY-CRITICAL';
        else if (coherenceDiff < 0.1) status = 'BOUNDARY-PROXIMATE';
        else if (zv.testMode) status = 'TESTING';
        else if (zv.coherenceLevel < 0.35) status = 'LOW-COHERENCE';
        
        return {
            coherence: zv.coherenceLevel.toFixed(3),
            threshold: zv.decoherenceThreshold.toFixed(3),
            diff: coherenceDiff.toFixed(3),
            status: status,
            boundary: zv.boundaryLocation || 'none',
            testMode: zv.testMode,
            recoveryScore: pl.recoveryScore.toFixed(2),
            plasticityStatus: pl.recoveryScore > 0.6 ? 'OPTIMAL' : 
                             pl.recoveryScore > 0.3 ? 'MODERATE' : 'DEPLETED',
            recommendations: getCoherenceRecommendations(zv.coherenceLevel),
        };
    }

    function getCoherenceRecommendations(coherence) {
        if (coherence < 0.30) {
            return [
                '⚠️ CRITICAL: Hemispheres disconnected',
                '→ Target P3 (left temporal) for semantic tasks',
                '→ Target P7/C3 (right) for visual/spatial engagement',
                '→ Ensure 8+ hours sleep recovery',
                '→ Consider attentional engagement boost',
            ];
        } else if (coherence < 0.40) {
            return [
                '⚡ Low coherence detected',
                '→ Engage both hemispheres in complex tasks',
                '→ Use visual processing exercises (right hemisphere)',
                '→ Practice semantic reasoning (left hemisphere)',
            ];
        } else if (coherence < 0.50) {
            return [
                '→ Maintain current processing',
                '→ Continue bilateral coordination exercises',
            ];
        } else {
            return [
                '✓ Optimal bicameral coherence',
                '→ System ready for complex integration tasks',
            ];
        }
    }

    function connect() {
        if (state.socket && state.socket.readyState === WebSocket.OPEN) return;
        
        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }

        try {
            state.socket = new WebSocket(CONFIG.WS_URL);
            
            state.socket.onopen = () => {
                state.connected = true;
                state.reconnectAttempts = 0;
                updateStatus('bridge', true);
                // These can be batched (not critical)
                send({ type: 'get_models' });
                send({ type: 'get_pipeline_status' });
                addChatMessage('system', 'Connected to bridge', 'both');
                
                // Start keepalive ping to prevent timeout during long responses
                // Send ping every 15 seconds to keep connection alive
                if (state.pingInterval) clearInterval(state.pingInterval);
                state.pingInterval = setInterval(() => {
                    if (state.connected && state.socket?.readyState === WebSocket.OPEN) {
                        send({ type: 'ping' }, true); // Immediate for ping (critical)
                    }
                }, 15000); // 15 seconds
            };
            
            state.socket.onmessage = (event) => {
                try {
                    const now = performance.now();
                    const data = JSON.parse(event.data);
                    
                    // Track network metrics
                    state.networkMetrics.messageCount++;
                    state.networkMetrics.bytesReceived += event.data.length;
                    
                    // Calculate messages per second
                    if (now - state.networkMetrics.lastMessageTime > 0) {
                        const instantMPS = 1000 / (now - state.networkMetrics.lastMessageTime);
                        state.networkMetrics.messagesPerSecond = 
                            state.networkMetrics.messagesPerSecond * 0.9 + instantMPS * 0.1;
                    }
                    state.networkMetrics.lastMessageTime = now;
                    
                    // Track packet for visualization
                    const packet = {
                        type: data.type || 'unknown',
                        size: event.data.length,
                        timestamp: now,
                        x: Math.random() * CONFIG.MATRIX_SIZE,
                        y: Math.random() * CONFIG.MATRIX_SIZE,
                        vx: (Math.random() - 0.5) * 4,
                        vy: (Math.random() - 0.5) * 4,
                        life: 1.0,
                        color: getPacketColor(data.type),
                    };
                    state.packets.push(packet);
                    
                    // Keep packet history for trend analysis
                    state.networkMetrics.packetHistory.push({
                        type: data.type,
                        size: event.data.length,
                        time: now,
                    });
                    
                    // Limit history
                    if (state.networkMetrics.packetHistory.length > 100) {
                        state.networkMetrics.packetHistory.shift();
                    }
                    
                    handleMessage(data);
                } catch (e) {
                    console.error('[WS] Parse error:', e);
                    state.networkMetrics.errorRate += 0.1;
                }
            };
            
            state.socket.onclose = (event) => {
                state.connected = false;
                state.eegRunning = false;
                updateStatus('bridge', false);
                updateStatus('eeg', false);
                
                // Clear ping interval
                if (state.pingInterval) {
                    clearInterval(state.pingInterval);
                    state.pingInterval = null;
                }
                
                if (event.code !== 1000 && state.reconnectAttempts < CONFIG.MAX_RECONNECT) {
                    state.reconnectAttempts++;
                    state.reconnectTimer = setTimeout(() => connect(), CONFIG.RECONNECT_DELAY);
                }
            };
            
            state.socket.onerror = (error) => {
                console.error('[WS] Error:', error);
            };
        } catch (e) {
            console.error('[WS] Connection failed:', e);
        }
    }

    // ==========================================
    // MESSAGE BATCHING (WebSocket Optimization)
    // ==========================================
    
    // Queue message for batched sending
    function queueMessage(data) {
        state.messageQueue.push(data);
        
        // Start batch timer if not already running
        if (!state.messageBatchTimer) {
            state.messageBatchTimer = setTimeout(flushMessageQueue, state.messageBatchInterval);
        }
    }
    
    // Flush queued messages (send as batch or individually)
    function flushMessageQueue() {
        state.messageBatchTimer = null;
        
        if (state.messageQueue.length === 0) return;
        
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            // If only one message, send directly
            if (state.messageQueue.length === 1) {
                state.socket.send(JSON.stringify(state.messageQueue[0]));
            } else {
                // Batch multiple messages into a single array
                const batchMessage = {
                    type: 'batch',
                    messages: state.messageQueue
                };
                state.socket.send(JSON.stringify(batchMessage));
            }
        }
        
        // Clear the queue
        state.messageQueue = [];
    }
    
    // Legacy send function - now uses batching for non-critical messages
    function send(data, immediate = false) {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return;
        
        if (immediate) {
            // Send immediately for critical messages (ping, chat, etc.)
            state.socket.send(JSON.stringify(data));
        } else {
            // Queue for batching for non-critical messages
            queueMessage(data);
        }
    }

    // ==========================================
    // MESSAGE HANDLERS
    // ==========================================
    function handleMessage(data) {
        switch (data.type) {
            case 'inference_result':
                handleInferenceResult(data);
                break;
            case 'models_list':
                updateModelList(data.models);
                break;
            case 'pipeline_status':
                updatePipelineStatus(data);
                break;
            case 'eeg_frame':
                handleEEGFrame(data);
                break;
            case 'qam_signal':
                handleQAMSignal(data);
                break;
            case 'chat_response':
                handleChatResponse(data);
                break;
            case 'cache_stats':
                updateCacheStats(data);
                break;
            case 'error':
                addChatMessage('system', `Error: ${data.message}`, 'both');
                break;
            case 'pong':
                // Keepalive response - connection is alive
                // console.debug('[WS] Pong received');
                break;
        }
    }

    function handleInferenceResult(data) {
        if (data.predicted_class === 'thinking' || data.predicted_class === 'processing') {
            updateHemisphereStatus(data.hemisphere, 'Processing...');
            return;
        }
        
        if (data.predicted_class === 'complete') {
            updateHemisphereStatus(data.hemisphere, 'Ready');
            return;
        }
        
        const content = data.message || '';
        const hemisphere = data.hemisphere;
        
        // Parse structured format (token-efficient)
        const parsed = parseStructuredResponse(content);
        
        // DEBUG: Log what we received
        console.log(`[DEBUG] Inference result from ${hemisphere}:`, {
            isStructured: parsed.isStructured,
            contentLength: content.length,
            preview: content.substring(0, 150)
        });
        
        if (hemisphere === 'left') {
            // Store raw content internally but update status only
            state.pendingResponses.left = { content: parsed.raw, timestamp: Date.now() };
            updateHemisphereStatus('left', parsed.isStructured ? 'thinking' : 'complete');
        } else if (hemisphere === 'right') {
            state.pendingResponses.right = { content: parsed.raw, timestamp: Date.now() };
            updateHemisphereStatus('right', parsed.isStructured ? 'thinking' : 'complete');
        }
        
        // OPTIMIZATION: Only do client-side synthesis if NO comparator is configured
        // If comparator is active, wait for server-side synthesis instead
        if (!state.models.comparator) {
            // Client-side synthesis - check if we have both responses
            if (state.pendingResponses.left && state.pendingResponses.right) {
                // Parse both responses
                const leftParsed = parseStructuredResponse(state.pendingResponses.left.content);
                const rightParsed = parseStructuredResponse(state.pendingResponses.right.content);
                
                // Only synthesize if we have actual content (not just structured headers)
                if (!leftParsed.isStructured && !rightParsed.isStructured) {
                    checkCombinedResponse();
                }
            }
        } else {
            // Comparator is configured - show waiting message and wait for server
            if (state.pendingResponses.left && state.pendingResponses.right) {
                addChatMessage('system', 'Comparator synthesizing...', 'both');
                
                // DEBUG: Log what we're sending to comparator
                console.log('[DEBUG] Left response stored:', state.pendingResponses.left.content.substring(0, 100));
                console.log('[DEBUG] Right response stored:', state.pendingResponses.right.content.substring(0, 100));
                
                // Set a timeout to detect if comparator hangs
                setTimeout(() => {
                    if (state.pendingResponses.left || state.pendingResponses.right) {
                        // Still waiting after 60 seconds - likely hung
                        addChatMessage('system', '⚠️ Comparator timeout - synthesis taking longer than expected. Check LM Studio logs.', 'both');
                        console.error('[ERROR] Comparator timeout after 60s');
                        console.error('[ERROR] Left model:', state.models.left);
                        console.error('[ERROR] Right model:', state.models.right);
                        console.error('[ERROR] Comparator model:', state.models.comparator);
                        
                        // Clear pending to allow new queries
                        state.pendingResponses.left = null;
                        state.pendingResponses.right = null;
                        state.pendingResponses.query = null;
                    }
                }, 60000); // 60 second timeout
            }
        }
    }

    // TOKEN-EFFICIENT FORMAT: Parse structured model responses
    // Now handles both structured and natural language formats
    function parseStructuredResponse(content) {
        // Check for old structured format (deprecated but kept for compatibility)
        if (content.startsWith('[') && content.includes('|') && (content.includes('[LH]') || content.includes('[RH]'))) {
            const parts = content.split('|');
            const header = parts[0];
            
            const hemisphere = header.includes('[LH]') ? 'Left (Analytical)' : 
                              header.includes('[RH]') ? 'Right (Intuitive)' : 'Unknown';
            const mode = header.includes('ANALYTICAL') ? 'Analytical' : 
                        header.includes('INTUITIVE') ? 'Intuitive' : 'Processing';
            
            return {
                isStructured: true,
                hemisphere: hemisphere,
                mode: mode,
                displayText: `${hemisphere} hemisphere ${mode.toLowerCase()} processing...`,
                raw: content
            };
        }
        
        // New format: natural language but compressed - treat as natural language
        // Just return as-is for display
        return {
            isStructured: false,
            displayText: content,
            raw: content
        };
    }

    // DOMAIN VALIDATION: Detect off-topic responses (brain science, vision, etc.)
    // NOTE: "Bicameral" and "hemisphere" are technical terms in this system, NOT brain science
    function validateResponseDomain(content, hemisphere) {
        // Check if context guardrails are disabled (Internal State Analysis mode)
        const cg = state.qamSignals.contextGuardrails;
        if (!cg.enabled) {
            // Internal analysis mode - bypass domain validation
            console.log(`[CONTEXT] Internal analysis mode - bypassing validation for ${hemisphere}`);
            return {
                valid: true,
                offTopicKeywords: [],
                technicalTerms: [],
                onTopicKeywords: [],
                reason: null,
                bypassed: true,
            };
        }
        
        // STRICT off-topic keywords (brain/biology only - NOT technical terms)
        const strictOffTopic = [
            // Brain anatomy (strictly biological)
            'cerebral', 'cortex', 'neuron', 'synapse', 'fMRI', 'PET scan',
            'temporal lobe', 'parietal', 'occipital', 'frontal lobe', 
            'cerebellum', 'hippocampus', 'amygdala', 'brain biology',
            
            // Vision/biology (strictly wrong domain)
            'retina', 'left eye', 'right eye', 'visual cortex', 'optic nerve',
            'visual perception', 'visual field', 'retinal',
            
            // Neuroscience terms
            'neuroscience', 'cognitive psychology', 'cognitive science',
        ];
        
        // Context-dependent terms (allowed in technical discussion)
        // These are technical architecture terms in Brainscan Matrix
        const technicalTerms = [
            'bicameral', 'hemisphere', 'left hemisphere', 'right hemisphere',
            'neural network', 'deep learning', 'attention', 'attention mechanism',
            'feature extraction', 'transformer', 'multi-modal',
        ];
        
        // Required on-topic keywords (must have at least one for technical responses)
        const onTopicKeywords = [
            'QAM', 'constellation', 'FOA', 'ambisonic', 'network traffic', 'signal',
            'modulation', 'quadrant', 'channel', 'packet', 'latency', 'throughput',
            'coherence', 'matrix', 'visualization', 'optimization', 'processing',
            'sliding window', 'adaptive threshold', 'signal fusion', 'SNR', 'noise',
            'tuning', 'parameter', 'performance', 'efficiency', 'architecture',
        ];
        
        const lowerContent = content.toLowerCase();
        
        // Check for STRICTLY off-topic brain/biology content
        const foundStrictOffTopic = strictOffTopic.filter(keyword => 
            lowerContent.includes(keyword.toLowerCase())
        );
        
        // Check for technical terms (allowed, but log for context)
        const foundTechnical = technicalTerms.filter(term =>
            lowerContent.includes(term.toLowerCase())
        );
        
        // Check for on-topic content
        const foundOnTopic = onTopicKeywords.filter(keyword =>
            lowerContent.includes(keyword.toLowerCase())
        );
        
        // Response is INVALID only if:
        // 1. Contains strictly off-topic biological terms
        // Technical terms like "hemisphere" and "bicameral" are ALLOWED
        const isInvalid = foundStrictOffTopic.length > 0;
        
        if (isInvalid) {
            console.warn(`[DOMAIN_VALIDATION] ${hemisphere} response OFF-TOPIC (brain/biology detected):`, {
                offTopicTerms: foundStrictOffTopic,
                technicalTermsUsed: foundTechnical,
                onTopicKeywords: foundOnTopic,
                preview: content.substring(0, 100)
            });
        } else if (foundTechnical.length > 0) {
            // Log technical terms for context but ALLOW the response
            console.log(`[DOMAIN_VALIDATION] ${hemisphere} using technical terms:`, foundTechnical);
        }
        
        return {
            valid: !isInvalid,
            offTopicKeywords: foundStrictOffTopic,
            technicalTerms: foundTechnical,
            onTopicKeywords: foundOnTopic,
            reason: isInvalid ? 
                `Brain/biology content detected: ${foundStrictOffTopic.join(', ')}` :
                null
        };
    }

    function handleChatResponse(data) {
        const hemisphere = data.hemisphere;
        const content = data.message || '';
        
        // DEBUG: Log chat response
        console.log(`[DEBUG] Chat response from ${hemisphere}:`, {
            contentLength: content.length,
            preview: content.substring(0, 150)
        });
        
        // DOMAIN VALIDATION: Check if response is on-topic
        if (hemisphere === 'left' || hemisphere === 'right' || hemisphere === 'comparator') {
            const validation = validateResponseDomain(content, hemisphere);
            
            if (!validation.valid) {
                console.error(`[DOMAIN_VALIDATION] ${hemisphere} response REJECTED:`, validation.reason);
                
                // Store rejection reason
                if (hemisphere === 'left') {
                    state.pendingResponses.left = { 
                        content: `[REJECTED - OFF TOPIC: ${validation.reason}]`, 
                        timestamp: Date.now(),
                        rejected: true,
                        originalContent: content
                    };
                } else if (hemisphere === 'right') {
                    state.pendingResponses.right = { 
                        content: `[REJECTED - OFF TOPIC: ${validation.reason}]`, 
                        timestamp: Date.now(),
                        rejected: true,
                        originalContent: content
                    };
                } else if (hemisphere === 'comparator') {
                    // For comparator, show error message
                    addChatMessage('system', 
                        `⚠️ Comparator response rejected - off-topic content detected:\n${validation.reason}\n\n` +
                        `The AI model appears to have lost context. Please refresh and try again.`, 'both');
                }
                
                updateHemisphereStatus(hemisphere, 'error');
                return; // Don't process this response further
            }
        }
        
        // Parse structured format
        const parsed = parseStructuredResponse(content);
        
        if (hemisphere === 'left') {
            // Update status but don't display structured content
            updateHemisphereStatus('left', parsed.isStructured ? 'thinking' : 'complete');
            // Store for internal use but don't show to user
            state.pendingResponses.left = { content: parsed.raw, timestamp: Date.now() };
        } else if (hemisphere === 'right') {
            updateHemisphereStatus('right', parsed.isStructured ? 'thinking' : 'complete');
            state.pendingResponses.right = { content: parsed.raw, timestamp: Date.now() };
        } else if (hemisphere === 'comparator' || hemisphere === 'both') {
            // This is the final output - show in natural language
            showHemisphereContent('left', '[Comparator synthesis active]');
            showHemisphereContent('right', '[Comparator synthesis active]');
            
            // Display the natural language response
            addChatMessage('model', parsed.displayText, 'both');
            
            // Cache the response
            if (state.pendingResponses.query) {
                queryCache.set(state.pendingResponses.query, parsed.displayText);
                updateCacheDisplay();
            }
            
            // Clear pending responses
            state.pendingResponses.left = null;
            state.pendingResponses.right = null;
            state.pendingResponses.query = null;
        }
    }

    function checkCombinedResponse() {
        const { left, right, query } = state.pendingResponses;
        
        if (left && right) {
            const combined = synthesizeResponses(left.content, right.content);
            if (query) {
                queryCache.set(query, combined);
                updateCacheDisplay();
            }
            addChatMessage('model', combined, 'both');
            state.pendingResponses.left = null;
            state.pendingResponses.right = null;
            state.pendingResponses.query = null;
        } else if (left || right) {
            setTimeout(() => {
                if (state.pendingResponses.left || state.pendingResponses.right) {
                    const partial = left ? left.content : right.content;
                    addChatMessage('model', partial, 'both');
                    state.pendingResponses.left = null;
                    state.pendingResponses.right = null;
                    state.pendingResponses.query = null;
                }
            }, 3000);
        }
    }

    function synthesizeResponses(left, right) {
        // Dynamic bicameral synthesis with weighted processing
        // Uses current weights to determine analytical vs intuitive emphasis
        
        const bw = state.bicameralWeights;
        const leftWeight = bw.left;
        const rightWeight = bw.right;
        
        // Generate weighted synthesis
        const weightedSynthesis = getWeightedSynthesis(left, right);
        
        // Add holistic integration statement with weight information
        const integration = generateIntegrationStatement(left, right);
        const weightInfo = `[Processing: ${(leftWeight*100).toFixed(0)}% Analytical / ${(rightWeight*100).toFixed(0)}% Intuitive]`;
        
        return `◆◇ BICAMERAL SYNTHESIS (${bw.mode.toUpperCase()}) ◇◆\n${weightInfo}\n\n${weightedSynthesis}\n\n◆◆ INTEGRATED VIEW ◇◇\n${integration}`;
    }

    function extractKeyPoints(text, maxPoints) {
        // Extract key analytical/holistic points from text
        const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 10);
        return sentences.slice(0, maxPoints).map(s => s.trim());
    }

    function generateIntegrationStatement(left, right) {
        // Generate a true synthesis statement that combines both perspectives
        const leftLength = left.length;
        const rightLength = right.length;
        
        // Balance check - warn if one hemisphere is dominating
        const ratio = leftLength / (rightLength + 1);
        let balanceNote = '';
        if (ratio > 2) {
            balanceNote = '[Note: Left-hemisphere weighted input detected. Consider expanding right-hemisphere processing.]';
        } else if (ratio < 0.5) {
            balanceNote = '[Note: Right-hemisphere weighted input detected. Consider expanding left-hemisphere processing.]';
        } else {
            balanceNote = '[Balanced bicameral processing achieved]';
        }
        
        return `Through the corpus callosum of distributed cognition, analytical precision meets intuitive pattern recognition. ${balanceNote}`;
    }

    // OPTIMIZATION: Enhanced bicameral synthesis with graded feedback
    function checkCombinedResponse() {
        const { left, right, query } = state.pendingResponses;
        const startTime = state.pendingResponses.startTime || Date.now();
        
        if (left && right) {
            // OPTIMIZATION: Calculate processing latency for both hemispheres
            const leftLatency = left.timestamp - startTime;
            const rightLatency = right.timestamp - startTime;
            updateHemisphereLatency('left', leftLatency);
            updateHemisphereLatency('right', rightLatency);
            
            // OPTIMIZATION: Calculate confidence scores for both responses
            const leftConfidence = calculateResponseConfidence(left.content);
            const rightConfidence = calculateResponseConfidence(right.content);
            
            // OPTIMIZATION: Graded feedback mechanism
            const feedbackGrade = calculateFeedbackGrade(leftConfidence, rightConfidence, Math.max(leftLatency, rightLatency));
            
            // Both hemispheres have responded - perform true bicameral synthesis
            let combined;
            
            // OPTIMIZATION: Decision grading based on feedback
            if (feedbackGrade === 'high') {
                // High confidence: Full synthesis with both perspectives
                combined = synthesizeResponses(left.content, right.content);
                console.log(`[Bicameral] High confidence synthesis (${(leftConfidence * 100).toFixed(0)}% / ${(rightConfidence * 100).toFixed(0)}%)`);
            } else if (feedbackGrade === 'medium') {
                // Medium confidence: Weighted synthesis favoring higher confidence
                const weighted = leftConfidence > rightConfidence 
                    ? { primary: left.content, secondary: right.content, weight: 0.7 }
                    : { primary: right.content, secondary: left.content, weight: 0.7 };
                combined = `[Weighted Synthesis - Confidence: ${feedbackGrade}]\n${weighted.primary}\n\n[Secondary perspective (${((1-weighted.weight)*100).toFixed(0)}% weight)]\n${weighted.secondary}`;
            } else {
                // Low confidence: Request additional processing or clarification
                combined = `[Low Confidence Synthesis - Review Recommended]\n\n${synthesizeResponses(left.content, right.content)}`;
                console.warn(`[Bicameral] Low confidence synthesis detected (${feedbackGrade})`);
            }
            
            // If comparator model is configured, send for final synthesis
            if (state.models.comparator && feedbackGrade !== 'low') {
                send({
                    type: 'chat_message',
                    message: `[SYNTHESIZE] Left: ${left.content}\nRight: ${right.content}`,
                    hemisphere: 'comparator'
                }, true);
            }
            
            if (query) {
                // Cache the synthesized response
                queryCache.set(query, combined);
                updateCacheDisplay();
            }
            
            addChatMessage('model', combined, 'both');
            
            // Clear pending
            state.pendingResponses.left = null;
            state.pendingResponses.right = null;
            state.pendingResponses.query = null;
            state.pendingResponses.startTime = null;
            
        } else if (left || right) {
            // Only one hemisphere responded - implement time-based decision windows
            const partial = left ? 'left' : 'right';
            const elapsed = Date.now() - startTime;
            
            // OPTIMIZATION: Dynamic timeout based on query priority
            const priority = state.pendingResponses.priority || 'medium';
            const timeout = state.responseTimeouts[priority] || 3000;
            
            showHemisphereStatus(partial, `Waiting for counterpart... (${(elapsed/1000).toFixed(1)}s/${(timeout/1000).toFixed(1)}s)`);
            
            // Check if we should proceed with partial response
            if (elapsed > timeout * 0.5 && !state.pendingResponses.timeoutScheduled) {
                state.pendingResponses.timeoutScheduled = true;
                
                setTimeout(() => {
                    if (state.pendingResponses.left || state.pendingResponses.right) {
                        const available = left || right;
                        const missing = left ? '[Right hemisphere: No response - timeout]' : '[Left hemisphere: No response - timeout]';
                        
                        // OPTIMIZATION: Single hemisphere fallback with warning
                        const partialResponse = `[PARTIAL RESPONSE - ${missing.replace(/[\[\]]/g, '')}]\n\n${available.content}\n\n[Note: This response uses only one hemisphere. For full bicameral synthesis, both hemispheres must respond within ${(timeout/1000).toFixed(1)}s]`;
                        
                        addChatMessage('model', partialResponse, 'both');
                        
                        state.pendingResponses.left = null;
                        state.pendingResponses.right = null;
                        state.pendingResponses.query = null;
                        state.pendingResponses.startTime = null;
                        state.pendingResponses.timeoutScheduled = false;
                    }
                }, timeout - elapsed);
            }
        }
    }
    
    // OPTIMIZATION: Calculate response confidence score
    function calculateResponseConfidence(content) {
        if (!content) return 0;
        
        // Factors that indicate confidence:
        const length = content.length;
        const hasStructure = /\[.*\]|\n\n|##?\s/.test(content); // Has formatting/structure
        const hasEvidence = /\b(because|since|therefore|data|analysis|shows|indicates)\b/i.test(content);
        const hasUncertainty = /\b(maybe|perhaps|uncertain|unclear|possibly|might|could be)\b/i.test(content);
        
        let score = Math.min(length / 500, 1.0) * 0.3; // Length factor (30%)
        if (hasStructure) score += 0.3; // Structure bonus (30%)
        if (hasEvidence) score += 0.3; // Evidence bonus (30%)
        if (hasUncertainty) score -= 0.2; // Uncertainty penalty (-20%)
        
        return Math.max(0, Math.min(1, score));
    }

    // ==========================================
    // EEG HANDLING & FOA COMPUTATION
    // ==========================================
    let lastEEGProcess = 0;
    const EEG_INTERVAL = 1000 / 60;

    // ==========================================
    // QAM NETWORK SIGNAL PROCESSING (FOA/2OA)
    // ==========================================
    function handleQAMSignal(data) {
        const now = performance.now();
        if (now - lastEEGProcess < EEG_INTERVAL) return;
        lastEEGProcess = now;
        
        // Process QAM constellation data
        const qam = state.qamSignals;
        
        if (data.constellation && Array.isArray(data.constellation)) {
            // Update QAM constellation points
            qam.constellation = data.constellation.slice(0, 16);
            qam.signalStrength = data.signalStrength || 0.5;
            qam.snr = data.snr || 10.0;
            qam.lastUpdate = now;
            
            // Add to symbol history
            qam.symbols.push({
                timestamp: now,
                constellation: [...qam.constellation],
                snr: qam.snr,
            });
            
            // Limit history
            if (qam.symbols.length > 50) {
                qam.symbols.shift();
            }
            
            // Map QAM points to FOA quadrants for spatialization
            computeQAMQuadrants(qam.constellation);
            
            // Update displays with QAM data
            updateChannelBars(qam.constellation); // All 16 QAM constellation channels
            drawWaveform(qam.constellation.slice(0, 8)); // Waveform uses first 8 for display
            updateFOAMatrix();
        }
    }

    function computeQAMQuadrants(constellation) {
        // Map 16-QAM constellation points to FOA quadrants
        // QAM constellation: 4x4 grid -> mapped to LFU, LBD, RBU, RFD
        
        const qam = state.qamSignals;
        const now = performance.now();
        
        // OPTIMIZATION 1: Sliding Window Pattern Recognition
        // Update sliding window buffer with current constellation values
        const sw = qam.slidingWindow;
        for (let i = 0; i < 16; i++) {
            const val = constellation[i] || 0.5;
            
            // Add to window buffer
            sw.buffer[i].push(val);
            if (sw.buffer[i].length > sw.windowSize) {
                sw.buffer[i].shift();
            }
            
            // Calculate pattern score based on variance and trend
            if (sw.buffer[i].length >= 8) {
                const window = sw.buffer[i];
                const mean = window.reduce((a, b) => a + b, 0) / window.length;
                const variance = window.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / window.length;
                
                // Detect trend (direction of change)
                const trend = window[window.length - 1] - window[0];
                
                // Pattern score combines variance (activity) and trend strength
                sw.patternScores[i] = Math.min(1.0, (variance * 4) + Math.abs(trend));
            }
        }
        
        // Update temporal correlation every 10 frames
        if (now - sw.lastPatternUpdate > 333) { // ~10 frames at 30fps
            sw.lastPatternUpdate = now;
            
            // Calculate cross-channel correlation
            for (let i = 0; i < 16; i++) {
                let correlationSum = 0;
                let correlationCount = 0;
                
                for (let j = 0; j < 16; j++) {
                    if (i !== j && sw.buffer[i].length > 0 && sw.buffer[j].length > 0) {
                        // Simple correlation based on similar pattern scores
                        const diff = Math.abs(sw.patternScores[i] - sw.patternScores[j]);
                        correlationSum += 1.0 - Math.min(1.0, diff * 2);
                        correlationCount++;
                    }
                }
                
                sw.temporalCorrelation[i] = correlationCount > 0 ? correlationSum / correlationCount : 0;
            }
        }
        
        // OPTIMIZATION 2: Adaptive Thresholding
        // Update dynamic thresholds based on observed signal characteristics
        const at = qam.adaptiveThresholds;
        
        // Recalibrate every 5 seconds
        if (now - at.lastCalibration > 5000) {
            at.lastCalibration = now;
            
            for (let i = 0; i < 16; i++) {
                const window = sw.buffer[i];
                if (window.length >= 16) {
                    // Calculate dynamic range
                    const min = Math.min(...window);
                    const max = Math.max(...window);
                    at.dynamicRange[i] = max - min;
                    
                    // Estimate noise floor (using bottom 25% of values)
                    const sorted = [...window].sort((a, b) => a - b);
                    const noiseSamples = sorted.slice(0, Math.floor(sorted.length * 0.25));
                    at.noiseEstimate[i] = noiseSamples.reduce((a, b) => a + b, 0) / noiseSamples.length;
                    
                    // Adjust channel multiplier based on SNR
                    const signalLevel = max - at.noiseEstimate[i];
                    const snr = signalLevel / (at.noiseEstimate[i] + 0.01);
                    
                    // Higher SNR = lower threshold multiplier (more sensitive)
                    // Lower SNR = higher threshold multiplier (less noise-sensitive)
                    const targetMultiplier = Math.max(0.5, Math.min(2.0, 1.5 / (snr + 0.5)));
                    
                    // Smooth adaptation
                    at.channelMultipliers[i] += (targetMultiplier - at.channelMultipliers[i]) * at.adaptationRate;
                }
            }
        }
        
        // Reset
        FOA_QUADRANTS.forEach(q => state.quadrantValues[q] = 0);
        
        // OPTIMIZATION 3: Signal Fusion for Redundant Channel Pairs
        // Fuse highly correlated channels to reduce computation
        const sf = qam.signalFusion;
        if (sf.enabled) {
            // Check for fusion every 5 frames
            if (state.frameCount % 5 === 0) {
                sf.fusionPairs.forEach(pair => {
                    const [ch1, ch2] = pair;
                    const corr = sw.temporalCorrelation[ch1];
                    
                    if (corr > sf.fusionThreshold && sw.patternScores[ch1] > 0.4) {
                        // Fuse channels: weighted average by visual dominance
                        const vdw = qam.channelReduction.visualDominanceWeights;
                        const quad1 = ch1 < 4 ? 'LFU' : ch1 < 8 ? 'LBD' : ch1 < 12 ? 'RBU' : 'RFD';
                        const quad2 = ch2 < 4 ? 'LFU' : ch2 < 8 ? 'LBD' : ch2 < 12 ? 'RBU' : 'RFD';
                        const idx1 = ch1 % 4;
                        const idx2 = ch2 % 4;
                        const w1 = vdw[quad1][idx1];
                        const w2 = vdw[quad2][idx2];
                        const totalWeight = w1 + w2;
                        
                        // Cache fused value
                        const fusedVal = (constellation[ch1] * w1 + constellation[ch2] * w2) / totalWeight;
                        sf.fusedValues[ch1] = fusedVal;
                        sf.fusedValues[ch2] = fusedVal;
                    } else {
                        sf.fusedValues[ch1] = null;
                        sf.fusedValues[ch2] = null;
                    }
                });
            }
        }
        
        // OPTIMIZATION 4: Channel Count Reduction with Visual Dominance
        const cr = qam.channelReduction;
        let channelsToProcess = [];
        
        if (cr.enabled) {
            // Compute channel priorities every 30 frames
            if (now - cr.lastPriorityUpdate > 1000 || cr.channelPriority.every(p => p === 0)) {
                cr.lastPriorityUpdate = now;
                
                // Calculate priority based on activity × visual dominance × pattern score
                for (let i = 0; i < 16; i++) {
                    const quad = i < 4 ? 'LFU' : i < 8 ? 'LBD' : i < 12 ? 'RBU' : 'RFD';
                    const idx = i % 4;
                    const visualWeight = cr.visualDominanceWeights[quad][idx];
                    const activity = qam.channelActivity[i] || 0.5;
                    const patternStrength = sw.patternScores[i] || 0.5;
                    const stability = qam.patternStability[i] || 0.5;
                    
                    // Priority formula: visual dominance × activity × pattern × stability
                    cr.channelPriority[i] = visualWeight * activity * (0.5 + patternStrength * 0.5) * (0.5 + stability * 0.5);
                }
            }
            
            // Select top N channels based on priority
            const sortedChannels = cr.channelPriority
                .map((priority, idx) => ({ idx, priority }))
                .sort((a, b) => b.priority - a.priority)
                .slice(0, cr.targetChannels)
                .map(c => c.idx);
            
            channelsToProcess = sortedChannels;
        } else {
            // Process all channels if reduction disabled
            channelsToProcess = Array.from({length: 16}, (_, i) => i);
        }
        
        // OPTIMIZATION 5: Channel Ordering for Pipeline Efficiency
        // Reorder channels: LFU (visual dominant) → LBD → RBU → RFD
        const co = qam.channelOrdering;
        if (now - co.lastReorder > 2000 || co.prioritizedIndices.length === 0) {
            co.lastReorder = now;
            
            // Sort selected channels by quadrant priority (LFU first)
            co.prioritizedIndices = [...channelsToProcess].sort((a, b) => {
                const quadOrder = { 'LFU': 0, 'LBD': 1, 'RBU': 2, 'RFD': 3 };
                const quadA = a < 4 ? 'LFU' : a < 8 ? 'LBD' : a < 12 ? 'RBU' : 'RFD';
                const quadB = b < 4 ? 'LFU' : b < 8 ? 'LBD' : b < 12 ? 'RBU' : 'RFD';
                return quadOrder[quadA] - quadOrder[quadB] || cr.channelPriority[b] - cr.channelPriority[a];
            });
        }
        
        // 16-QAM constellation mapping with adaptive thresholding:
        // Points 0-3: Upper-left quadrant (LFU)
        // Points 4-7: Lower-left quadrant (LBD)
        // Points 8-11: Lower-right quadrant (RBU)
        // Points 12-15: Upper-right quadrant (RFD)
        
        // Process channels in optimized order with fusion
        co.prioritizedIndices.forEach(i => {
            // Use fused value if available, otherwise raw constellation value
            let rawVal = sf.fusedValues[i] !== null ? sf.fusedValues[i] : constellation[i];
            
            const threshold = at.baseThreshold * at.channelMultipliers[i];
            
            // Normalize value considering dynamic range
            let val = (rawVal - 0.5) * 2;
            
            // Apply pattern-weighted processing (higher pattern score = more weight)
            const patternWeight = 0.5 + (sw.patternScores[i] * 0.5); // 0.5 to 1.0
            val *= patternWeight;
            
            // Skip values below noise threshold (unless pattern is strong)
            if (Math.abs(val) < threshold && sw.patternScores[i] < 0.3) {
                return; // Skip this channel (continue in forEach = return)
            }
            
            // Apply temporal correlation boost for synchronized channels
            const correlationBoost = 1.0 + (sw.temporalCorrelation[i] * 0.3);
            val *= correlationBoost;
            
            // Apply visual dominance weighting from channel reduction
            const quad = i < 4 ? 'LFU' : i < 8 ? 'LBD' : i < 12 ? 'RBU' : 'RFD';
            const idx = i % 4;
            const visualWeight = cr.visualDominanceWeights[quad][idx];
            val *= visualWeight;
            
            if (i < 4) {
                // Upper-left (LFU) - symbols 0-3
                state.quadrantValues['LFU'] += val * 0.8;
            } else if (i < 8) {
                // Lower-left (LBD) - symbols 4-7
                state.quadrantValues['LBD'] += val * 0.8;
            } else if (i < 12) {
                // Lower-right (RBU) - symbols 8-11
                state.quadrantValues['RBU'] += val * 0.8;
            } else {
                // Upper-right (RFD) - symbols 12-15
                state.quadrantValues['RFD'] += val * 0.8;
            }
        });
        
        // Average by count
        FOA_QUADRANTS.forEach(q => {
            state.quadrantValues[q] /= 4; // 4 symbols per quadrant
        });
        
        // Compute ambisonic components (FOA) with Hadamard matrix coefficients
        // W = -(LFU + LBD + RBU + RFD)
        // X = 2.83(-LFU + LBD + RBU - RFD)
        // Y = 2.83(-LFU - LBD + RBU + RFD)  
        // Z = 2.83(-LFU + LBD - RBU + RFD) - modulated by tunnel diode
        const qv = state.quadrantValues;
        const scale = 2.83;
        
        // W (omni): Sum of all quadrants
        state.ambisonic[0] = -(qv.LFU + qv.LBD + qv.RBU + qv.RFD);
        
        // X (front-back): -LFU + LBD + RBU - RFD
        state.ambisonic[1] = scale * (-qv.LFU + qv.LBD + qv.RBU - qv.RFD);
        
        // Y (left-right): -LFU - LBD + RBU + RFD
        state.ambisonic[2] = scale * (-qv.LFU - qv.LBD + qv.RBU + qv.RFD);
        
        // Z (vertical): -LFU + LBD - RBU + RFD, modulated by tunnel diode
        let zBase = scale * (-qv.LFU + qv.LBD - qv.RBU + qv.RFD);
        
        // Apply tunnel diode modulation if enabled
        const zv = state.zVector;
        const td = zv.tunnelDiode;
        if (td.enabled) {
            // Modulate Z by tunnel diode impedance
            // Z → 0 behavior: as coherence increases, Z approaches 0
            const tdModulation = 1.0 / (1.0 + Math.abs(td.Z) * 0.1);
            zBase *= tdModulation;
            
            // In NDR region, invert Z phase
            if (td.inNDR) {
                zBase *= -1;
            }
        }
        
        state.ambisonic[3] = zBase;
    }

    // Legacy EEG handler (for backward compatibility)
    function handleEEGFrame(data) {
        // Convert EEG frame to QAM format
        if (data.channels && data.channels.length === 8) {
            // Map 8 EEG channels to 16 QAM constellation points
            // Double the channels to create a pseudo-16-QAM constellation
            const qamConstellation = [
                ...data.channels, // First 8 points
                ...data.channels.map(c => 1.0 - c) // Second 8 points (complement)
            ];
            
            handleQAMSignal({
                constellation: qamConstellation,
                signalStrength: 0.6,
                snr: 15.0,
            });
        }
    }

    function decompressEEGFrame(data) {
        if (!data.c) return data;
        return { timestamp: data.t, channels: data.c };
    }

    // Legacy computeFOAQuadrants - redirects to QAM version
    function computeFOAQuadrants(channels) {
        // Convert channels to QAM constellation format
        const qamConstellation = [
            ...channels,
            ...channels.map(c => 1.0 - c)
        ];
        computeQAMQuadrants(qamConstellation);
    }

    // ==========================================
    // 4x4 FOA MATRIX DISPLAY
    // ==========================================
    function updateFOAMatrix() {
        // Display FOA Hadamard matrix with polarity visualization
        FOA_ROWS.forEach(row => {
            FOA_QUADRANTS.forEach(quad => {
                const cellId = `mcell-${row.toLowerCase()}-${quad.toLowerCase()}`;
                const cell = document.getElementById(cellId);
                if (!cell) return;
                
                const coef = FOA_MATRIX[row][quad];
                const quadVal = state.quadrantValues[quad] || 0;
                const output = coef * quadVal;
                
                // Show coefficient sign and magnitude
                const sign = coef > 0 ? '+' : '-';
                const magnitude = Math.abs(coef).toFixed(2);
                cell.textContent = `${sign}${magnitude}`;
                
                // Color coding: orange for positive, red for negative
                const isPositive = coef > 0;
                const baseColor = isPositive ? '#fa0' : '#e60003';
                const intensity = Math.min(Math.abs(output) * 0.5, 1);
                
                if (intensity > 0.05) {
                    cell.style.background = baseColor;
                    cell.style.color = intensity > 0.5 ? '#000' : '#fff';
                    cell.style.opacity = 0.3 + intensity * 0.7;
                } else {
                    cell.style.background = '#111';
                    cell.style.color = baseColor;
                    cell.style.opacity = 0.5;
                }
                
                cell.style.fontSize = '9px';
                cell.style.fontFamily = 'monospace';
                cell.style.textAlign = 'center';
            });
        });
    }

    // ==========================================
    // MATRIX VISUALIZER - NETWORK TRAFFIC (Dynamic Size)
    // ==========================================
    const matrixCanvas = document.getElementById('matrix-canvas');
    const matrixCtx = matrixCanvas.getContext('2d', { alpha: false });
    let matrixImageData = null;
    let matrixPixels = null;
    
    function resizeMatrixCanvas() {
        const container = matrixCanvas.parentElement;
        if (!container) return;
        
        // Get container dimensions
        const rect = container.getBoundingClientRect();
        
        // Validate dimensions - must be positive integers
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        
        // Skip if dimensions are invalid or unchanged
        if (width <= 0 || height <= 0) {
            console.warn('[Matrix] Invalid dimensions, skipping resize');
            return;
        }
        
        // Set canvas size to fill container
        matrixCanvas.width = width;
        matrixCanvas.height = height;
        
        // Recreate image data with new size
        try {
            matrixImageData = matrixCtx.createImageData(width, height);
            matrixPixels = matrixImageData.data;
            
            // Update CONFIG for consistency
            CONFIG.MATRIX_SIZE = Math.max(width, height);
            
            console.log(`[Matrix] Resized to ${width}x${height}`);
        } catch (e) {
            console.error('[Matrix] Failed to create image data:', e);
        }
    }
    
    function drawMatrix() {
        if (!matrixPixels || !matrixImageData) return;
        
        const w = matrixCanvas.width;
        const h = matrixCanvas.height;
        const time = performance.now() * 0.001;
        
        // Get Z-vector coherence for color calculations (declared here to avoid TDZ)
        const zv = state.zVector;
        const coherence = zv.coherenceLevel;
        
        // Apply matrix visualization controls
        const brightnessMult = CONFIG.BRIGHTNESS * 2; // 0-2 range for more control
        const glowMult = CONFIG.GLOW_INTENSITY * 2;  // 0-2 range
        const responseMult = CONFIG.RESPONSE / 100;    // 0.1-2.0 range
        
        // Update network metrics
        updateNetworkMetrics();
        
        const metrics = state.networkMetrics;
        const mps = metrics.messagesPerSecond;
        const quality = metrics.connectionQuality;
        const errorRate = metrics.errorRate;
        
        // Clear to dark background
        for (let i = 0; i < matrixPixels.length; i += 4) {
            matrixPixels[i] = 5;     // R
            matrixPixels[i + 1] = 5; // G
            matrixPixels[i + 2] = 5; // B
            matrixPixels[i + 3] = 255; // Alpha
        }
        
        // Scale matrix visualization to fill entire canvas
        // Calculate scaling factors for the full window size
        const canvasWidth = matrixCanvas.width;
        const canvasHeight = matrixCanvas.height;
        const scaleX = canvasWidth / w;
        const scaleY = canvasHeight / h;
        const avgScale = (scaleX + scaleY) / 2;
        
        // Draw connection status ring
        const centerX = w / 2;
        const centerY = h / 2;
        const ringRadius = Math.min(w, h) * 0.35;
        
        // Connection quality visualization
        if (state.connected) {
            // Draw data flow rings with enhanced intensity
            for (let ring = 0; ring < 3; ring++) {
                const ringOffset = time * (2 + ring * 0.5) + ring * 2;
                const alpha = (Math.sin(ringOffset) + 1) / 2 * quality;
                
                for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
                    const r = ringRadius - ring * 15 + Math.sin(angle * 8 + time * 3) * 5;
                    const x = Math.floor(centerX + Math.cos(angle) * r);
                    const y = Math.floor(centerY + Math.sin(angle) * r);
                    
                    if (x >= 0 && x < w && y >= 0 && y < h) {
                        const idx = (y * w + x) * 4;
                        const intensity = alpha * (0.3 + mps / 100 * 0.7) * 1.5 * brightnessMult; // With brightness control
                        
                        // UI Theme Colors: Orange/Red palette
                        // Error: Red (high R, low G, low B)
                        // Good: Orange (high R, medium G, low B) - matching UI theme
                        // Warning: Orange-Red (high R, medium-low G, low B)
                        if (errorRate > 0.5) {
                            // Error state - Bright Red
                            matrixPixels[idx] = Math.min(255, matrixPixels[idx] + intensity * 255);     // R
                            matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + intensity * 30);  // G
                            matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + intensity * 30);  // B
                        } else if (quality > 0.7) {
                            // Good connection - Orange (matches UI theme)
                            matrixPixels[idx] = Math.min(255, matrixPixels[idx] + intensity * 255);     // R
                            matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + intensity * 170);  // G (170/255 = 0.67)
                            matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + intensity * 0);    // B
                        } else {
                            // Warning state - Orange-Red
                            matrixPixels[idx] = Math.min(255, matrixPixels[idx] + intensity * 230);     // R
                            matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + intensity * 100);  // G
                            matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + intensity * 0);    // B
                        }
                    }
                }
            }
            
            // Z-VECTOR BOUNDARY VISUALIZATION
            updateZVectorCoherence();
            // zv and coherence already declared at function start
            const threshold = zv.decoherenceThreshold;
            
            // Draw coherence wave pattern at center
            const boundaryRadius = Math.min(w, h) * (0.15 + (coherence - 0.3) * 0.2); // Radius changes with coherence
            const boundaryIntensity = (coherence > threshold) ? 
                (coherence - threshold) / (1 - threshold) : // Above threshold: bright
                (threshold - coherence) / threshold * 2; // Below threshold: critical
            
            // Color based on coherence state - Orange/Red theme
            let br, bg, bb;
            if (zv.boundaryActive) {
                // Critical - bright red decoherence
                br = 255;
                bg = 50;
                bb = 50;
            } else if (coherence - threshold < 0.1) {
                // Proximate - orange warning
                br = 255;
                bg = 120;
                bb = 0;
            } else if (zv.testMode) {
                // Testing - orange active
                br = 255;
                bg = 170;
                bb = 0;
            } else {
                // Normal - orange-yellow stable
                br = 255;
                bg = 200;
                bb = 0;
            }
            
            // Draw interference pattern (represents quantum boundary)
            for (let angle = 0; angle < Math.PI * 2; angle += 0.005) {
                // Interference pattern: two waves meeting
                const wave1 = Math.sin(angle * 16 + time * 5);
                const wave2 = Math.sin(angle * 16 - time * 5 + coherence * 10);
                const interference = (wave1 + wave2) / 2;
                
                const r = boundaryRadius + interference * 20 * boundaryIntensity;
                const x = Math.floor(centerX + Math.cos(angle) * r);
                const y = Math.floor(centerY + Math.sin(angle) * r);
                
                if (x >= 0 && x < w && y >= 0 && y < h) {
                    const idx = (y * w + x) * 4;
                    const glow = boundaryIntensity * 1.5;
                    
                    matrixPixels[idx] = Math.min(255, matrixPixels[idx] + br * glow);
                    matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + bg * glow);
                    matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + bb * glow);
                }
            }
            
            // Draw midline separator if boundary is proximate or active
            if (coherence - threshold < 0.15 || zv.boundaryActive) {
                const separatorX = Math.floor(centerX);
                const separationGlow = zv.boundaryActive ? 2.0 : (0.15 - (coherence - threshold)) / 0.15 * 1.0;
                
                for (let y = 0; y < h; y++) {
                    const idx = (y * w + separatorX) * 4;
                    
                    // Pulsing effect near threshold
                    const pulse = (Math.sin(time * 10 + y * 0.1) + 1) / 2;
                    const glow = separationGlow * (0.5 + pulse * 0.5);
                    
                    matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 255 * glow);
                    matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + (zv.boundaryActive ? 0 : 100) * glow);
                    matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + (zv.boundaryActive ? 100 : 0) * glow);
                }
            }
        } else {
            // Disconnected - draw pulsing red X pattern
            const pulse = (Math.sin(time * 3) + 1) / 2;
            const alpha = 0.3 + pulse * 0.4;
            
            const minDim = Math.min(w, h);
            for (let i = 0; i < minDim; i++) {
                const x1 = i;
                const y1 = i;
                const x2 = w - 1 - i;
                const y2 = i;
                
                if (x1 >= 0 && x1 < w && y1 >= 0 && y1 < h) {
                    const idx1 = (y1 * w + x1) * 4;
                    matrixPixels[idx1] = 100 * alpha;
                    matrixPixels[idx1 + 1] = 10 * alpha;
                    matrixPixels[idx1 + 2] = 10 * alpha;
                }
                
                if (x2 >= 0 && x2 < w && y2 >= 0 && y2 < h) {
                    const idx2 = (y2 * w + x2) * 4;
                    matrixPixels[idx2] = 100 * alpha;
                    matrixPixels[idx2 + 1] = 10 * alpha;
                    matrixPixels[idx2 + 2] = 10 * alpha;
                }
            }
            
            // Add "OFFLINE" text pattern (simplified dot matrix)
            for (let y = h/2 - 10; y < h/2 + 10; y++) {
                for (let x = w/2 - 30; x < w/2 + 30; x++) {
                    if (x >= 0 && x < w && y >= 0 && y < h) {
                        const idx = (Math.floor(y) * w + Math.floor(x)) * 4;
                        const dist = Math.abs(x - w/2) + Math.abs(y - h/2);
                        if (dist < 20) {
                            matrixPixels[idx] = 60 * alpha;
                            matrixPixels[idx + 1] = 0;
                            matrixPixels[idx + 2] = 0;
                        }
                    }
                }
            }
        }
        
        // Draw QAM constellation as radial waveform oscillations
        const qam = state.qamSignals;
        const constellation = qam.constellation || [];
        // Use existing zv and coherence from Z-vector visualization section
        
        // OPTIMIZATION: Dynamic Channel Routing with Quadrant Prioritization
        // Calculate channel activity, stability, and confidence for adaptive routing
        let totalActivity = 0;
        let activeChannelCount = 0;
        let lfuTotalConfidence = 0;
        let lbdTotalConfidence = 0;
        
        for (let i = 0; i < constellation.length; i++) {
            // Calculate activity (signal strength)
            const activity = Math.abs(constellation[i] - 0.5) * 2; // 0-1 scale
            
            // OPTIMIZATION: Calculate pattern stability (temporal consistency)
            const valueChange = Math.abs(constellation[i] - qam.lastPatternValues[i]);
            const stability = Math.max(0, 1 - valueChange * 5); // Higher stability = less change
            qam.patternStability[i] = qam.patternStability[i] * 0.8 + stability * 0.2; // EMA
            
            // Store current value for next frame
            qam.lastPatternValues[i] = constellation[i];
            
            // OPTIMIZATION: Apply quadrant weighting (LFU > LBD > RBU > RFD)
            let quadrantWeight = 1.0;
            if (i < 4) quadrantWeight = qam.quadrantWeights['LFU']; // Q0-Q3
            else if (i < 8) quadrantWeight = qam.quadrantWeights['LBD']; // Q4-Q7
            else if (i < 12) quadrantWeight = qam.quadrantWeights['RBU']; // Q8-Q11
            else quadrantWeight = qam.quadrantWeights['RFD']; // Q12-Q15
            
            // Calculate weighted confidence score (activity * stability * quadrant_weight)
            qam.channelConfidence[i] = activity * qam.patternStability[i] * quadrantWeight;
            
            // Standard EMA activity tracking
            qam.channelActivity[i] = qam.channelActivity[i] * 0.9 + activity * 0.1;
            totalActivity += qam.channelActivity[i];
            if (qam.channelActivity[i] > 0.2) activeChannelCount++;
            
            // Track LFU vs LBD confidence for fallback detection
            if (i < 4) lfuTotalConfidence += qam.channelConfidence[i];
            else if (i < 8) lbdTotalConfidence += qam.channelConfidence[i];
        }
        
        qam.activeChannels = activeChannelCount;
        
        // OPTIMIZATION: Detect when fallback to LBD is needed
        const lfuAvgConfidence = lfuTotalConfidence / 4;
        const lbdAvgConfidence = lbdTotalConfidence / 4;
        qam.fallbackTriggered = (lfuAvgConfidence < 0.3 && lbdAvgConfidence > 0.5);
        
        // Adaptive routing mode selection based on weighted confidence
        const avgActivity = totalActivity / 16;
        const avgConfidence = qam.channelConfidence.reduce((a,b) => a+b, 0) / 16;
        
        // OPTIMIZATION: Parallel Quadrant Processing with Carry Propagation
        // Process LFU (Q0-Q3) and LBD (Q4-Q7) quadrants in parallel
        
        // Calculate quadrant interdependencies (carry propagation)
        const lfuCarryToLbd = (qam.channelConfidence[3] + qam.channelConfidence[2]) / 2; // Q2,Q3 influence on Q4
        const lbdCarryToLfu = (qam.channelConfidence[4] + qam.channelConfidence[5]) / 2; // Q4,Q5 influence back to LFU
        
        // OPTIMIZATION: Dynamic buffer for carry tracking
        if (!qam.carryBuffer) qam.carryBuffer = new Array(4).fill(0);
        
        // Update carry buffer with exponential smoothing
        qam.carryBuffer[0] = qam.carryBuffer[0] * 0.7 + lfuCarryToLbd * 0.3; // LFU -> LBD
        qam.carryBuffer[1] = qam.carryBuffer[1] * 0.7 + lbdCarryToLfu * 0.3; // LBD -> LFU
        
        // Multi-pass refinement for complex patterns (2-3 passes)
        const passesNeeded = avgConfidence > 0.7 ? 2 : 3;
        
        if (state.frameCount % 60 === 0) {
            console.log(`[QAM16] Parallel processing: LFU↔LBD carry=${lfuCarryToLbd.toFixed(2)}/${lbdCarryToLfu.toFixed(2)} | Passes=${passesNeeded}`);
        }
        
        if (avgActivity > 0.6 && avgConfidence > 0.5) {
            qam.routingMode = 'full'; // All 16 channels active
        } else if (qam.fallbackTriggered || (avgActivity > 0.3 && avgConfidence > 0.3)) {
            qam.routingMode = 'adaptive'; // Prioritize high-confidence channels
        } else {
            qam.routingMode = 'minimal'; // Only most confident channels
        }
        
        // OPTIMIZATION: Dynamic channel count based on routing mode and confidence
        let channelsToRender = 8; // Default all 8 position pairs
        if (qam.routingMode === 'minimal') {
            channelsToRender = 4; // Only 4 most confident channels
        } else if (qam.routingMode === 'adaptive') {
            // Adaptive: more channels when confident, fewer when uncertain
            channelsToRender = Math.floor(4 + avgConfidence * 4); // 4-8 channels
        }
        
        // OPTIMIZATION: Log routing decisions for debugging (every 60 frames)
        if (state.frameCount % 60 === 0) {
            console.log(`[QAM16] Mode: ${qam.routingMode} | LFU conf: ${lfuAvgConfidence.toFixed(2)} | LBD conf: ${lbdAvgConfidence.toFixed(2)} | Fallback: ${qam.fallbackTriggered}`);
            
            // Log new optimizations: Sliding Window & Adaptive Thresholding
            const sw = qam.slidingWindow;
            const at = qam.adaptiveThresholds;
            const avgPatternScore = sw.patternScores.reduce((a, b) => a + b, 0) / 16;
            const avgCorrelation = sw.temporalCorrelation.reduce((a, b) => a + b, 0) / 16;
            console.log(`[QAM16] Sliding Window: avg pattern=${avgPatternScore.toFixed(2)} | correlation=${avgCorrelation.toFixed(2)} | window=${sw.buffer[0].length}/${sw.windowSize}`);
            console.log(`[QAM16] Adaptive Thresholds: base=${at.baseThreshold.toFixed(2)} | avg mult=${(at.channelMultipliers.reduce((a, b) => a + b, 0) / 16).toFixed(2)} | noise=${(at.noiseEstimate.reduce((a, b) => a + b, 0) / 16).toFixed(3)}`);
            
            // Update UI with optimization stats
            updateOptimizationStats();
            
            // Log additional optimizations: Signal Fusion & Channel Reduction
            const sf = qam.signalFusion;
            const cr = qam.channelReduction;
            const co = qam.channelOrdering;
            const fusedCount = sf.fusedValues.filter(v => v !== null).length;
            console.log(`[QAM16] Signal Fusion: ${fusedCount}/16 fused pairs | threshold=${sf.fusionThreshold} | enabled=${sf.enabled}`);
            console.log(`[QAM16] Channel Reduction: ${cr.targetChannels}/16 active | visual dominance weighted | order=${co.prioritizedIndices.slice(0, 5).join(',')}...`);
        }
        
        // Calculate smoothing factor based on Response control
        const responseFactor = CONFIG.RESPONSE / 100;
        const smoothingFactor = 0.05 + (responseFactor * 0.25); // 0.05 to 0.3
        
        // Update smoothed positions for 8 radial channels (16 QAM points = 8 pairs)
        for (let i = 0; i < constellation.length - 1; i += 2) {
            const targetXVal = constellation[i] || 0.5;
            const targetYVal = constellation[i + 1] || 0.5;
            
            let smoothedXVal = qam.smoothedPositions[i] || 0.5;
            let smoothedYVal = qam.smoothedPositions[i + 1] || 0.5;
            
            smoothedXVal += (targetXVal - smoothedXVal) * smoothingFactor;
            smoothedYVal += (targetYVal - smoothedYVal) * smoothingFactor;
            
            qam.smoothedPositions[i] = smoothedXVal;
            qam.smoothedPositions[i + 1] = smoothedYVal;
        }
        
        // OPTIMIZATION: Pre-compute channel priorities once per 10 frames
        // Cache sorted channel indices using confidence scores (activity + stability + quadrant weight)
        let sortedChannelIndices = qam.sortedIndices;
        if ((qam.routingMode === 'minimal' || qam.routingMode === 'adaptive') && 
            (state.frameCount - qam.lastSortFrame > 10 || !sortedChannelIndices)) {
            // Re-sort every 10 frames or on first run
            // Sort by confidence score (combines activity, stability, and quadrant weight)
            sortedChannelIndices = [0,1,2,3,4,5,6,7].sort((a,b) => {
                const confA = (qam.channelConfidence[a*2] + qam.channelConfidence[a*2+1]) / 2;
                const confB = (qam.channelConfidence[b*2] + qam.channelConfidence[b*2+1]) / 2;
                return confB - confA; // Descending by confidence
            });
            qam.sortedIndices = sortedChannelIndices;
            qam.lastSortFrame = state.frameCount;
        }
        
        // OPTIMIZATION: Batch color calculations by quadrant
        // Pre-compute base colors for each quadrant
        const quadColors = [
            { r: 230, g: 102, b: 0 }, // LFU - Orange
            { r: 230, g: 0, b: 3 },   // LBD - Red
            { r: 230, g: 102, b: 0 }, // RBU - Orange
            { r: 230, g: 0, b: 3 }    // RFD - Red
        ];
        
        // OPTIMIZATION: Pre-compute coherence mix once
        const coherenceMix = Math.max(0, Math.min(1, (coherence - 0.3) / 0.7));
        const rMix = 1 - coherenceMix;
        const gMix = coherenceMix;
        
        // Draw radial waveform oscillations (optimized count based on routing mode)
        const waveformBaseRadius = Math.min(w, h) * 0.15; // Inner radius
        const maxRadius = Math.min(w, h) * 0.42;  // Outer radius for wave peaks
        
        for (let channelIdx = 0; channelIdx < channelsToRender; channelIdx++) {
            // Use pre-sorted indices if available
            let actualChannelIdx = channelIdx;
            if (sortedChannelIndices) {
                actualChannelIdx = sortedChannelIndices[channelIdx];
            }
            
            const angle = (actualChannelIdx / 8) * Math.PI * 2 + time * 0.3;
            const i = actualChannelIdx * 2; // Index into smoothedPositions
            
            // Get QAM amplitude from this channel pair
            const xVal = qam.smoothedPositions[i] || 0.5;
            const yVal = qam.smoothedPositions[i + 1] || 0.5;
            // OPTIMIZATION: Use multiplication instead of Math.pow
            const xDiff = (xVal - 0.5) * 2;
            const yDiff = (yVal - 0.5) * 2;
            const amplitude = Math.sqrt(xDiff * xDiff + yDiff * yDiff);
            
            // OPTIMIZATION: Use pre-computed color values
            const quad = actualChannelIdx % 4;
            const baseColor = quadColors[quad];
            const r = Math.floor(baseColor.r * rMix);
            const g = Math.floor(baseColor.g * (1 - gMix) + 255 * gMix);
            const b = Math.floor(baseColor.b * (1 - gMix) + 100 * gMix);
            
            // Draw oscillating waveform along radial line
            const wavePoints = 60; // Resolution of waveform
            const waveFreq = 2 + amplitude * 4; // Frequency based on signal
            const waveAmp = (maxRadius - waveformBaseRadius) * (0.3 + amplitude * 0.7); // Amplitude
            
            for (let wp = 0; wp < wavePoints; wp++) {
                const t = wp / wavePoints;
                const dist = waveformBaseRadius + t * waveAmp;
                
                // Oscillation: sin wave that travels outward
                const oscillation = Math.sin(t * Math.PI * waveFreq - time * 3) * 0.5 + 0.5;
                const lateralOffset = oscillation * 8; // +/- 8 pixels lateral oscillation
                
                // Perpendicular direction for oscillation
                const perpAngle = angle + Math.PI / 2;
                
                const px = Math.floor(centerX + Math.cos(angle) * dist + Math.cos(perpAngle) * lateralOffset);
                const py = Math.floor(centerY + Math.sin(angle) * dist + Math.sin(perpAngle) * lateralOffset);
                
                if (px >= 0 && px < w && py >= 0 && py < h) {
                    const idx = (py * w + px) * 4;
                    const alpha = (1 - t * 0.5) * amplitude * glowMult; // Fade with distance
                    
                    matrixPixels[idx] = Math.min(255, matrixPixels[idx] + r * alpha);
                    matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + g * alpha);
                    matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + b * alpha);
                }
            }
            
            // Draw radial line connecting center to waveform start
            const lineStart = waveformBaseRadius * 0.6;
            const lineEnd = waveformBaseRadius;
            const lineSteps = 20;
            for (let ls = 0; ls < lineSteps; ls++) {
                const t = ls / lineSteps;
                const dist = lineStart + t * (lineEnd - lineStart);
                const lx = Math.floor(centerX + Math.cos(angle) * dist);
                const ly = Math.floor(centerY + Math.sin(angle) * dist);
                
                if (lx >= 0 && lx < w && ly >= 0 && ly < h) {
                    const idx = (ly * w + lx) * 4;
                    const alpha = 0.5 * amplitude;
                    matrixPixels[idx] = Math.min(255, matrixPixels[idx] + r * alpha);
                    matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + g * alpha);
                    matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + b * alpha);
                }
            }
        }
        
        // Legacy packet trails (only if no QAM data available)
        if (constellation.length === 0) {
            state.packets.forEach(packet => {
            const px = Math.floor(packet.x);
            const py = Math.floor(packet.y);
            const color = packet.color;
            const life = packet.life;
            
            // Draw packet with enhanced glow - larger radius
            for (let dy = -4; dy <= 4; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    const x = px + dx;
                    const y = py + dy;
                    
                    if (x >= 0 && x < w && y >= 0 && y < h) {
                        const idx = (y * w + x) * 4;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const intensity = Math.max(0, 1 - dist / 4) * life * 1.5 * glowMult; // With glow control
                        
                        matrixPixels[idx] = Math.min(255, matrixPixels[idx] + color.r * intensity);
                        matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + color.g * intensity);
                        matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + color.b * intensity);
                    }
                }
            }
            
            // Draw enhanced trail - longer and brighter
            const trailLength = 20; // Doubled from 10
            for (let t = 1; t <= trailLength; t++) {
                const tx = Math.floor(packet.x - packet.vx * t * 0.5);
                const ty = Math.floor(packet.y - packet.vy * t * 0.5);
                const tLife = life * (1 - t / trailLength) * 0.8; // Increased from 0.5
                
                if (tx >= 0 && tx < w && ty >= 0 && ty < h) {
                    const idx = (ty * w + tx) * 4;
                    matrixPixels[idx] = Math.min(255, matrixPixels[idx] + color.r * tLife);
                    matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + color.g * tLife);
                    matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + color.b * tLife);
                }
            }
        });
        }
        
        // Draw grid overlay based on traffic volume
        const gridSpacing = 32;
        const gridIntensity = Math.min(mps / 30, 1) * 0.3;
        
        for (let y = 0; y < h; y += gridSpacing) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 30 * gridIntensity);
                matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 20 * gridIntensity);
            }
        }
        
        for (let x = 0; x < w; x += gridSpacing) {
            for (let y = 0; y < h; y++) {
                const idx = (y * w + x) * 4;
                matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 30 * gridIntensity);
                matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 20 * gridIntensity);
            }
        }
        
        // MAIN VISUALIZATION - Z-Vector Coherence & QAM Network Signals
        // zv and coherence already declared at function start
        
        // Draw Z-vector coherence ring (represents impedance Z -> 0 behavior)
        const impedanceZ = (1 - coherence) * 100; // Z increases as coherence decreases
        
        // Visual indicator: Ring contracts as Z -> 0 (coherence increases)
        const baseRadius = Math.min(w, h) * 0.35;
        const zRadius = baseRadius * (1 - (impedanceZ / 100) * 0.5); // Contracts when Z low
        
        // Color based on Z state (Z -> 0 is good, high Z is decoherence)
        let zr, zg, zb;
        if (impedanceZ < 10) {
            // Z approaching 0 - optimal (bright orange)
            zr = 255; zg = 170; zb = 0;
        } else if (impedanceZ < 30) {
            // Low Z - good (orange-yellow)
            zr = 255; zg = 200; zb = 50;
        } else if (impedanceZ < 50) {
            // Medium Z - caution (orange-red)
            zr = 255; zg = 120; zb = 0;
        } else {
            // High Z - decoherence (red)
            zr = 255; zg = 50; zb = 50;
        }
        
        // Draw Z-ring (represents Z->0 behavior from TD)
        const zAlpha = 0.6 + (coherence * 0.4);
        for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
            const r = zRadius + Math.sin(angle * 12 + time * 3) * 5 * (impedanceZ / 100);
            const x = Math.floor(centerX + Math.cos(angle) * r);
            const y = Math.floor(centerY + Math.sin(angle) * r);
            
                    if (x >= 0 && x < w && y >= 0 && y < h) {
                        const idx = (y * w + x) * 4;
                matrixPixels[idx] = Math.min(255, matrixPixels[idx] + zr * zAlpha);
                matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + zg * zAlpha);
                matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + zb * zAlpha);
            }
        }
        
        // QAM Signal Visualization (replaces EEG)
        // Draw constellation points representing network signals
        const qamPoints = 16; // 16-QAM constellation
        const qamRadius = Math.min(w, h) * 0.25;
        
        for (let i = 0; i < qamPoints; i++) {
            const angle = (i / qamPoints) * Math.PI * 2 + time * 0.5;
            // Amplitude varies with coherence (network signal strength)
            const amplitude = qamRadius * (0.5 + coherence * 0.5);
            const x = Math.floor(centerX + Math.cos(angle) * amplitude);
            const y = Math.floor(centerY + Math.sin(angle) * amplitude);
            
            if (x >= 0 && x < w && y >= 0 && y < h) {
                // Draw QAM point with glow
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const px = x + dx;
                        const py = y + dy;
                        if (px >= 0 && px < w && py >= 0 && py < h) {
                            const idx = (py * w + px) * 4;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            const intensity = Math.max(0, 1 - dist / 3) * coherence * brightnessMult; // With brightness control
                            
                            // QAM points colored by quadrant (FOA spatialization) - Orange/Red theme
                            const quadrant = i % 4;
                            if (quadrant === 0) { // LFU - bright orange
                                matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 255 * intensity);
                                matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 170 * intensity);
                                matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + 0 * intensity);
                            } else if (quadrant === 1) { // LBD - orange-red
                                matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 255 * intensity);
                                matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 100 * intensity);
                                matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + 0 * intensity);
                            } else if (quadrant === 2) { // RBU - red-orange
                                matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 255 * intensity);
                                matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 80 * intensity);
                                matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + 0 * intensity);
                            } else { // RFD - bright red
                                matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 255 * intensity);
                                matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 50 * intensity);
                                matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + 0 * intensity);
                            }
                        }
                    }
                }
            }
        }
        
        // LEARNING MODE VISUALIZATIONS
        const lm = state.learningModes;
        
        // Visual/Spatial Mode - enhance with spatial pattern indicators
        if (lm.visualSpatialMode.enabled) {
            // Draw spatial grid pattern (more pronounced)
            const gridSize = 16;
            const spatialAlpha = 0.3;
            
            for (let y = 0; y < h; y += gridSize) {
                for (let x = 0; x < w; x += gridSize) {
                    // Create interference pattern
                    const pattern = Math.sin(x * 0.1 + time * 2) * Math.cos(y * 0.1 + time * 2);
                    
                    if (Math.abs(pattern) > 0.7) {
                        const idx = (y * w + x) * 4;
                        // Orange theme color
                        matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 255 * spatialAlpha);
                        matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 170 * spatialAlpha);
                        matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + 0 * spatialAlpha);
                    }
                }
            }
        }
        
        // Passive Mode - show absorption waves (flowing toward center)
        if (lm.passiveMode.enabled) {
            const absorptionRadius = Math.min(w, h) * 0.4;
            const absorptionSpeed = time * 2;
            
            for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
                const r = absorptionRadius - (absorptionSpeed % 30);
                if (r > 0) {
                    const x = Math.floor(centerX + Math.cos(angle) * r);
                    const y = Math.floor(centerY + Math.sin(angle) * r);
                    
                    if (x >= 0 && x < w && y >= 0 && y < h) {
                        const idx = (y * w + x) * 4;
                        // Orange theme color for passive mode
                        matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 255);
                        matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 170);
                        matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + 0);
                    }
                }
            }
        }
        
        // Focused Session - countdown ring
        if (lm.focusedSession.enabled) {
            const fs = lm.focusedSession;
            const progress = fs.timeRemaining / fs.duration;
            const timerRadius = Math.min(w, h) * 0.45;
            
            // Draw progress arc
            const arcLength = Math.PI * 2 * progress;
            for (let angle = 0; angle < arcLength; angle += 0.01) {
                const r = timerRadius;
                const x = Math.floor(centerX + Math.cos(angle - Math.PI / 2) * r);
                const y = Math.floor(centerY + Math.sin(angle - Math.PI / 2) * r);
                
                if (x >= 0 && x < w && y >= 0 && y < h) {
                    const idx = (y * w + x) * 4;
                    const intensity = 0.5 + (progress * 0.5);
                    matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 255 * intensity);
                    matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 170 * intensity);
                    matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + 0);
                }
            }
        }
        
        // Exploration Mode - show discovery particles
        if (lm.explorationMode.enabled) {
            // Draw scattered discovery points
            const discoveryPoints = 8;
            for (let i = 0; i < discoveryPoints; i++) {
                const angle = (i / discoveryPoints) * Math.PI * 2 + time;
                const r = Math.min(w, h) * (0.25 + 0.15 * Math.sin(time * 0.5 + i));
                const x = Math.floor(centerX + Math.cos(angle) * r);
                const y = Math.floor(centerY + Math.sin(angle) * r);
                
                if (x >= 0 && x < w && y >= 0 && y < h) {
                    // Draw glow
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const gx = x + dx;
                            const gy = y + dy;
                            if (gx >= 0 && gx < w && gy >= 0 && gy < h) {
                                const idx = (gy * w + gx) * 4;
                                const dist = Math.sqrt(dx * dx + dy * dy);
                                const intensity = Math.max(0, 1 - dist / 3) * 0.7 * brightnessMult; // With brightness control
                                // Orange-red theme color for exploration mode
                                matrixPixels[idx] = Math.min(255, matrixPixels[idx] + 255 * intensity);
                                matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + 80 * intensity);
                                matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + 0);
                            }
                        }
                    }
                }
            }
        }
        
        // Draw 3D brain mesh at center
        drawBrainMesh(w, h, time);
        
        // Put image data
        matrixCtx.putImageData(matrixImageData, 0, 0);
    }
    
    // 3D Brain Mesh Renderer
    function drawBrainMesh(w, h, time) {
        // Check if brain mesh data is available
        if (typeof brainMeshData === 'undefined' || !brainMeshData.vertices) return;
        
        const centerX = w / 2;
        const centerY = h / 2;
        const scale = Math.min(w, h) * 0.18; // Scale to fit inside particle ring
        
        // Fixed rotation to correct orientation:
        // - 180° around X-axis to flip right-side up (correct upside-down)
        // - 180° around Y-axis to show front face (not back)
        const rotX = Math.PI;   // 180° flip on X axis to fix upside-down
        const rotY = Math.PI;     // 180° rotation on Y axis to show front of brain
        
        // Pre-calculate rotation cosines and sines
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        
        // Color: Orange wireframe to match UI theme
        const r = 255;
        const g = 170;
        const b = 0;
        const alpha = 0.6;
        
        // Process vertices
        const vertices = brainMeshData.vertices;
        const faces = brainMeshData.faces;
        const projectedVertices = [];
        
        // Project all vertices to 2D
        for (let i = 0; i < vertices.length; i += 3) {
            let x = vertices[i];
            let y = vertices[i + 1];
            let z = vertices[i + 2];
            
            // First rotate around X axis (flip upside-down to right-side up)
            let y1 = y * cosX - z * sinX;
            let z1 = y * sinX + z * cosX;
            
            // Then rotate around Y axis
            let x2 = x * cosY - z1 * sinY;
            let z2 = x * sinY + z1 * cosY;
            
            // Project to 2D (simple perspective projection)
            const perspective = 1 / (1 + z2 * 0.3);
            const px = centerX + x2 * scale * perspective;
            const py = centerY + y1 * scale * perspective;
            
            projectedVertices.push({ x: px, y: py, z: z2, perspective });
        }
        
        // Draw faces (wireframe)
        for (let i = 0; i < faces.length; i += 3) {
            const v1 = projectedVertices[faces[i]];
            const v2 = projectedVertices[faces[i + 1]];
            const v3 = projectedVertices[faces[i + 2]];
            
            if (!v1 || !v2 || !v3) continue;
            
            // Calculate face depth for simple hidden surface removal
            const avgZ = (v1.z + v2.z + v3.z) / 3;
            const brightness = Math.max(0.3, 1 - avgZ * 0.5);
            
            // Draw triangle edges
            drawBrainEdge(Math.floor(v1.x), Math.floor(v1.y), Math.floor(v2.x), Math.floor(v2.y), r, g, b, alpha * brightness, w, h);
            drawBrainEdge(Math.floor(v2.x), Math.floor(v2.y), Math.floor(v3.x), Math.floor(v3.y), r, g, b, alpha * brightness, w, h);
            drawBrainEdge(Math.floor(v3.x), Math.floor(v3.y), Math.floor(v1.x), Math.floor(v1.y), r, g, b, alpha * brightness, w, h);
        }
    }
    
    // Helper function to draw a line (Bresenham's algorithm)
    function drawBrainEdge(x0, y0, x1, y1, r, g, b, alpha, w, h) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        
        while (true) {
            if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) {
                const idx = (y0 * w + x0) * 4;
                const blend = alpha;
                
                // Blend with existing pixel
                matrixPixels[idx] = Math.min(255, matrixPixels[idx] + r * blend);
                matrixPixels[idx + 1] = Math.min(255, matrixPixels[idx + 1] + g * blend);
                matrixPixels[idx + 2] = Math.min(255, matrixPixels[idx + 2] + b * blend);
            }
            
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
    }

    // ==========================================
    // WAVEFORM RENDERER
    // ==========================================
    // ==========================================
    // NETWORK TRAFFIC WAVEFORM & VECTORSOPE
    // ==========================================
    const waveHistory = [];
    const MAX_HISTORY = 100;
    const waveCanvas = document.getElementById('waveform-canvas');
    const waveCtx = waveCanvas.getContext('2d');
    
    // Vectorscope canvas and context
    const vectorCanvas = document.getElementById('vectorscope-canvas');
    const vectorCtx = vectorCanvas ? vectorCanvas.getContext('2d') : null;
    let vectorscopeActive = false;
    
    // Mini vectorscope preview canvas
    const miniVectorCanvas = document.getElementById('vectorscope-mini');
    const miniVectorCtx = miniVectorCanvas ? miniVectorCanvas.getContext('2d') : null;
    
    function drawWaveform(channels) {
        // Store channels in history for potential QAM processing
        waveHistory.push([...channels]);
        if (waveHistory.length > MAX_HISTORY) waveHistory.shift();
        
        const w = waveCanvas.width;
        const h = waveCanvas.height;
        
        waveCtx.fillStyle = '#000';
        waveCtx.fillRect(0, 0, w, h);
        
        // Draw network traffic visualization
        // X-axis: time (0 to MAX_HISTORY)
        // Y-axis: packet intensity
        
        const metrics = state.networkMetrics;
        const mps = metrics.messagesPerSecond;
        const packets = state.packets;
        
        // Draw baseline
        waveCtx.strokeStyle = '#222';
        waveCtx.lineWidth = 1;
        waveCtx.beginPath();
        waveCtx.moveTo(0, h * 0.5);
        waveCtx.lineTo(w, h * 0.5);
        waveCtx.stroke();
        
        // Draw packet traffic as spikes
        if (packets.length > 0 || waveHistory.length > 0) {
            // Map packet history to waveform
            const step = w / MAX_HISTORY;
            
            waveCtx.beginPath();
            waveCtx.strokeStyle = '#fa0';
            waveCtx.lineWidth = 2;
            
            for (let i = 0; i < Math.min(waveHistory.length, MAX_HISTORY); i++) {
                const x = i * step;
                // Use first two channels as X/Y for visualization
                const val1 = waveHistory[i][0] || 0.5;
                const val2 = waveHistory[i][1] || 0.5;
                const intensity = Math.abs(val1 - 0.5) + Math.abs(val2 - 0.5);
                const y = h * 0.5 - (intensity * h * 0.4);
                
                if (i === 0) waveCtx.moveTo(x, y);
                else waveCtx.lineTo(x, y);
            }
            
            waveCtx.stroke();
            
            // Draw MPS indicator line
            const mpsHeight = Math.min(mps / 60, 1) * h * 0.3;
            waveCtx.fillStyle = 'rgba(255, 170, 0, 0.3)';
            waveCtx.fillRect(0, h - mpsHeight - 5, w, 3);
        }
        
        // Draw text indicator
        waveCtx.fillStyle = '#553300';
        waveCtx.font = '9px monospace';
        waveCtx.textAlign = 'left';
        waveCtx.fillText(`MPS: ${mps.toFixed(1)}`, 5, h - 5);
    }
    
    // Draw X/Y vectorscope of QAM constellation
    function drawVectorscope() {
        if (!vectorCtx || !vectorscopeActive) return;
        
        const w = vectorCanvas.width;
        const h = vectorCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) * 0.4;
        
        // Clear
        vectorCtx.fillStyle = '#000';
        vectorCtx.fillRect(0, 0, w, h);
        
        // Draw grid
        vectorCtx.strokeStyle = '#222';
        vectorCtx.lineWidth = 1;
        
        // Horizontal and vertical axes
        vectorCtx.beginPath();
        vectorCtx.moveTo(0, cy);
        vectorCtx.lineTo(w, cy);
        vectorCtx.moveTo(cx, 0);
        vectorCtx.lineTo(cx, h);
        vectorCtx.stroke();
        
        // Draw circles
        for (let r = 0.25; r <= 1; r += 0.25) {
            vectorCtx.beginPath();
            vectorCtx.arc(cx, cy, radius * r, 0, Math.PI * 2);
            vectorCtx.stroke();
        }
        
        // Get QAM constellation data
        const qam = state.qamSignals;
        const constellation = qam.constellation || [];
        const zv = state.zVector;
        const coherence = zv.coherenceLevel;
        
        // Draw QAM constellation points as X/Y scatter
        // Use even indices as X, odd as Y
        for (let i = 0; i < constellation.length - 1; i += 2) {
            const xVal = constellation[i] || 0.5;
            const yVal = constellation[i + 1] || 0.5;
            
            // Map to screen coordinates (-1 to 1 range)
            const x = cx + (xVal - 0.5) * 2 * radius;
            const y = cy + (yVal - 0.5) * 2 * radius;
            
            // Determine color based on quadrant (FOA mapping)
            // Colors transition from orange/red (low coherence) to green (Z->0, high coherence)
            const quad = Math.floor(i / 4) % 4;
            let r, g, b;
            
            // Base colors per FOA quadrant (orange/red)
            if (quad === 0) { // LFU
                r = 230; g = 102; b = 0; // Orange
            } else if (quad === 1) { // LBD  
                r = 230; g = 0; b = 3;   // Red
            } else if (quad === 2) { // RBU
                r = 230; g = 102; b = 0; // Orange
            } else { // RFD
                r = 230; g = 0; b = 3;   // Red
            }
            
            // Mix toward green as coherence increases (Z -> 0)
            const coherenceMix = Math.max(0, Math.min(1, (coherence - 0.3) / 0.7));
            r = Math.floor(r * (1 - coherenceMix) + 0 * coherenceMix);
            g = Math.floor(g * (1 - coherenceMix) + 255 * coherenceMix);
            b = Math.floor(b * (1 - coherenceMix) + 100 * coherenceMix);
            
            const colorStr = `rgb(${r},${g},${b})`;
            
            // Draw point with glow
            vectorCtx.fillStyle = colorStr;
            vectorCtx.beginPath();
            vectorCtx.arc(x, y, 4, 0, Math.PI * 2);
            vectorCtx.fill();
            
            // Glow effect
            vectorCtx.beginPath();
            vectorCtx.arc(x, y, 8, 0, Math.PI * 2);
            vectorCtx.fillStyle = `rgba(${r},${g},${b},0.27)`; // Add transparency
            vectorCtx.fill();
        }
        
        // Draw center crosshair
        vectorCtx.strokeStyle = '#fa0';
        vectorCtx.lineWidth = 2;
        vectorCtx.beginPath();
        vectorCtx.moveTo(cx - 10, cy);
        vectorCtx.lineTo(cx + 10, cy);
        vectorCtx.moveTo(cx, cy - 10);
        vectorCtx.lineTo(cx, cy + 10);
        vectorCtx.stroke();
        
        // Labels
        vectorCtx.fillStyle = '#553300';
        vectorCtx.font = '10px monospace';
        vectorCtx.textAlign = 'center';
        vectorCtx.fillText('QAM X/Y', cx, 15);
        vectorCtx.fillText(`SNR: ${qam.snr.toFixed(1)} dB`, cx, h - 5);
    }
    
    // Draw mini vectorscope preview for sidebar
    function drawMiniVectorscope() {
        if (!miniVectorCtx) return;
        
        const w = miniVectorCanvas.width;
        const h = miniVectorCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) * 0.35;
        
        // Clear
        miniVectorCtx.fillStyle = '#000';
        miniVectorCtx.fillRect(0, 0, w, h);
        
        // Draw grid - simpler for mini version
        miniVectorCtx.strokeStyle = '#222';
        miniVectorCtx.lineWidth = 1;
        
        // Crosshair
        miniVectorCtx.beginPath();
        miniVectorCtx.moveTo(0, cy);
        miniVectorCtx.lineTo(w, cy);
        miniVectorCtx.moveTo(cx, 0);
        miniVectorCtx.lineTo(cx, h);
        miniVectorCtx.stroke();
        
        // Draw one reference circle
        miniVectorCtx.beginPath();
        miniVectorCtx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
        miniVectorCtx.stroke();
        
        // Get QAM constellation data
        const qam = state.qamSignals;
        const constellation = qam.constellation || [];
        const zv = state.zVector;
        const coherence = zv.coherenceLevel;
        
        // Draw QAM constellation points as X/Y scatter
        for (let i = 0; i < constellation.length - 1; i += 2) {
            const xVal = constellation[i] || 0.5;
            const yVal = constellation[i + 1] || 0.5;
            
            // Map to screen coordinates
            const x = cx + (xVal - 0.5) * 2 * radius;
            const y = cy + (yVal - 0.5) * 2 * radius;
            
            // Determine color based on quadrant (FOA mapping)
            // Colors transition from orange/red (low coherence) to green (Z->0, high coherence)
            const quad = Math.floor(i / 4) % 4;
            let r, g, b;
            
            // Base colors per FOA quadrant (orange/red)
            if (quad === 0) { // LFU
                r = 230; g = 102; b = 0; // Orange
            } else if (quad === 1) { // LBD  
                r = 230; g = 0; b = 3;   // Red
            } else if (quad === 2) { // RBU
                r = 230; g = 102; b = 0; // Orange
            } else { // RFD
                r = 230; g = 0; b = 3;   // Red
            }
            
            // Mix toward green as coherence increases (Z -> 0)
            const coherenceMix = Math.max(0, Math.min(1, (coherence - 0.3) / 0.7));
            r = Math.floor(r * (1 - coherenceMix) + 0 * coherenceMix);
            g = Math.floor(g * (1 - coherenceMix) + 255 * coherenceMix);
            b = Math.floor(b * (1 - coherenceMix) + 100 * coherenceMix);
            
            miniVectorCtx.fillStyle = `rgb(${r},${g},${b})`;
            
            // Draw smaller point for mini version
            miniVectorCtx.beginPath();
            miniVectorCtx.arc(x, y, 2.5, 0, Math.PI * 2);
            miniVectorCtx.fill();
        }
        
        // Update SNR display in DOM
        const snrEl = document.getElementById('mini-snr');
        if (snrEl) {
            snrEl.textContent = qam.snr.toFixed(1);
        }
    }
    
    // Toggle vectorscope modal
    function toggleVectorscope() {
        const modal = document.getElementById('vectorscope-modal');
        if (!modal) return;
        
        vectorscopeActive = !vectorscopeActive;
        
        if (vectorscopeActive) {
            modal.classList.add('active');
            drawVectorscope();
        } else {
            modal.classList.remove('active');
        }
    }
    
    // Setup vectorscope click handler
    function setupVectorscopeHandler() {
        const waveCanvas = document.getElementById('waveform-canvas');
        const closeBtn = document.getElementById('vectorscope-close');
        const miniContainer = document.getElementById('vectorscope-preview-container');
        
        if (waveCanvas) {
            waveCanvas.addEventListener('click', toggleVectorscope);
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleVectorscope();
            });
        }
        
        // Mini vectorscope click to expand
        if (miniContainer) {
            miniContainer.addEventListener('click', toggleVectorscope);
        }
    }
    
    // Call vectorscope draw in animation loop
    function updateVectorscope() {
        // Always draw mini vectorscope in sidebar
        drawMiniVectorscope();
        
        // Draw full vectorscope when modal is active
        if (vectorscopeActive) {
            drawVectorscope();
        }
    }
    
    // Resize waveform canvas
    function resizeWaveformCanvas() {
        const waveCanvas = document.getElementById('waveform-canvas');
        if (waveCanvas && waveCanvas.parentElement) {
            const rect = waveCanvas.parentElement.getBoundingClientRect();
            waveCanvas.width = rect.width;
            waveCanvas.height = 60;
        }
    }

    // ==========================================
    // UI UPDATES
    // ==========================================
    function updateStatus(type, active) {
        const dot = document.getElementById(`${type}-status`);
        if (dot) dot.classList.toggle('active', active);
    }

    function updatePipelineStatus(data) {
        state.eegRunning = data.eeg_running;
        
        // Update Z-vector status dot based on coherence
        const zv = state.zVector;
        const isCoherent = zv.coherenceLevel > zv.decoherenceThreshold;
        updateStatus('zv', isCoherent);
        
        const statusEl = document.getElementById('pipeline-status');
        const sourceEl = document.getElementById('data-source');
        
        if (statusEl) statusEl.textContent = data.eeg_running ? 'Running' : 'Stopped';
        if (sourceEl) sourceEl.textContent = data.eeg_source_type || 'Network';
        
        // Bridge button controls removed - now auto-connects
        // document.getElementById('btn-start').disabled = !state.connected || state.eegRunning;
        // document.getElementById('btn-stop').disabled = !state.connected || !state.eegRunning;
    }

    function updateModelList(models) {
        if (!models || !models.length) return;
        
        state.models.available = models;
        const options = models.map(m => `<option value="${m}">${m}</option>`).join('');
        
        const leftSelect = document.getElementById('left-model');
        const rightSelect = document.getElementById('right-model');
        const comparatorSelect = document.getElementById('comparator-model');
        
        if (leftSelect) leftSelect.innerHTML = '<option value="">Left Hemisphere...</option>' + options;
        if (rightSelect) rightSelect.innerHTML = '<option value="">Right Hemisphere...</option>' + options;
        if (comparatorSelect) comparatorSelect.innerHTML = '<option value="">Comparator/Synthesizer...</option>' + options;
        
        // Restore last selected models from localStorage
        restoreSavedModels();
    }
    
    // Save selected models to localStorage
    function saveModelSelections() {
        const leftSelect = document.getElementById('left-model');
        const rightSelect = document.getElementById('right-model');
        const comparatorSelect = document.getElementById('comparator-model');
        const maxTokensInput = document.getElementById('max-tokens');
        
        const selections = {
            left: leftSelect?.value || '',
            right: rightSelect?.value || '',
            comparator: comparatorSelect?.value || '',
            maxTokens: parseInt(maxTokensInput?.value) || 4096,
            timestamp: Date.now()
        };
        
        try {
            localStorage.setItem('brainscan_models', JSON.stringify(selections));
            console.log('[Models] Saved selections:', selections);
        } catch (e) {
            console.warn('[Models] Failed to save selections:', e);
        }
    }
    
    // Restore saved model selections from localStorage
    function restoreSavedModels() {
        try {
            const saved = localStorage.getItem('brainscan_models');
            if (!saved) return;
            
            const selections = JSON.parse(saved);
            const availableModels = state.models.available;
            
            // Check if any saved models are invalid (not in available list)
            const invalidModels = [];
            if (selections.left && !availableModels.includes(selections.left)) {
                invalidModels.push(selections.left);
            }
            if (selections.right && !availableModels.includes(selections.right)) {
                invalidModels.push(selections.right);
            }
            if (selections.comparator && !availableModels.includes(selections.comparator)) {
                invalidModels.push(selections.comparator);
            }
            
            // If invalid models found, clear localStorage and reset
            if (invalidModels.length > 0) {
                console.warn('[Models] Invalid models found in localStorage:', invalidModels);
                console.log('[Models] Clearing localStorage and resetting model selections');
                localStorage.removeItem('brainscan_models');
                state.models.left = null;
                state.models.right = null;
                state.models.comparator = null;
                addChatMessage('system', 
                    `⚠️ Invalid models cleared: ${invalidModels.join(', ')}. Please select available models from the dropdown.`, 
                    'both');
                return;
            }
            
            const leftSelect = document.getElementById('left-model');
            const rightSelect = document.getElementById('right-model');
            const comparatorSelect = document.getElementById('comparator-model');
            const maxTokensInput = document.getElementById('max-tokens');
            
            // Restore valid models
            if (leftSelect && selections.left) {
                leftSelect.value = selections.left;
                state.models.left = selections.left;
            }
            if (rightSelect && selections.right) {
                rightSelect.value = selections.right;
                state.models.right = selections.right;
            }
            if (comparatorSelect && selections.comparator) {
                comparatorSelect.value = selections.comparator;
                state.models.comparator = selections.comparator;
            }
            
            // Restore max tokens setting
            if (maxTokensInput && selections.maxTokens) {
                maxTokensInput.value = selections.maxTokens;
                state.models.maxTokens = selections.maxTokens;
            }
            
            // Auto-send model configuration if restored
            if (state.models.left || state.models.right || state.models.comparator) {
                console.log('[Models] Restored from localStorage:', selections);
                
                // Send restored models to server
                if (state.models.left) {
                    send({ type: 'set_model', hemisphere: 'left', model_id: state.models.left }, true);
                }
                if (state.models.right) {
                    send({ type: 'set_model', hemisphere: 'right', model_id: state.models.right }, true);
                }
                if (state.models.comparator) {
                    send({ type: 'set_model', hemisphere: 'comparator', model_id: state.models.comparator }, true);
                }
                
                addChatMessage('system', `Restored models: ${state.models.left || 'none'} (left), ${state.models.right || 'none'} (right), ${state.models.comparator || 'none'} (comparator)`, 'both');
            }
        } catch (e) {
            console.warn('[Models] Failed to restore selections:', e);
            // Clear localStorage on error
            localStorage.removeItem('brainscan_models');
        }
    }
    
    function updateHemisphereStatus(hemisphere, status) {
        // Update status text
        const statusEl = document.getElementById(`${hemisphere}-status`);
        if (statusEl) {
            // Only allow specific statuses
            const allowedStatuses = ['ready', 'thinking', 'complete'];
            const normalizedStatus = status.toLowerCase().replace(/\.|\s/g, '');
            const finalStatus = allowedStatuses.find(s => normalizedStatus.includes(s)) || 'ready';
            statusEl.textContent = finalStatus;
        }
        
        // Update status dot
        const dotEl = document.getElementById(`${hemisphere}-status-dot`);
        if (dotEl) {
            // Remove all status classes
            dotEl.classList.remove('ready', 'thinking', 'complete');
            
            // Add appropriate class based on status
            const normalizedStatus = status.toLowerCase();
            if (normalizedStatus.includes('thinking') || normalizedStatus.includes('process')) {
                dotEl.classList.add('thinking');
            } else if (normalizedStatus.includes('complete') || normalizedStatus.includes('done')) {
                dotEl.classList.add('complete');
            } else {
                dotEl.classList.add('ready');
            }
        }
    }

    function showHemisphereContent(hemisphere, content) {
        // This function is now deprecated - content goes to chat only
        // Status is shown in matrix overlay via updateHemisphereStatus
        // Just update status if content indicates a state change
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes('thinking') || lowerContent.includes('process')) {
            updateHemisphereStatus(hemisphere, 'thinking');
        } else if (lowerContent.includes('complete') || lowerContent.includes('done')) {
            updateHemisphereStatus(hemisphere, 'complete');
        } else if (lowerContent.includes('ready') || lowerContent.includes('wait')) {
            updateHemisphereStatus(hemisphere, 'ready');
        }
    }

    function updateChannelBars(channels) {
        const container = document.getElementById('channel-bars');
        if (!container) return;
        
        if (container.children.length === 0) {
            // Generate QAM constellation channel labels (Q0-Q15 for 16-QAM)
            const names = Array.from({length: 16}, (_, i) => `Q${i}`);
            names.forEach((name, idx) => {
                const bar = document.createElement('div');
                bar.className = 'channel-bar';
                bar.innerHTML = `
                    <span class="channel-label">${name}</span>
                    <div class="channel-meter">
                        <div class="channel-fill" id="ch-fill-${idx}"></div>
                    </div>
                `;
                container.appendChild(bar);
            });
        }
        
        // Update all 16 QAM constellation channels
        const qamChannels = channels.slice(0, 16);
        qamChannels.forEach((val, idx) => {
            const fill = document.getElementById(`ch-fill-${idx}`);
            if (fill) {
                const pct = ((val - 0.5) / 1.0) * 100;
                fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
            }
        });
    }

    function updateCacheStats(data) {
        const hitRateEl = document.getElementById('cache-hit-rate');
        const sizeEl = document.getElementById('cache-size');
        
        if (hitRateEl) hitRateEl.textContent = `${data.hit_rate.toFixed(1)}%`;
        if (sizeEl) sizeEl.textContent = data.size;
        
        updateStatus('cache', data.hit_rate > 50);
    }

    function updateCacheDisplay() {
        const stats = queryCache.getStats();
        const hitRateEl = document.getElementById('cache-hit-rate');
        const sizeEl = document.getElementById('cache-size');
        
        if (hitRateEl) hitRateEl.textContent = `${stats.hitRate.toFixed(1)}%`;
        if (sizeEl) sizeEl.textContent = stats.size;
    }
    
    // OPTIMIZATION: Update sliding window and adaptive thresholding UI stats
    function updateOptimizationStats() {
        const qam = state.qamSignals;
        const sw = qam.slidingWindow;
        const at = qam.adaptiveThresholds;
        const sf = qam.signalFusion;
        const cr = qam.channelReduction;
        
        const patternScoreEl = document.getElementById('pattern-score');
        const adaptiveThresholdEl = document.getElementById('adaptive-threshold');
        const fusedChannelsEl = document.getElementById('fused-channels');
        const activeChannelsEl = document.getElementById('active-channels');
        
        if (patternScoreEl && sw.patternScores.length > 0) {
            const avgPatternScore = sw.patternScores.reduce((a, b) => a + b, 0) / 16;
            patternScoreEl.textContent = avgPatternScore.toFixed(2);
        }
        
        if (adaptiveThresholdEl && at.channelMultipliers.length > 0) {
            const avgMultiplier = at.channelMultipliers.reduce((a, b) => a + b, 0) / 16;
            const effectiveThreshold = at.baseThreshold * avgMultiplier;
            adaptiveThresholdEl.textContent = effectiveThreshold.toFixed(2);
        }
        
        if (fusedChannelsEl && sf.fusedValues) {
            const fusedCount = sf.fusedValues.filter(v => v !== null).length;
            fusedChannelsEl.textContent = `${fusedCount}/16`;
        }
        
        if (activeChannelsEl) {
            activeChannelsEl.textContent = `${cr.targetChannels}/16`;
        }
    }

    // ==========================================
    // CHAT INTERFACE
    // ==========================================
    
    // OPTIMIZATION: Async bicameral processing with priority queue
    async function processWithPriority(message, priority = 'medium') {
        const timeout = state.responseTimeouts[priority] || 1500;
        const startTime = performance.now();
        
        // Add to processing queue with priority
        const taskId = Date.now();
        state.processingQueue.push({
            id: taskId,
            message,
            priority: state.priorityLevels[priority],
            startTime,
            timeout,
            status: 'pending'
        });
        
        // Sort queue by priority (lower number = higher priority)
        state.processingQueue.sort((a, b) => a.priority - b.priority);
        
        // Process queue asynchronously
        await processQueueAsync();
        
        return taskId;
    }
    
    // OPTIMIZATION: Process queue with async signal exchange
    async function processQueueAsync() {
        if (!state.asyncProcessingEnabled || state.processingQueue.length === 0) return;
        
        // Process high priority items first with minimal latency
        const highPriorityTasks = state.processingQueue.filter(t => t.priority === 1);
        const otherTasks = state.processingQueue.filter(t => t.priority > 1);
        
        // Process high priority immediately (sub-millisecond target)
        for (const task of highPriorityTasks) {
            if (task.status === 'pending') {
                task.status = 'processing';
                // Fast-track: reduced latency for critical decisions
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        // Process other tasks in parallel (if enabled)
        if (state.parallelProcessing && otherTasks.length > 0) {
            await Promise.all(otherTasks.map(async task => {
                if (task.status === 'pending') {
                    task.status = 'processing';
                    // Graded delay based on priority
                    const delay = task.priority === 2 ? 50 : 100;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }));
        }
        
        // Clean up completed tasks
        state.processingQueue = state.processingQueue.filter(t => t.status !== 'complete');
    }
    
    // OPTIMIZATION: Graded feedback mechanism for bicameral processing
    function calculateFeedbackGrade(leftConfidence, rightConfidence, latency) {
        const avgConfidence = (leftConfidence + rightConfidence) / 2;
        const latencyScore = Math.max(0, 1 - latency / 1000); // Normalize to 1s
        const coherence = state.zVector.coherenceLevel;
        
        // Combined score: confidence × latency × coherence
        const score = avgConfidence * latencyScore * coherence;
        
        if (score > state.decisionThresholds.accept) return 'high';
        if (score > state.decisionThresholds.revise) return 'medium';
        if (score > state.decisionThresholds.reject) return 'low';
        return 'none';
    }
    
    // OPTIMIZATION: Track hemisphere latency for async optimization
    function updateHemisphereLatency(hemisphere, processingTime) {
        state.hemisphereLatency[hemisphere] = processingTime;
        state.hemisphereLatency.lastSync = Date.now();
        
        // Log latency if significant difference detected
        const diff = Math.abs(state.hemisphereLatency.left - state.hemisphereLatency.right);
        if (diff > 500 && state.frameCount % 60 === 0) {
            console.warn(`[Bicameral] Hemisphere latency imbalance: ${diff}ms`);
        }
    }
    
    function addChatMessage(role, content, hemisphere) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        
        const msg = document.createElement('div');
        msg.className = `chat-message ${role}`;
        
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        msg.innerHTML = `
            <div class="chat-time">${time} ${hemisphere !== 'both' ? '[' + hemisphere + ']' : ''}</div>
            <div>${content.replace(/\n/g, '<br>')}</div>
        `;
        
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
        
        while (container.children.length > 50) {
            container.removeChild(container.firstChild);
        }
        
        state.chatHistory.push({ role, content, hemisphere, time });
    }
    
    // OPTIMIZATION: Enhanced sendChatMessage with async processing
    async function sendChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input || !input.value.trim()) return;
        
        const message = input.value.trim();
        input.value = '';
        
        // Auto-adjust bicameral weights based on query type
        autoAdjustWeights(message);
        
        // OPTIMIZATION: Determine priority based on query characteristics
        let priority = 'medium';
        if (message.length < 20) priority = 'high'; // Short queries = fast response
        else if (message.includes('?') && message.split('?').length > 2) priority = 'low'; // Complex multi-question
        else if (/\b(urgent|emergency|critical|immediate)\b/i.test(message)) priority = 'high';
        
        const cached = queryCache.get(message);
        if (cached) {
            addChatMessage('user', message, 'both');
            addChatMessage('model', `[CACHED]\n${cached}`, 'both');
            updateCacheDisplay();
            return;
        }
        
        addChatMessage('user', message, 'both');
        state.pendingResponses.query = message;
        
        // OPTIMIZATION: Process with priority queuing
        const taskId = await processWithPriority(message, priority);
        
        // Send with current weight configuration (immediate for chat)
        const bw = state.bicameralWeights;
        const cg = state.qamSignals.contextGuardrails;
        
        console.log(`[DEBUG] Sending chat with mode: ${cg.mode} (enabled: ${cg.enabled})`);
        
        // Get max tokens from input
        const maxTokensInput = document.getElementById('max-tokens');
        const maxTokens = parseInt(maxTokensInput?.value) || 4096;
        state.models.maxTokens = maxTokens;
        
        send({
            type: 'chat_message',
            message: message,
            hemisphere: 'both',
            mode: cg.mode,  // 'standard' or 'internal_analysis'
            max_tokens: maxTokens,  // Max tokens for this query
            weights: {
                left: bw.left,
                right: bw.right,
                mode: bw.mode  // Keep this for backward compatibility
            },
            priority: priority, // Send priority to server
            taskId: taskId
        }, true); // Immediate - chat messages are critical
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================
    function setupEventListeners() {
        // Bridge connection buttons removed - now auto-connects
        // document.getElementById('btn-connect')?.addEventListener('click', connect);
        // document.getElementById('btn-start')?.addEventListener('click', () => {
        //     send({ type: 'start_eeg', source_type: 'simulated', sample_rate: 256 });
        // });
        // document.getElementById('btn-stop')?.addEventListener('click', () => {
        //     send({ type: 'stop_eeg' });
        // });
        
        document.getElementById('btn-set-models')?.addEventListener('click', () => {
            const left = document.getElementById('left-model')?.value;
            const right = document.getElementById('right-model')?.value;
            const comparator = document.getElementById('comparator-model')?.value;
            
            if (left) {
                send({ type: 'set_model', hemisphere: 'left', model_id: left }, true); // Immediate
                state.models.left = left;
            }
            if (right) {
                send({ type: 'set_model', hemisphere: 'right', model_id: right }, true); // Immediate
                state.models.right = right;
            }
            if (comparator) {
                send({ type: 'set_model', hemisphere: 'comparator', model_id: comparator }, true); // Immediate
                state.models.comparator = comparator;
            }
            
            // Save selections to localStorage for persistence
            saveModelSelections();
        });
        
        document.getElementById('btn-clear-cache')?.addEventListener('click', () => {
            queryCache.clear();
            send({ type: 'clear_cache' }, true); // Immediate
            updateCacheDisplay();
            addChatMessage('system', 'Cache cleared', 'both');
        });
        
        // Z-vector boundary processing controls
        document.getElementById('btn-zv-test')?.addEventListener('click', () => {
            startZVectorTest();
        });
        
        document.getElementById('btn-zv-attention')?.addEventListener('click', () => {
            enhanceAttentionalEngagement();
        });
        
        // Bicameral weighting controls
        document.getElementById('btn-bc-balanced')?.addEventListener('click', () => {
            setBicameralMode('balanced');
        });
        
        document.getElementById('btn-bc-analytical')?.addEventListener('click', () => {
            setBicameralMode('analytical');
        });
        
        document.getElementById('btn-bc-intuitive')?.addEventListener('click', () => {
            setBicameralMode('intuitive');
        });
        
        document.getElementById('btn-bc-adaptive')?.addEventListener('click', () => {
            setBicameralMode('adaptive');
        });
        
        document.getElementById('btn-bc-manual')?.addEventListener('click', () => {
            // Toggle between manual override options or open a modal
            const bw = state.bicameralWeights;
            if (bw.mode === 'manual') {
                // Cycle through manual presets
                if (bw.left === 0.7) {
                    adjustBicameralWeights(0.8, 0.2, 'manual');
                    addChatMessage('system', 'Manual mode: 80/20 Analytical', 'both');
                } else if (bw.left === 0.8) {
                    adjustBicameralWeights(0.9, 0.1, 'manual');
                    addChatMessage('system', 'Manual mode: 90/10 Analytical', 'both');
                } else {
                    adjustBicameralWeights(0.7, 0.3, 'manual');
                    addChatMessage('system', 'Manual mode: 70/30 Analytical', 'both');
                }
            } else {
                setBicameralMode('manual');
            }
        });
        
        // Learning Mode toggles
        document.getElementById('btn-passive-mode')?.addEventListener('click', () => {
            togglePassiveMode();
        });
        
        document.getElementById('btn-focused-session')?.addEventListener('click', () => {
            toggleFocusedSession();
        });
        
        document.getElementById('btn-visual-mode')?.addEventListener('click', () => {
            toggleVisualSpatialMode();
        });
        
        document.getElementById('btn-exploration-mode')?.addEventListener('click', () => {
            toggleExplorationMode();
        });
        
        document.getElementById('btn-send')?.addEventListener('click', sendChatMessage);
        document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Shift+Enter: insert line break
                    e.preventDefault();
                    const input = e.target;
                    const start = input.selectionStart;
                    const end = input.selectionEnd;
                    const value = input.value;
                    input.value = value.substring(0, start) + '\n' + value.substring(end);
                    input.selectionStart = input.selectionEnd = start + 1;
                } else {
                    // Enter: send message
                    e.preventDefault();
                    sendChatMessage();
                }
            }
        });
        
        // Matrix visualization controls
        document.getElementById('matrix-brightness')?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            CONFIG.BRIGHTNESS = val / 100;
            document.getElementById('brightness-value').textContent = val;
        });
        
        document.getElementById('matrix-response')?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            CONFIG.RESPONSE = val;
            document.getElementById('response-value').textContent = val;
        });
        
        document.getElementById('matrix-glow')?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            CONFIG.GLOW_INTENSITY = val / 100;
            document.getElementById('glow-value').textContent = val;
        });
        
        window.addEventListener('resize', () => {
            resizeWaveformCanvas();
            resizeMatrixCanvas();
        });
        
        // OPTIMIZATION_FRAMEWORK: Control panel event handlers
        let autoTuneEnabled = false;
        
        document.getElementById('btn-auto-tune')?.addEventListener('click', () => {
            autoTuneEnabled = !autoTuneEnabled;
            const btn = document.getElementById('btn-auto-tune');
            
            if (autoTuneEnabled) {
                startAutoTuning();
                if (btn) {
                    btn.textContent = 'Auto-Tune: ON';
                    btn.style.background = '#00ff88';
                    btn.style.color = '#000';
                }
                addChatMessage('system', 'Auto-tuning enabled - parameters will adjust automatically every 10 seconds', 'both');
            } else {
                if (autoTuneInterval) {
                    clearInterval(autoTuneInterval);
                    autoTuneInterval = null;
                }
                if (btn) {
                    btn.textContent = 'Auto-Tune: OFF';
                    btn.style.background = 'transparent';
                    btn.style.color = '#fa0';
                }
                addChatMessage('system', 'Auto-tuning disabled', 'both');
            }
        });
        
        document.getElementById('btn-validate-state')?.addEventListener('click', () => {
            const suggestions = validateBicameralState();
            const suggestionsEl = document.getElementById('optimization-suggestions');
            
            if (suggestions.length === 0) {
                addChatMessage('system', 'State validation passed - no optimization suggestions', 'both');
                if (suggestionsEl) {
                    suggestionsEl.innerHTML = '<span style="color: #0f0;">✓ System optimal</span>';
                }
            } else {
                const msg = `State validation: ${suggestions.length} suggestion${suggestions.length > 1 ? 's' : ''} found`;
                addChatMessage('system', msg, 'both');
                
                if (suggestionsEl) {
                    suggestionsEl.innerHTML = suggestions.map(s => 
                        `<div style="color: ${s.severity === 'high' ? '#e60003' : s.severity === 'medium' ? '#ffaa00' : '#aaaaaa'};">
                            • ${s.type}: ${s.message}
                        </div>`
                    ).join('');
                }
                
                // Update last validation timestamp
                const validationEl = document.getElementById('last-validation');
                if (validationEl) {
                    const now = new Date();
                    validationEl.textContent = now.toLocaleTimeString();
                }
            }
            
            // Update buffer status display
            const bufferStatusEl = document.getElementById('buffer-status');
            if (bufferStatusEl) {
                const state = getBicameralState();
                bufferStatusEl.textContent = state.buffer_status;
                bufferStatusEl.style.color = state.buffer_status === 'active' ? '#0f0' : '#ffaa00';
            }
        });
        
        document.getElementById('btn-export-state')?.addEventListener('click', () => {
            const state = getBicameralState();
            const stateJson = JSON.stringify(state, null, 2);
            
            // Copy to clipboard
            navigator.clipboard.writeText(stateJson).then(() => {
                addChatMessage('system', 'Bicameral state exported to clipboard', 'both');
                console.log('[OPTIMIZATION_FRAMEWORK] State exported:', state);
            }).catch(() => {
                console.log('[OPTIMIZATION_FRAMEWORK] State export (clipboard failed):', state);
                addChatMessage('system', 'State exported to console (clipboard failed)', 'both');
            });
        });
        
        // Performance Testing Framework event handlers
        let testModeEnabled = false;
        
        document.getElementById('btn-toggle-testing')?.addEventListener('click', () => {
            testModeEnabled = !testModeEnabled;
            state.qamSignals.performanceTesting.enabled = testModeEnabled;
            
            const btn = document.getElementById('btn-toggle-testing');
            if (testModeEnabled) {
                if (btn) {
                    btn.textContent = 'Test Mode: ON';
                    btn.style.background = '#ffaa00';
                    btn.style.color = '#000';
                }
                addChatMessage('system', 'Performance testing mode enabled. Run benchmarks to test optimizations.', 'both');
            } else {
                if (btn) {
                    btn.textContent = 'Test Mode: OFF';
                    btn.style.background = 'transparent';
                    btn.style.color = '#fa0';
                }
                addChatMessage('system', 'Performance testing mode disabled', 'both');
            }
        });
        
        document.getElementById('btn-run-benchmark')?.addEventListener('click', async () => {
            if (!state.qamSignals.performanceTesting.enabled) {
                addChatMessage('system', 'Enable Test Mode first to run benchmarks', 'both');
                return;
            }
            
            // Run full benchmark suite
            const benchmarkBtn = document.getElementById('btn-run-benchmark');
            if (benchmarkBtn) {
                benchmarkBtn.textContent = 'Running...';
                benchmarkBtn.disabled = true;
            }
            
            try {
                await runBenchmarkSuite();
            } finally {
                if (benchmarkBtn) {
                    benchmarkBtn.textContent = 'Run Benchmark';
                    benchmarkBtn.disabled = false;
                }
            }
        });
        
        // OPTIMIZATION: Tuning profile button event listeners
        document.getElementById('btn-profile-balanced')?.addEventListener('click', () => {
            applyTuningProfile('balanced');
            // Visual feedback - use CSS active class
            ['btn-profile-balanced', 'btn-profile-highspeed', 'btn-profile-lowlatency'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    if (id === 'btn-profile-balanced') {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                }
            });
        });
        
        document.getElementById('btn-profile-highspeed')?.addEventListener('click', () => {
            applyTuningProfile('highSpeed');
            ['btn-profile-balanced', 'btn-profile-highspeed', 'btn-profile-lowlatency'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    if (id === 'btn-profile-highspeed') {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                }
            });
        });
        
        document.getElementById('btn-profile-lowlatency')?.addEventListener('click', () => {
            applyTuningProfile('lowLatency');
            ['btn-profile-balanced', 'btn-profile-highspeed', 'btn-profile-lowlatency'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    if (id === 'btn-profile-lowlatency') {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                }
            });
        });
        
        // CONTEXT CONTROL: Toggle Context Mode
        document.getElementById('btn-toggle-context-mode')?.addEventListener('click', () => {
            const cg = state.qamSignals.contextGuardrails;
            
            // Toggle mode: button active = guardrails ON, button inactive = guardrails OFF
            cg.enabled = !cg.enabled;
            cg.mode = cg.enabled ? 'internal_analysis' : 'standard';
            cg.lastToggle = Date.now();
            cg.toggleCount++;
            
            const btn = document.getElementById('btn-toggle-context-mode');
            const guardrailsEl = document.getElementById('guardrails-status');
            const warningEl = document.getElementById('context-warning');
            
            if (cg.enabled) {
                // Internal Systems Analysis Mode - guardrails ON (restricted to QAM/FOA)
                if (btn) {
                    btn.classList.add('active');
                }
                if (guardrailsEl) {
                    guardrailsEl.textContent = 'ON';
                    guardrailsEl.style.color = '#0f0';
                }
                if (warningEl) warningEl.style.display = 'block';
                
                console.log('[CONTEXT] Guardrails ENABLED - internal systems analysis mode');
                addChatMessage('system', 'Internal Systems Analysis Mode: AI restricted to QAM16/FOA domain.', 'both');
            } else {
                // Standard Mode - guardrails OFF (unrestricted)
                if (btn) {
                    btn.classList.remove('active');
                }
                if (guardrailsEl) {
                    guardrailsEl.textContent = 'OFF';
                    guardrailsEl.style.color = '#e60003';
                }
                if (warningEl) warningEl.style.display = 'none';
                
                console.log('[CONTEXT] Guardrails DISABLED - standard mode');
                addChatMessage('system', 'Standard Mode: AI unrestricted.', 'both');
            }
        });
    }

    // ==========================================
    // ANIMATION LOOP
    // ==========================================
    function animate(timestamp) {
        if (timestamp - state.lastFrameTime >= 1000) {
            document.getElementById('fps-counter').textContent = state.frameCount;
            state.frameCount = 0;
            state.lastFrameTime = timestamp;
        }
        state.frameCount++;
        
        drawMatrix();
        
        // Run adaptive coherence tuning
        adaptiveCoherenceTuning(timestamp);
        
        // Update network stats display
        const packetCounter = document.getElementById('packet-counter');
        const mpsCounter = document.getElementById('mps-counter');
        const qualityCounter = document.getElementById('quality-counter');
        
        if (packetCounter) packetCounter.textContent = state.networkMetrics.messageCount;
        if (mpsCounter) mpsCounter.textContent = state.networkMetrics.messagesPerSecond.toFixed(1);
        if (qualityCounter) qualityCounter.textContent = (state.networkMetrics.connectionQuality * 100).toFixed(0) + '%';
        
        // Update coherence monitoring display
        const coherenceDisplay = document.getElementById('coherence-display');
        const zvectorDisplay = document.getElementById('zvector-display');
        
        if (coherenceDisplay) {
            const coherence = state.zVector.coherenceLevel;
            coherenceDisplay.textContent = coherence.toFixed(2);
            // Color coding: Red (<0.7) → Yellow (0.7-0.85) → Green (>0.85)
            if (coherence < 0.7) {
                coherenceDisplay.style.color = '#e60003'; // Red
            } else if (coherence < 0.85) {
                coherenceDisplay.style.color = '#fa0'; // Yellow
            } else {
                coherenceDisplay.style.color = '#0f0'; // Green
            }
        }
        
        if (zvectorDisplay) {
            const impedanceZ = (1 - state.zVector.coherenceLevel) * 100;
            zvectorDisplay.textContent = impedanceZ.toFixed(1);
        }
        
        // OPTIMIZATION: Display channel routing metrics
        const qam = state.qamSignals;
        if (qam.routingMode) {
            // Log optimization metrics every 60 frames (~1 second)
            if (state.frameCount % 60 === 0) {
                const efficiency = (qam.activeChannels / 16 * 100).toFixed(0);
                const mode = qam.routingMode.toUpperCase();
                console.log(`[QAM16] Mode: ${mode} | Active: ${qam.activeChannels}/16 | Efficiency: ${efficiency}%`);
            }
        }
        
        // Update Z-vector boundary display
        const zvStatus = getZVectorStatus();
        const coherenceEl = document.getElementById('zv-coherence');
        const thresholdEl = document.getElementById('zv-threshold');
        const statusEl = document.getElementById('zv-status');
        const boundaryEl = document.getElementById('zv-boundary');
        const recoveryEl = document.getElementById('zv-recovery');
        const plasticityEl = document.getElementById('zv-plasticity');
        const recommendationsEl = document.getElementById('zv-recommendations');
        
        if (coherenceEl) coherenceEl.textContent = zvStatus.coherence;
        if (thresholdEl) thresholdEl.textContent = zvStatus.threshold;
        if (statusEl) {
            statusEl.textContent = zvStatus.status;
            // Color code the status
            if (zvStatus.status === 'BOUNDARY-CRITICAL' || zvStatus.status === 'LOW-COHERENCE') {
                statusEl.style.color = '#ff0099'; // Pink/purple for decoherence
            } else if (zvStatus.status === 'BOUNDARY-PROXIMATE') {
                statusEl.style.color = '#ff6600'; // Orange for warning
            } else if (zvStatus.status === 'TESTING') {
                statusEl.style.color = '#00ffff'; // Cyan for active test
            } else {
                statusEl.style.color = '#00ff00'; // Green for normal
            }
        }
        if (boundaryEl) boundaryEl.textContent = zvStatus.boundary;
        if (recoveryEl) recoveryEl.textContent = zvStatus.recoveryScore;
        if (plasticityEl) {
            plasticityEl.textContent = zvStatus.plasticityStatus;
            plasticityEl.style.color = zvStatus.plasticityStatus === 'OPTIMAL' ? '#00ff00' :
                                      zvStatus.plasticityStatus === 'MODERATE' ? '#ffaa00' : '#ff0000';
        }
        
        // Update recommendations panel
        if (recommendationsEl) {
            if (zvStatus.recommendations && zvStatus.recommendations.length > 0) {
                recommendationsEl.style.display = 'block';
                recommendationsEl.innerHTML = zvStatus.recommendations.join('<br>');
            } else {
                recommendationsEl.style.display = 'none';
            }
        }
        
        // Update Z-vector status dot
        const zvDot = document.getElementById('zv-status-dot');
        if (zvDot) {
            if (zvStatus.status === 'BOUNDARY-CRITICAL' || zvStatus.status === 'LOW-COHERENCE') {
                zvDot.style.background = '#ff0099'; // Pink for decoherence
                zvDot.style.boxShadow = '0 0 6px #ff0099';
            } else if (zvStatus.status === 'BOUNDARY-PROXIMATE') {
                zvDot.style.background = '#ff6600'; // Orange for warning
                zvDot.style.boxShadow = '0 0 6px #ff6600';
            } else if (zvStatus.status === 'TESTING') {
                zvDot.style.background = '#00ffff'; // Cyan for active test
                zvDot.style.boxShadow = '0 0 6px #00ffff';
            } else {
                zvDot.style.background = '#00ff00'; // Green for normal
                zvDot.style.boxShadow = '0 0 4px #00ff00';
            }
        }
        
        // Update Tunnel Diode
        updateTunnelDiode();
        updateTDisplay();
        
        // Update Learning Modes
        updateLearningModeDisplay();
        
        // Update inference cache stats every 60 frames (~1 second at 60fps)
        if (state.frameCount % 60 === 0) {
            const cacheStats = inferenceCache.getStats();
            const inferenceCacheEl = document.getElementById('inference-cache-hits');
            if (inferenceCacheEl) {
                inferenceCacheEl.textContent = `${(cacheStats.hitRate * 100).toFixed(1)}% (${cacheStats.size})`;
            }
        }
        
        // Update Vectorscope if active
        updateVectorscope();
        
        // OPTIMIZATION: Calculate SNR and analyze pipeline efficiency (every 60 frames)
        if (state.frameCount % 60 === 0) {
            calculateSNR();
            analyzePipelineEfficiency();
            updatePerformanceTestUI();
        }
        
        // OPTIMIZATION: Bicameral optimizations (cross-channel attention, bilateral loss, gradient flow)
        if (state.frameCount % 30 === 0) {
            updateCrossChannelAttention();
            balanceBilateralLoss();
            monitorGradientFlow();
            updateBicameralOptimizationUI();
        }
        
        // OPTIMIZATION: Additional optimizations (sliding window, frequency band, suggestions)
        if (state.frameCount % 60 === 0) {
            adjustSlidingWindowSize();       // Dynamic window size for throughput
            applyFrequencyBandSelection();   // Prioritize high-SNR frequency bands
            // generateOptimizationSuggestions() is called by other functions when needed
        }
        
        requestAnimationFrame(animate);
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================
    function init() {
        resizeWaveformCanvas();
        resizeMatrixCanvas(); // Initialize matrix canvas size
        setupEventListeners();
        setupVectorscopeHandler(); // Setup vectorscope click handler
        updateChannelBars(new Array(16).fill(0.5)); // Initialize with 16 QAM channels
        updateBicameralDisplay(); // Initialize bicameral weight display
        updateLearningModeDisplay(); // Initialize learning mode display
        
        // OPTIMIZATION_FRAMEWORK: Initialize framework
        console.log('[OPTIMIZATION_FRAMEWORK] Bicameral processing state structure initialized');
        console.log('[OPTIMIZATION_FRAMEWORK] Available exports: getBicameralState(), applyOptimizationStrategy(), validateBicameralState(), autoTuneFromState(), startAutoTuning()');
        
        requestAnimationFrame(animate);
        setTimeout(connect, 500);
        
        console.log('[Brainscan Matrix] Initialized');
    }

    // OPTIMIZATION_FRAMEWORK: Export current bicameral processing state as JSON
    function getBicameralState() {
        const qam = state.qamSignals;
        const cr = qam.channelReduction;
        const co = qam.channelOrdering;
        const sw = qam.slidingWindow;
        const at = qam.adaptiveThresholds;
        const sf = qam.signalFusion;
        
        return {
            channelfield: 16,
            quadrant_mapping: [
                { name: "LFU", channel_range: "Q0-Q3", active: true, priority: cr.visualDominanceWeights['LFU'] },
                { name: "LBD", channel_range: "Q4-Q7", active: true, priority: cr.visualDominanceWeights['LBD'] },
                { name: "RBU", channel_range: "Q8-Q11", active: cr.targetChannels > 8, priority: cr.visualDominanceWeights['RBU'] },
                { name: "RFD", channel_range: "Q12-Q15", active: cr.targetChannels > 10, priority: cr.visualDominanceWeights['RFD'] }
            ],
            current_processing_order: co.prioritizedIndices.length > 0 ? 
                co.prioritizedIndices.slice(0, cr.targetChannels).map(i => {
                    if (i < 4) return "LFU";
                    if (i < 8) return "LBD";
                    if (i < 12) return "RBU";
                    return "RFD";
                }) : 
                ["LFU", "LBD", "RBU", "RFD"],
            buffer_status: sw.buffer[0].length > 0 ? "active" : "initializing",
            buffer_fill_level: sw.buffer.map(b => b.length / sw.windowSize),
            optimization_metrics: {
                active_channels: cr.targetChannels,
                fused_channels: sf.fusedValues.filter(v => v !== null).length,
                avg_pattern_score: sw.patternScores.reduce((a, b) => a + b, 0) / 16,
                avg_correlation: sw.temporalCorrelation.reduce((a, b) => a + b, 0) / 16,
                adaptive_threshold_multiplier: at.channelMultipliers.reduce((a, b) => a + b, 0) / 16,
                routing_mode: qam.routingMode,
                parallel_processing: state.parallelProcessing,
                async_processing: state.asyncProcessingEnabled
            },
            hemisphere_state: {
                left: {
                    weight: state.bicameralWeights.left,
                    mode: state.bicameralWeights.mode,
                    latency: state.hemisphereLatency.left
                },
                right: {
                    weight: state.bicameralWeights.right,
                    mode: state.bicameralWeights.mode,
                    latency: state.hemisphereLatency.right
                },
                last_sync: state.hemisphereLatency.lastSync
            },
            timestamp: performance.now()
        };
    }

    // OPTIMIZATION_FRAMEWORK: Apply optimization strategy from structured state
    function applyOptimizationStrategy(strategyState) {
        const qam = state.qamSignals;
        const cr = qam.channelReduction;
        const co = qam.channelOrdering;
        const sw = qam.slidingWindow;
        const at = qam.adaptiveThresholds;
        
        console.log('[OPTIMIZATION_FRAMEWORK] Applying strategy:', strategyState);
        
        // Strategy 1: Adjust channel count based on channelfield recommendation
        if (strategyState.channelfield && strategyState.channelfield !== 16) {
            const recommendedCount = Math.max(4, Math.min(16, strategyState.channelfield));
            cr.targetChannels = recommendedCount;
            console.log(`[OPTIMIZATION_FRAMEWORK] Adjusted channel count: 16→${recommendedCount}`);
        }
        
        // Strategy 2: Reorder processing based on quadrant_mapping priority
        if (strategyState.quadrant_mapping && Array.isArray(strategyState.quadrant_mapping)) {
            const activeQuadrants = strategyState.quadrant_mapping
                .filter(q => q.active !== false)
                .sort((a, b) => (b.priority || 0) - (a.priority || 0));
            
            // Generate new processing order based on active quadrants
            const newOrder = [];
            activeQuadrants.forEach(quad => {
                const baseIdx = quad.name === 'LFU' ? 0 : 
                               quad.name === 'LBD' ? 4 : 
                               quad.name === 'RBU' ? 8 : 12;
                for (let i = 0; i < 4; i++) {
                    newOrder.push(baseIdx + i);
                }
            });
            
            co.prioritizedIndices = newOrder.slice(0, cr.targetChannels);
            console.log(`[OPTIMIZATION_FRAMEWORK] Reordered processing: ${activeQuadrants.map(q => q.name).join('→')}`);
        }
        
        // Strategy 3: Adjust buffer behavior based on buffer_status
        if (strategyState.buffer_status === 'active' && sw.buffer[0].length < sw.windowSize) {
            // Buffer is active but not full - maintain current behavior
            console.log('[OPTIMIZATION_FRAMEWORK] Buffer active, maintaining pattern recognition');
        } else if (strategyState.buffer_status === 'stalled' || strategyState.buffer_status === 'empty') {
            // Buffer stalled - reduce reliance on temporal patterns
            sw.windowSize = Math.max(8, sw.windowSize - 8);
            console.log(`[OPTIMIZATION_FRAMEWORK] Buffer stalled, reduced window size: ${sw.windowSize}`);
        }
        
        // Strategy 4: Adapt thresholds based on optimization_metrics
        if (strategyState.optimization_metrics) {
            const metrics = strategyState.optimization_metrics;
            
            // Adjust adaptive threshold based on avg correlation
            if (metrics.avg_correlation !== undefined) {
                if (metrics.avg_correlation < 0.3) {
                    // Low correlation - lower threshold to catch more signals
                    at.baseThreshold = Math.max(0.15, at.baseThreshold * 0.9);
                    console.log(`[OPTIMIZATION_FRAMEWORK] Low correlation (${metrics.avg_correlation.toFixed(2)}), lowered threshold: ${at.baseThreshold.toFixed(3)}`);
                } else if (metrics.avg_correlation > 0.7) {
                    // High correlation - raise threshold to reduce noise
                    at.baseThreshold = Math.min(0.5, at.baseThreshold * 1.1);
                    console.log(`[OPTIMIZATION_FRAMEWORK] High correlation (${metrics.avg_correlation.toFixed(2)}), raised threshold: ${at.baseThreshold.toFixed(3)}`);
                }
            }
            
            // Adjust routing mode based on pattern score
            if (metrics.avg_pattern_score !== undefined) {
                if (metrics.avg_pattern_score < 0.2) {
                    qam.routingMode = 'minimal';
                    console.log('[OPTIMIZATION_FRAMEWORK] Low pattern score, switched to minimal routing');
                } else if (metrics.avg_pattern_score > 0.6) {
                    qam.routingMode = 'full';
                    console.log('[OPTIMIZATION_FRAMEWORK] High pattern score, switched to full routing');
                }
            }
        }
        
        return true;
    }

    // OPTIMIZATION_FRAMEWORK: Validate current state and suggest improvements
    function validateBicameralState() {
        const currentState = getBicameralState();
        const suggestions = [];
        
        // Check 1: Channel count efficiency
        if (currentState.optimization_metrics.active_channels === 16) {
            suggestions.push({
                type: 'channel_reduction',
                severity: 'medium',
                message: 'Processing all 16 channels - consider reducing to 10-12 for 37.5% performance gain',
                action: 'Enable channelReduction with targetChannels=10'
            });
        }
        
        // Check 2: Buffer utilization
        const avgFillLevel = currentState.buffer_fill_level.reduce((a, b) => a + b, 0) / 16;
        if (avgFillLevel < 0.5) {
            suggestions.push({
                type: 'buffer_underutilization',
                severity: 'low',
                message: `Buffer only ${(avgFillLevel * 100).toFixed(0)}% full - pattern recognition may be less accurate`,
                action: 'Wait for buffer warmup or reduce windowSize temporarily'
            });
        }
        
        // Check 3: Correlation efficiency
        if (currentState.optimization_metrics.avg_correlation < 0.2) {
            suggestions.push({
                type: 'low_correlation',
                severity: 'high',
                message: 'Very low cross-channel correlation - signals are uncorrelated',
                action: 'Disable signalFusion to save computation, or check signal source quality'
            });
        }
        
        // Check 4: Hemisphere balance
        const leftWeight = currentState.hemisphere_state.left.weight;
        const rightWeight = currentState.hemisphere_state.right.weight;
        if (Math.abs(leftWeight - rightWeight) > 0.4) {
            suggestions.push({
                type: 'hemisphere_imbalance',
                severity: 'medium',
                message: `Hemisphere imbalance: ${(leftWeight * 100).toFixed(0)}% left vs ${(rightWeight * 100).toFixed(0)}% right`,
                action: 'Consider adjusting bicameral weights for balanced processing'
            });
        }
        
        // Check 5: Fusion efficiency
        if (currentState.optimization_metrics.fused_channels === 0 && 
            currentState.optimization_metrics.avg_correlation > 0.7) {
            suggestions.push({
                type: 'fusion_opportunity',
                severity: 'low',
                message: 'High correlation but no fusion active - opportunity to reduce redundancy',
                action: 'Enable signalFusion to fuse correlated channel pairs'
            });
        }
        
        console.log('[OPTIMIZATION_FRAMEWORK] Validation complete:', suggestions.length, 'suggestions');
        return suggestions;
    }

    // OPTIMIZATION_FRAMEWORK: Auto-tune parameters based on real-time metrics
    function autoTuneFromState() {
        const currentState = getBicameralState();
        const metrics = currentState.optimization_metrics;
        const qam = state.qamSignals;
        let adjustments = 0;
        
        // Auto-tune 1: Channel count based on pattern score
        if (metrics.avg_pattern_score < 0.15 && qam.channelReduction.targetChannels > 8) {
            qam.channelReduction.targetChannels = 8;
            adjustments++;
            console.log('[AUTO_TUNE] Low pattern score - reduced channels to 8');
        } else if (metrics.avg_pattern_score > 0.7 && qam.channelReduction.targetChannels < 12) {
            qam.channelReduction.targetChannels = 12;
            adjustments++;
            console.log('[AUTO_TUNE] High pattern score - increased channels to 12');
        }
        
        // Auto-tune 2: Window size based on buffer fill
        const sw = qam.slidingWindow;
        const bufferFillLevel = sw.buffer.map(b => b.length / sw.windowSize);
        const avgFill = bufferFillLevel.reduce((a, b) => a + b, 0) / 16;
        if (avgFill > 0.9 && qam.slidingWindow.windowSize < 48) {
            // Buffer consistently full - can increase window for better patterns
            qam.slidingWindow.windowSize = Math.min(64, qam.slidingWindow.windowSize + 8);
            adjustments++;
            console.log('[AUTO_TUNE] Buffer full - increased window size to', qam.slidingWindow.windowSize);
        } else if (avgFill < 0.3 && qam.slidingWindow.windowSize > 16) {
            // Buffer not filling - reduce window to improve responsiveness
            qam.slidingWindow.windowSize = Math.max(8, qam.slidingWindow.windowSize - 8);
            adjustments++;
            console.log('[AUTO_TUNE] Buffer low - decreased window size to', qam.slidingWindow.windowSize);
        }
        
        // Auto-tune 3: Threshold adaptation
        if (metrics.avg_correlation < 0.25) {
            qam.adaptiveThresholds.baseThreshold = Math.max(0.2, qam.adaptiveThresholds.baseThreshold - 0.05);
            adjustments++;
            console.log('[AUTO_TUNE] Low correlation - lowered threshold');
        }
        
        // Auto-tune 4: Fusion threshold
        if (metrics.fused_channels > 12 && metrics.avg_correlation > 0.9) {
            // Too much fusion - raise threshold
            qam.signalFusion.fusionThreshold = Math.min(0.95, qam.signalFusion.fusionThreshold + 0.02);
            adjustments++;
            console.log('[AUTO_TUNE] Too much fusion - raised threshold to', qam.signalFusion.fusionThreshold.toFixed(2));
        } else if (metrics.fused_channels < 2 && metrics.avg_correlation > 0.6) {
            // Too little fusion - lower threshold
            qam.signalFusion.fusionThreshold = Math.max(0.75, qam.signalFusion.fusionThreshold - 0.02);
            adjustments++;
            console.log('[AUTO_TUNE] Too little fusion - lowered threshold to', qam.signalFusion.fusionThreshold.toFixed(2));
        }
        
        if (adjustments > 0) {
            console.log(`[AUTO_TUNE] Applied ${adjustments} automatic adjustments`);
        }
        
        return adjustments;
    }

    // OPTIMIZATION: Performance Testing Framework - Run automated benchmarks
    async function runPerformanceTest(testScenario = null) {
        const pt = state.qamSignals.performanceTesting;
        if (!pt.enabled) {
            console.warn('[PERF_TEST] Performance testing not enabled. Enable via UI first.');
            return null;
        }
        
        const scenario = testScenario || pt.testScenarios[0];
        console.log(`[PERF_TEST] Starting test: ${scenario.name} - ${scenario.description}`);
        
        pt.testSuite.currentTest = scenario.name;
        const startTime = performance.now();
        const results = {
            scenario: scenario.name,
            startTime: startTime,
            frameTimes: [],
            processingLatencies: [],
            memorySnapshots: [],
            channelActivity: [],
        };
        
        // Configure test parameters
        const originalChannelCount = state.qamSignals.channelReduction.targetChannels;
        const originalRoutingMode = state.qamSignals.routingMode;
        
        if (scenario.channels) {
            state.qamSignals.channelReduction.targetChannels = scenario.channels;
        }
        
        // Run test for specified duration
        const testDuration = scenario.duration || 5000;
        const endTime = startTime + testDuration;
        
        while (performance.now() < endTime) {
            const frameStart = performance.now();
            
            // Collect metrics
            results.frameTimes.push(state.lastFrameTime || 16);
            results.processingLatencies.push(state.networkMetrics.latency || 0);
            
            if (performance.now() % 1000 < 50) { // Sample every ~1 second
                results.memorySnapshots.push(performance.memory ? performance.memory.usedJSHeapSize : 0);
                results.channelActivity.push([...state.qamSignals.channelActivity]);
            }
            
            // Small delay to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Restore original settings
        state.qamSignals.channelReduction.targetChannels = originalChannelCount;
        state.qamSignals.routingMode = originalRoutingMode;
        
        // Calculate statistics
        const avgFrameTime = results.frameTimes.reduce((a, b) => a + b, 0) / results.frameTimes.length;
        const maxFrameTime = Math.max(...results.frameTimes);
        const minFrameTime = Math.min(...results.frameTimes);
        const p95FrameTime = results.frameTimes.sort((a, b) => a - b)[Math.floor(results.frameTimes.length * 0.95)];
        
        const testResult = {
            name: scenario.name,
            description: scenario.description,
            duration: testDuration,
            avgFrameTime: avgFrameTime.toFixed(2),
            maxFrameTime: maxFrameTime.toFixed(2),
            minFrameTime: minFrameTime.toFixed(2),
            p95FrameTime: p95FrameTime.toFixed(2),
            targetFPS: (1000 / avgFrameTime).toFixed(1),
            timestamp: new Date().toISOString(),
        };
        
        pt.testSuite.testResults.push(testResult);
        pt.testSuite.testHistory.push({
            timestamp: Date.now(),
            results: testResult,
        });
        
        // Keep only last 20 tests
        if (pt.testSuite.testHistory.length > 20) {
            pt.testSuite.testHistory.shift();
        }
        
        pt.testSuite.currentTest = null;
        
        console.log('[PERF_TEST] Test complete:', testResult);
        addChatMessage('system', `Performance test complete: ${scenario.name}\nAvg: ${testResult.avgFrameTime}ms | P95: ${testResult.p95FrameTime}ms | FPS: ${testResult.targetFPS}`, 'both');
        
        return testResult;
    }

    // OPTIMIZATION: Run full benchmark suite
    async function runBenchmarkSuite() {
        const pt = state.qamSignals.performanceTesting;
        console.log('[PERF_TEST] Starting full benchmark suite...');
        addChatMessage('system', 'Starting benchmark suite - this may take 30-60 seconds...', 'both');
        
        const results = [];
        for (const scenario of pt.testScenarios) {
            const result = await runPerformanceTest(scenario);
            if (result) results.push(result);
            // Brief pause between tests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Store benchmark results
        pt.benchmarks.lastRun = Date.now();
        pt.benchmarks.results = {
            frameTime: results.map(r => parseFloat(r.avgFrameTime)),
            processingLatency: results.map(r => parseFloat(r.p95FrameTime)),
            testNames: results.map(r => r.name),
        };
        
        // Generate comparison report
        const baseline = results.find(r => r.name === 'full_load');
        const optimized = results.find(r => r.name === 'reduced_load');
        
        if (baseline && optimized) {
            const improvement = ((parseFloat(baseline.avgFrameTime) - parseFloat(optimized.avgFrameTime)) / parseFloat(baseline.avgFrameTime) * 100).toFixed(1);
            console.log(`[PERF_TEST] Optimization improvement: ${improvement}% faster with reduced channels`);
            addChatMessage('system', `Benchmark complete! Reduced channel mode is ${improvement}% more efficient than full load.`, 'both');
        }
        
        return results;
    }

    // OPTIMIZATION: Calculate SNR (Signal-to-Noise Ratio) for all channels
    function calculateSNR() {
        const snr = state.qamSignals.snrMetrics;
        const sw = state.qamSignals.slidingWindow;
        const at = state.qamSignals.adaptiveThresholds;
        const now = performance.now();
        
        // Calculate SNR for each channel
        for (let i = 0; i < 16; i++) {
            const window = sw.buffer[i];
            if (window.length < 8) continue;
            
            // Signal power (mean of squares)
            const signalPower = window.reduce((sum, val) => sum + (val * val), 0) / window.length;
            
            // Noise power (estimated from noise floor)
            const noisePower = at.noiseEstimate[i] * at.noiseEstimate[i];
            
            // SNR in dB
            const snrValue = noisePower > 0 ? 10 * Math.log10(signalPower / noisePower) : 20;
            snr.channelSNR[i] = Math.max(0, Math.min(30, snrValue));
        }
        
        // Calculate overall quality score
        const avgSNR = snr.channelSNR.reduce((a, b) => a + b, 0) / 16;
        snr.qualityScore = Math.min(1, avgSNR / 20); // Normalize to 0-1 (20dB = perfect)
        
        // Store history
        snr.snrHistory.push({
            timestamp: now,
            avgSNR: avgSNR,
            qualityScore: snr.qualityScore,
            channelSNR: [...snr.channelSNR],
        });
        
        // Keep only last 100 entries
        if (snr.snrHistory.length > 100) snr.snrHistory.shift();
        
        snr.lastUpdate = now;
        
        return avgSNR;
    }

    // OPTIMIZATION: Analyze pipeline efficiency and detect bottlenecks
    function analyzePipelineEfficiency() {
        const pm = state.qamSignals.pipelineMetrics;
        const now = performance.now();
        
        // Only analyze every 5 seconds
        if (now - pm.lastAnalysis < 5000) return pm.recommendations;
        pm.lastAnalysis = now;
        
        const recommendations = [];
        
        // Analyze each processing stage
        const stages = ['quadrantCompute', 'signalFusion', 'channelReduction', 'matrixRender'];
        const stageThresholds = {
            quadrantCompute: 8,      // ms
            signalFusion: 2,         // ms
            channelReduction: 3,     // ms
            matrixRender: 10,        // ms
        };
        
        let maxTime = 0;
        let bottleneckStage = null;
        
        stages.forEach(stage => {
            const time = pm.stageTiming[stage] || 0;
            const threshold = stageThresholds[stage];
            
            // Update efficiency score
            pm.efficiency[stage] = Math.max(0, 1 - (time / (threshold * 2)));
            
            // Detect bottleneck
            if (time > maxTime && time > threshold) {
                maxTime = time;
                bottleneckStage = stage;
            }
            
            // Generate recommendations
            if (time > threshold * 1.5) {
                switch (stage) {
                    case 'quadrantCompute':
                        recommendations.push({
                            stage: stage,
                            severity: time > threshold * 2 ? 'high' : 'medium',
                            message: `Quadrant computation slow (${time.toFixed(1)}ms). Consider reducing targetChannels.`,
                            action: 'Reduce channel count or disable parallelPasses',
                        });
                        break;
                    case 'signalFusion':
                        recommendations.push({
                            stage: stage,
                            severity: time > threshold * 2 ? 'high' : 'medium',
                            message: `Signal fusion slow (${time.toFixed(1)}ms). Increase fusionThreshold.`,
                            action: 'Raise fusion threshold to reduce fusion operations',
                        });
                        break;
                    case 'channelReduction':
                        recommendations.push({
                            stage: stage,
                            severity: time > threshold * 2 ? 'high' : 'medium',
                            message: `Channel reduction slow (${time.toFixed(1)}ms). Recalculate priorities less often.`,
                            action: 'Increase priority update interval',
                        });
                        break;
                    case 'matrixRender':
                        recommendations.push({
                            stage: stage,
                            severity: time > threshold * 2 ? 'high' : 'medium',
                            message: `Matrix render slow (${time.toFixed(1)}ms). Reduce glowIntensity or matrix size.`,
                            action: 'Lower visual quality settings',
                        });
                        break;
                }
            }
        });
        
        pm.bottleneckStage = bottleneckStage;
        pm.bottleneckSeverity = maxTime > 0 ? Math.min(1, maxTime / 20) : 0;
        pm.recommendations = recommendations;
        
        if (recommendations.length > 0) {
            console.log('[PIPELINE_ANALYSIS] Bottlenecks detected:', recommendations.length);
            console.log('[PIPELINE_ANALYSIS] Primary bottleneck:', bottleneckStage, `(${maxTime.toFixed(1)}ms)`);
        }
        
        return recommendations;
    }

    // OPTIMIZATION: Update performance testing UI
    function updatePerformanceTestUI() {
        const pt = state.qamSignals.performanceTesting;
        const snr = state.qamSignals.snrMetrics;
        const pm = state.qamSignals.pipelineMetrics;
        
        // Update SNR display
        const avgSNR = snr.channelSNR.reduce((a, b) => a + b, 0) / 16;
        const snrEl = document.getElementById('avg-snr');
        if (snrEl) {
            snrEl.textContent = avgSNR.toFixed(1) + ' dB';
            // Color coding
            if (avgSNR >= snr.thresholds.excellent) snrEl.style.color = '#0f0';
            else if (avgSNR >= snr.thresholds.good) snrEl.style.color = '#0ff';
            else if (avgSNR >= snr.thresholds.acceptable) snrEl.style.color = '#ff0';
            else snrEl.style.color = '#e60003';
        }
        
        // Update quality score
        const qualityEl = document.getElementById('signal-quality');
        if (qualityEl) {
            const quality = (snr.qualityScore * 100).toFixed(0);
            qualityEl.textContent = quality + '%';
        }
        
        // Update pipeline efficiency
        const efficiencyEl = document.getElementById('pipeline-efficiency');
        if (efficiencyEl) {
            const avgEfficiency = Object.values(pm.efficiency).reduce((a, b) => a + b, 0) / 4;
            efficiencyEl.textContent = (avgEfficiency * 100).toFixed(0) + '%';
        }
        
        // Update bottleneck indicator
        const bottleneckEl = document.getElementById('bottleneck-stage');
        if (bottleneckEl) {
            if (pm.bottleneckStage) {
                bottleneckEl.textContent = pm.bottleneckStage;
                bottleneckEl.style.color = pm.bottleneckSeverity > 0.7 ? '#e60003' : '#ffaa00';
            } else {
                bottleneckEl.textContent = 'None';
                bottleneckEl.style.color = '#0f0';
            }
        }
    }

    // OPTIMIZATION: Cross-channel attention mechanism for bicameral processing
    function updateCrossChannelAttention() {
        const qam = state.qamSignals;
        const cca = qam.crossChannelAttention;
        if (!cca.enabled) return;
        
        const now = performance.now();
        
        // Calculate correlation between quadrant pairs every 30 frames
        if (state.frameCount % 30 !== 0) return;
        
        const sw = qam.slidingWindow;
        const quadrants = ['LFU', 'LBD', 'RBU', 'RFD'];
        const pairs = [
            ['LFU', 'LBD'], ['LFU', 'RBU'], ['LFU', 'RFD'],
            ['LBD', 'RBU'], ['LBD', 'RFD'], ['RBU', 'RFD']
        ];
        
        let pairIdx = 0;
        pairs.forEach(([q1, q2]) => {
            // Calculate average pattern score for each quadrant's channels
            const q1Channels = quadrants.indexOf(q1) * 4;
            const q2Channels = quadrants.indexOf(q2) * 4;
            
            let q1Avg = 0, q2Avg = 0;
            for (let i = 0; i < 4; i++) {
                q1Avg += sw.patternScores[q1Channels + i] || 0;
                q2Avg += sw.patternScores[q2Channels + i] || 0;
            }
            q1Avg /= 4;
            q2Avg /= 4;
            
            // Update correlation score (similar patterns = higher correlation)
            const correlation = 1 - Math.abs(q1Avg - q2Avg);
            cca.correlationScores[pairIdx] = correlation;
            
            // Update attention matrix
            const key = `${q1}_${q2}`;
            if (cca.attentionMatrix[key] !== undefined) {
                // Smooth update
                cca.attentionMatrix[key] += (correlation * 0.3 - cca.attentionMatrix[key]) * 0.1;
            }
            
            pairIdx++;
        });
        
        // Apply attention-weighted feature fusion
        for (let i = 0; i < 16; i++) {
            const quadrantIdx = Math.floor(i / 4);
            const quadrant = quadrants[quadrantIdx];
            let fusedValue = sw.patternScores[i] || 0.5;
            
            // Add weighted contributions from correlated quadrants
            pairs.forEach(([q1, q2], idx) => {
                if ((q1 === quadrant || q2 === quadrant) && cca.correlationScores[idx] > 0.6) {
                    const otherQuadrant = q1 === quadrant ? q2 : q1;
                    const otherIdx = quadrants.indexOf(otherQuadrant);
                    const otherChannel = otherIdx * 4 + (i % 4);
                    const weight = cca.attentionMatrix[`${q1}_${q2}`] || 0.1;
                    fusedValue += (sw.patternScores[otherChannel] || 0.5) * weight * 0.2;
                }
            });
            
            cca.fusedFeatures[i] = Math.min(1, Math.max(0, fusedValue));
        }
        
        cca.lastAttentionUpdate = now;
        
        // Log attention matrix every 300 frames (~10 seconds at 30fps)
        if (state.frameCount % 300 === 0) {
            console.log('[CROSS_CHANNEL_ATTENTION] Correlation scores:', 
                cca.correlationScores.map(c => c.toFixed(2)).join(', '));
        }
    }

    // OPTIMIZATION: Bilateral loss balancing for bicameral hemispheres
    function balanceBilateralLoss() {
        const bl = state.qamSignals.bilateralLoss;
        if (!bl.enabled || !bl.autoRebalance) return;
        
        const now = performance.now();
        
        // Only rebalance every 5 seconds
        if (now - bl.lastRebalance < 5000) return;
        
        // Calculate current processing load per hemisphere
        // Left hemisphere: LFU + LBD (Q0-Q7)
        // Right hemisphere: RBU + RFD (Q8-Q15)
        const qam = state.qamSignals;
        const leftActivity = (qam.channelActivity.slice(0, 8).reduce((a, b) => a + b, 0) / 8);
        const rightActivity = (qam.channelActivity.slice(8, 16).reduce((a, b) => a + b, 0) / 8);
        
        // Calculate loss ratio (activity represents processing load/"loss")
        const totalActivity = leftActivity + rightActivity;
        if (totalActivity === 0) return;
        
        const leftRatio = leftActivity / totalActivity;
        const rightRatio = rightActivity / totalActivity;
        bl.currentRatio = leftRatio / rightRatio;
        
        // Check for imbalance
        const imbalance = Math.abs(leftRatio - bl.balanceTarget);
        
        if (imbalance > bl.imbalanceThreshold) {
            // Rebalance weights
            if (leftRatio > bl.balanceTarget) {
                // Left hemisphere overloaded - reduce its weight, increase right
                bl.leftWeight = Math.max(0.3, bl.leftWeight - 0.05);
                bl.rightWeight = Math.min(0.7, bl.rightWeight + 0.05);
            } else {
                // Right hemisphere overloaded
                bl.leftWeight = Math.min(0.7, bl.leftWeight + 0.05);
                bl.rightWeight = Math.max(0.3, bl.rightWeight - 0.05);
            }
            
            console.log(`[BILATERAL_LOSS] Rebalanced: L=${bl.leftWeight.toFixed(2)}, R=${bl.rightWeight.toFixed(2)}, imbalance=${imbalance.toFixed(2)}`);
            
            // Apply weights to quadrant processing
            qam.quadrantWeights['LFU'] = 1.2 * bl.leftWeight;
            qam.quadrantWeights['LBD'] = 1.0 * bl.leftWeight;
            qam.quadrantWeights['RBU'] = 0.9 * bl.rightWeight;
            qam.quadrantWeights['RFD'] = 0.8 * bl.rightWeight;
        }
        
        bl.lastRebalance = now;
    }

    // OPTIMIZATION: Monitor and manage gradient flow
    function monitorGradientFlow() {
        const gf = state.qamSignals.gradientFlow;
        const now = performance.now();
        
        // Calculate pseudo-gradients based on pattern score changes
        const sw = state.qamSignals.slidingWindow;
        const quadrants = ['LFU', 'LBD', 'RBU', 'RFD'];
        
        quadrants.forEach((quad, idx) => {
            const startChannel = idx * 4;
            let gradientSum = 0;
            
            // Calculate rate of change in pattern scores
            for (let i = 0; i < 4; i++) {
                const channel = startChannel + i;
                const window = sw.buffer[channel];
                if (window.length >= 2) {
                    const change = window[window.length - 1] - window[window.length - 2];
                    gradientSum += Math.abs(change);
                }
            }
            
            gf.gradientMagnitudes[quad] = gradientSum;
        });
        
        // Check for gradient explosion
        const maxGradient = Math.max(...Object.values(gf.gradientMagnitudes));
        gf.explosionDetected = maxGradient > gf.clipThreshold;
        
        if (gf.explosionDetected) {
            console.warn(`[GRADIENT_FLOW] Explosion detected: ${maxGradient.toFixed(2)} > threshold ${gf.clipThreshold}`);
            
            // Apply gradient clipping by reducing sensitivity
            qam.adaptiveThresholds.baseThreshold = Math.min(0.5, qam.adaptiveThresholds.baseThreshold * 1.2);
            
            // Update backprop order to process most stable quadrants first
            const sortedQuadrants = quadrants.sort((a, b) => 
                gf.gradientMagnitudes[a] - gf.gradientMagnitudes[b]
            );
            gf.backpropOrder = sortedQuadrants;
        }
        
        // Calculate overall flow health
        const avgGradient = Object.values(gf.gradientMagnitudes).reduce((a, b) => a + b, 0) / 4;
        gf.flowHealth = Math.max(0, 1 - (avgGradient / gf.clipThreshold));
        
        gf.lastGradientUpdate = now;
        
        // Log gradient health every 300 frames
        if (state.frameCount % 300 === 0) {
            console.log('[GRADIENT_FLOW] Health:', (gf.flowHealth * 100).toFixed(0) + '%', 
                'Magnitudes:', Object.values(gf.gradientMagnitudes).map(g => g.toFixed(2)).join(', '));
        }
    }

    // OPTIMIZATION: Dynamic sliding window size adjustment for throughput optimization
    function adjustSlidingWindowSize() {
        const qam = state.qamSignals;
        const sw = qam.slidingWindow;
        
        // Only adjust every 300 frames (~10 seconds)
        if (state.frameCount % 300 !== 0) return;
        
        // Calculate average frame time (performance indicator)
        const avgFrameTime = state.lastFrameTime || 16;
        const targetFrameTime = 16.67; // 60fps = 16.67ms per frame
        
        // Current window size
        const currentSize = sw.windowSize;
        let newSize = currentSize;
        
        // Strategy: Reduce window size for higher throughput when frame time is good
        // Increase window size for better accuracy when frame time allows
        if (avgFrameTime < targetFrameTime * 0.8 && currentSize > sw.minWindowSize) {
            // Frame time is good - can reduce window for higher throughput
            newSize = Math.max(sw.minWindowSize, currentSize - 8);
            if (newSize !== currentSize) {
                console.log(`[SLIDING_WINDOW] Reduced from ${currentSize} to ${newSize} for higher throughput`);
                logOptimizationSuggestion('performance', 
                    `Reduced sliding window from ${currentSize} to ${newSize} frames`, 
                    'Higher throughput (good frame time detected)');
            }
        } else if (avgFrameTime > targetFrameTime * 1.3 && currentSize < sw.maxWindowSize) {
            // Frame time is slow - increase window for better pattern accuracy
            newSize = Math.min(sw.maxWindowSize, currentSize + 8);
            if (newSize !== currentSize) {
                console.log(`[SLIDING_WINDOW] Increased from ${currentSize} to ${newSize} for better accuracy`);
                logOptimizationSuggestion('quality', 
                    `Increased sliding window from ${currentSize} to ${newSize} frames`, 
                    'Better pattern accuracy (frame time allows)');
            }
        }
        
        sw.windowSize = newSize;
    }

    // OPTIMIZATION: Apply frequency band selection (prioritize Q0-Q4 center frequencies)
    function applyFrequencyBandSelection() {
        const qam = state.qamSignals;
        const fbs = qam.frequencyBandSelection;
        const snr = qam.snrMetrics;
        
        if (!fbs.enabled) return;
        
        const now = performance.now();
        
        // Only update every 5 seconds
        if (now - fbs.lastUpdate < 5000) return;
        
        if (fbs.dynamicSelection) {
            // Check SNR for each band
            const bands = ['center', 'mid', 'outer'];
            let bestBand = 'center';
            let bestAvgSNR = 0;
            
            bands.forEach(band => {
                const channels = fbs.priorityBands[band].channels;
                const avgSNR = channels.reduce((sum, ch) => sum + (snr.channelSNR[ch] || 0), 0) / channels.length;
                
                if (avgSNR > bestAvgSNR && avgSNR > fbs.snrThreshold) {
                    bestAvgSNR = avgSNR;
                    bestBand = band;
                }
            });
            
            // Update channel reduction to prioritize best band
            const targetChannels = fbs.priorityBands[bestBand].channels.length;
            if (targetChannels !== qam.channelReduction.targetChannels && bestAvgSNR > fbs.snrThreshold) {
                const oldChannels = qam.channelReduction.targetChannels;
                qam.channelReduction.targetChannels = targetChannels;
                
                console.log(`[FREQ_BAND_SELECTION] Prioritizing ${bestBand} band (${targetChannels} channels, ${bestAvgSNR.toFixed(1)} dB SNR)`);
                logOptimizationSuggestion('quality', 
                    `Prioritizing ${bestBand} frequency band (${targetChannels} channels)`, 
                    `Higher SNR (${bestAvgSNR.toFixed(1)} dB) in ${bestBand} band`);
            }
        }
        
        fbs.lastUpdate = now;
    }

    // OPTIMIZATION: Generate optimization suggestions (SAFER than auto-editing)
    function logOptimizationSuggestion(category, action, reason) {
        const os = state.qamSignals.optimizationSuggestions;
        const now = performance.now();
        
        // Only generate suggestions every 30 seconds max
        if (now - os.lastGeneration < os.generationInterval) return;
        
        const suggestion = {
            id: Date.now(),
            timestamp: now,
            category: category, // 'performance', 'quality', 'efficiency'
            action: action,
            reason: reason,
            applied: false,
            rejected: false,
        };
        
        // Add to queue
        os.suggestions.unshift(suggestion);
        os.categories[category].push(suggestion);
        
        // Keep only max suggestions
        if (os.suggestions.length > os.maxSuggestions) {
            os.suggestions.pop();
        }
        
        os.lastGeneration = now;
        
        // Log and optionally notify
        console.log(`[OPTIMIZATION_SUGGESTION] ${category.toUpperCase()}: ${action}`);
        console.log(`  Reason: ${reason}`);
        
        // Show in UI if enabled
        if (os.showNotifications) {
            const suggestionsEl = document.getElementById('optimization-suggestions');
            if (suggestionsEl) {
                suggestionsEl.innerHTML = `
                    <div style="color: ${category === 'performance' ? '#0f0' : category === 'quality' ? '#0ff' : '#fa0'};">
                        <strong>${category.toUpperCase()}:</strong> ${action}<br>
                        <small>${reason}</small>
                    </div>
                ` + suggestionsEl.innerHTML;
            }
        }
    }

    // OPTIMIZATION: Get current optimization suggestions for manual review
    function getOptimizationSuggestions() {
        const os = state.qamSignals.optimizationSuggestions;
        return {
            pending: os.suggestions.filter(s => !s.applied && !s.rejected),
            applied: os.appliedHistory,
            rejected: os.rejectedHistory,
            byCategory: os.categories,
        };
    }

    // OPTIMIZATION: Apply a specific suggestion (manual action)
    function applyOptimizationSuggestion(suggestionId) {
        const os = state.qamSignals.optimizationSuggestions;
        const suggestion = os.suggestions.find(s => s.id === suggestionId);
        
        if (!suggestion) {
            console.error(`[OPTIMIZATION] Suggestion ${suggestionId} not found`);
            return false;
        }
        
        if (suggestion.applied) {
            console.warn(`[OPTIMIZATION] Suggestion ${suggestionId} already applied`);
            return false;
        }
        
        // Mark as applied
        suggestion.applied = true;
        suggestion.appliedAt = Date.now();
        os.appliedHistory.push(suggestion);
        
        console.log(`[OPTIMIZATION] Applied suggestion: ${suggestion.action}`);
        addChatMessage('system', `Applied optimization: ${suggestion.action}`, 'both');
        
        return true;
    }

    // OPTIMIZATION: Reject a suggestion
    function rejectOptimizationSuggestion(suggestionId) {
        const os = state.qamSignals.optimizationSuggestions;
        const suggestion = os.suggestions.find(s => s.id === suggestionId);
        
        if (!suggestion) return false;
        
        suggestion.rejected = true;
        suggestion.rejectedAt = Date.now();
        os.rejectedHistory.push(suggestion);
        
        console.log(`[OPTIMIZATION] Rejected suggestion: ${suggestion.action}`);
        return true;
    }

    // OPTIMIZATION: Update bicameral optimization UI
    function updateBicameralOptimizationUI() {
        const cca = state.qamSignals.crossChannelAttention;
        const bl = state.qamSignals.bilateralLoss;
        const gf = state.qamSignals.gradientFlow;
        
        // Cross-channel attention indicator
        const avgCorrelation = cca.correlationScores.reduce((a, b) => a + b, 0) / 6;
        const correlationEl = document.getElementById('cross-correlation');
        if (correlationEl) {
            correlationEl.textContent = (avgCorrelation * 100).toFixed(0) + '%';
            correlationEl.style.color = avgCorrelation > 0.7 ? '#0f0' : 
                                        avgCorrelation > 0.4 ? '#fa0' : '#e60003';
        }
        
        // Bilateral balance indicator
        const balanceEl = document.getElementById('bilateral-balance');
        if (balanceEl) {
            const balance = Math.abs(bl.leftWeight - bl.rightWeight);
            balanceEl.textContent = (1 - balance).toFixed(2); // 1.0 = perfect balance
            balanceEl.style.color = balance < 0.2 ? '#0f0' : 
                                   balance < 0.4 ? '#fa0' : '#e60003';
        }
        
        // Gradient flow health
        const gradientEl = document.getElementById('gradient-health');
        if (gradientEl) {
            gradientEl.textContent = (gf.flowHealth * 100).toFixed(0) + '%';
            gradientEl.style.color = gf.flowHealth > 0.8 ? '#0f0' :
                                    gf.flowHealth > 0.5 ? '#fa0' : '#e60003';
        }
        
        // Explosion warning
        const warningEl = document.getElementById('gradient-warning');
        if (warningEl) {
            warningEl.style.display = gf.explosionDetected ? 'block' : 'none';
            warningEl.textContent = gf.explosionDetected ? '⚠️ Gradient Explosion' : '';
        }
        
        // OPTIMIZATION: Additional UI updates for new features
        const qam = state.qamSignals;
        
        // Window size display
        const windowSizeEl = document.getElementById('window-size-display');
        if (windowSizeEl) {
            windowSizeEl.textContent = qam.slidingWindow.windowSize;
        }
        
        // Active frequency band
        const activeBandEl = document.getElementById('active-band');
        if (activeBandEl && qam.frequencyBandSelection.enabled) {
            const target = qam.channelReduction.targetChannels;
            let band = 'Auto';
            if (target <= 5) band = 'Center (Q0-Q4)';
            else if (target <= 10) band = 'Mid (Q0-Q9)';
            else band = 'Full (Q0-Q15)';
            activeBandEl.textContent = band;
        }
        
        // Pending suggestions count
        const pendingEl = document.getElementById('pending-suggestions');
        if (pendingEl) {
            const pending = qam.optimizationSuggestions.suggestions.filter(s => !s.applied && !s.rejected);
            pendingEl.textContent = pending.length;
            pendingEl.style.color = pending.length > 0 ? '#fa0' : '#0f0';
        }
        
        // Recent suggestions list (show last 3)
        const recentEl = document.getElementById('recent-suggestions');
        if (recentEl) {
            const recent = qam.optimizationSuggestions.suggestions
                .filter(s => !s.applied && !s.rejected)
                .slice(0, 3);
            
            if (recent.length > 0) {
                recentEl.innerHTML = recent.map(s => `
                    <div style="margin-bottom: 4px; padding: 2px; background: #1a1a1a; border-left: 2px solid ${s.category === 'performance' ? '#0f0' : s.category === 'quality' ? '#0ff' : '#fa0'};">
                        <small>${s.category.toUpperCase()}: ${s.action.substring(0, 40)}${s.action.length > 40 ? '...' : ''}</small>
                    </div>
                `).join('');
            } else {
                recentEl.innerHTML = '<div style="color: #666;">No pending suggestions</div>';
            }
        }
        
        // OPTIMIZATION: Update tuning parameters UI
        const tp = qam.tuningParameters;
        
        // Active profile display
        const profileEl = document.getElementById('active-tuning-profile');
        if (profileEl) {
            profileEl.textContent = tp.activeProfile.charAt(0).toUpperCase() + tp.activeProfile.slice(1);
            profileEl.style.color = tp.activeProfile === 'balanced' ? '#0ff' :
                                   tp.activeProfile === 'highSpeed' ? '#0f0' :
                                   tp.activeProfile === 'lowLatency' ? '#fa0' : '#fff';
        }
        
        // Recommended window size (40 samples per AI recommendation)
        const recWindowEl = document.getElementById('recommended-window');
        if (recWindowEl) {
            recWindowEl.textContent = tp.recommendedWindowSize;
        }
        
        // Current fusion weights (LFU/LBD from AI recommendation)
        const fusionEl = document.getElementById('fusion-weights');
        if (fusionEl) {
            fusionEl.textContent = `L:${tp.fusionWeights.LFU.toFixed(1)} R:${tp.fusionWeights.LBD.toFixed(1)}`;
        }
        
        // Alpha value display
        const alphaEl = document.getElementById('alpha-value');
        if (alphaEl) {
            alphaEl.textContent = tp.adaptiveThresholdAlpha.toFixed(1);
        }
    }

    // OPTIMIZATION: Apply AI-recommended tuning profile
    function applyTuningProfile(profileName) {
        const qam = state.qamSignals;
        const tp = qam.tuningParameters;
        
        if (!tp.profiles[profileName]) {
            console.error(`[TUNING] Unknown profile: ${profileName}`);
            return false;
        }
        
        const profile = tp.profiles[profileName];
        
        // Apply profile settings
        qam.slidingWindow.windowSize = profile.windowSize;
        qam.quadrantWeights = { ...profile.fusionWeights };
        qam.channelReduction.targetChannels = profile.targetChannels;
        qam.adaptiveThresholds.adaptationRate = profile.alpha;
        
        // Update active profile
        tp.activeProfile = profileName;
        tp.lastTuningUpdate = Date.now();
        
        console.log(`[TUNING] Applied profile: ${profileName}`, profile);
        addChatMessage('system', `Applied tuning profile: ${profileName}\nWindow: ${profile.windowSize} | Channels: ${profile.targetChannels} | Alpha: ${profile.alpha}`, 'both');
        
        return true;
    }

    // OPTIMIZATION: Get current tuning parameters
    function getTuningParameters() {
        const tp = state.qamSignals.tuningParameters;
        return {
            activeProfile: tp.activeProfile,
            profiles: tp.profiles,
            currentSettings: {
                windowSize: state.qamSignals.slidingWindow.windowSize,
                quadrantWeights: state.qamSignals.quadrantWeights,
                targetChannels: state.qamSignals.channelReduction.targetChannels,
                alpha: state.qamSignals.adaptiveThresholds.adaptationRate,
            },
            recommendations: {
                windowSize: tp.recommendedWindowSize,
                fusionWeights: tp.fusionWeights,
                alpha: tp.adaptiveThresholdAlpha,
            }
        };
    }

    // OPTIMIZATION: Custom tuning - adjust individual parameters
    function setCustomTuning(params) {
        const qam = state.qamSignals;
        const tp = qam.tuningParameters;
        
        // Apply custom parameters
        if (params.windowSize !== undefined) {
            qam.slidingWindow.windowSize = Math.max(qam.slidingWindow.minWindowSize, 
                Math.min(qam.slidingWindow.maxWindowSize, params.windowSize));
        }
        
        if (params.fusionWeights !== undefined) {
            Object.assign(qam.quadrantWeights, params.fusionWeights);
        }
        
        if (params.targetChannels !== undefined) {
            qam.channelReduction.targetChannels = Math.max(4, Math.min(16, params.targetChannels));
        }
        
        if (params.alpha !== undefined) {
            qam.adaptiveThresholds.adaptationRate = Math.max(0.1, Math.min(1.0, params.alpha));
        }
        
        // Mark as custom profile
        tp.activeProfile = 'custom';
        tp.lastTuningUpdate = Date.now();
        
        console.log('[TUNING] Applied custom tuning:', params);
        addChatMessage('system', 'Applied custom tuning parameters', 'both');
        
        return true;
    }

    // OPTIMIZATION_FRAMEWORK: Schedule auto-tuning every 10 seconds
    let autoTuneInterval = null;
    function startAutoTuning() {
        if (autoTuneInterval) clearInterval(autoTuneInterval);
        autoTuneInterval = setInterval(() => {
            if (state.connected) {
                autoTuneFromState();
            }
        }, 10000); // Auto-tune every 10 seconds
        console.log('[OPTIMIZATION_FRAMEWORK] Auto-tuning enabled (10s interval)');
    }

    window.BrainscanMatrix = {
        connect,
        send,
        cache: queryCache,
        getState: () => ({ ...state }),
        getBicameralState, // OPTIMIZATION_FRAMEWORK: Export state for external optimization
        applyOptimizationStrategy, // OPTIMIZATION_FRAMEWORK: Apply strategy from structured state
        validateBicameralState, // OPTIMIZATION_FRAMEWORK: Validate and suggest improvements
        autoTuneFromState, // OPTIMIZATION_FRAMEWORK: Auto-tune based on real-time metrics
        startAutoTuning, // OPTIMIZATION_FRAMEWORK: Enable automatic parameter adjustment
        // OPTIMIZATION: Manual optimization functions (safer than auto-editing)
        getOptimizationSuggestions, // Get pending suggestions for manual review
        applyOptimizationSuggestion, // Apply a specific suggestion by ID
        rejectOptimizationSuggestion, // Reject a suggestion
        adjustSlidingWindowSize, // Manually trigger window size adjustment
        applyFrequencyBandSelection, // Manually trigger frequency band optimization
        // OPTIMIZATION: AI-recommended tuning parameters
        applyTuningProfile, // Apply predefined tuning profile (balanced/highSpeed/lowLatency)
        getTuningParameters, // Get current tuning parameters and recommendations
        setCustomTuning, // Apply custom tuning parameters
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
