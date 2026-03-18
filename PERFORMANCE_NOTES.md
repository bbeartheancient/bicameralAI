/**
 * Performance Optimization Notes for Brainscan EEG Visualizer
 * 
 * Current Bottlenecks:
 * 1. updateVisualization() runs on EVERY EEG frame (256 Hz)
 *    - Computes 16 spherical harmonics components
 *    - Creates new arrays every frame
 *    - Multiple forEach loops
 * 
 * 2. Animation loop updates EVERYTHING every frame:
 *    - Wave paths (forEach loop)
 *    - Surface glows (forEach loop)
 *    - Cube positioning (vector math)
 *    - Plasma shader uniforms
 * 
 * 3. Canvas waveform drawing on every frame
 * 
 * Optimizations Applied:
 */

// In eeg-spatializer.html animate() function - add frame skipping:
let frameSkipCounter = 0;
const FRAME_SKIP = 2; // Only update visuals every 2nd frame (120Hz effective)

function animate(timestamp) {
  requestAnimationFrame(animate);
  
  frameSkipCounter++;
  const shouldUpdateVisuals = frameSkipCounter % FRAME_SKIP === 0;
  
  if (isPlaying && eegData) {
    // ... existing code ...
    
    if (shouldUpdateVisuals) {
      updateVisualization();
      drawWaveforms();
    }
  }
  
  // Always run these (lighter weight):
  if (ambisonicOutput && window.centerSphere) {
    // Center sphere updates (keep smooth)
  }
  
  if (shouldUpdateVisuals) {
    // Heavy updates only every Nth frame:
    // - Wave paths
    // - Surface glows  
    // - Plasma shader (can be every 2-3 frames)
    updateWavePaths();
    updateSurfaceGlows();
  }
}

// In updateVisualization() - reuse arrays instead of creating new ones:
// Instead of: currentMatrixOutput = new Array(16);
// Use: currentMatrixOutput.fill(0); // Reuse existing array

// Throttle WebSocket frame processing:
// In brainscan-integrated.js, add frame skipping:
let lastFrameTime = 0;
const FRAME_THROTTLE = 1000 / 60; // Cap at 60 FPS for UI updates

function handleEEGFrame(data) {
  const now = performance.now();
  if (now - lastFrameTime < FRAME_THROTTLE) {
    // Skip this frame, just store data
    state.lastEEGFrame = data;
    return;
  }
  lastFrameTime = now;
  
  // ... rest of processing
}

// Use requestAnimationFrame batching:
// Instead of calling updateVisualization() 256 times/second,
// let RAF naturally throttle it to display refresh rate (usually 60Hz)

// Skip updates when tab is hidden:
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause expensive computations
    isPlaying = false;
  }
});

// Canvas optimization - use requestAnimationFrame instead of immediate draw:
// Instead of calling drawWaveforms() every frame,
// let the animation loop handle it
