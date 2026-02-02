document.addEventListener('DOMContentLoaded', () => {
  const sticker = document.querySelector('.sticker-text');
  const fePointLight = document.querySelector('#sticker fePointLight');
  const feSpecularLighting = document.querySelector('#sticker feSpecularLighting');

  if (!sticker || !fePointLight || !feSpecularLighting) return;

  const MAX_DISTANCE = 400; // Pixel radius where effect is active
  const MAX_INTENSITY = 1.5; // Max specularConstant

  const syncLight = ({ clientX, clientY }) => {
    const rect = sticker.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate distance from center
    const dist = Math.hypot(clientX - centerX, clientY - centerY);

    // Calculate intensity: 1 near center, 0 at MAX_DISTANCE
    let intensity = 0;
    if (dist < MAX_DISTANCE) {
      intensity = (1 - dist / MAX_DISTANCE) * MAX_INTENSITY;
    }

    // Update light position relative to element (for the filter)
    const x = Math.floor(clientX - rect.left);
    const y = Math.floor(clientY - rect.top);
    
    fePointLight.setAttribute('x', x);
    fePointLight.setAttribute('y', y);
    
    // Update intensity
    feSpecularLighting.setAttribute('specularConstant', intensity.toFixed(2));
  };

  window.addEventListener('pointermove', syncLight);
  
  // Initialize with 0 intensity
  feSpecularLighting.setAttribute('specularConstant', '0');
});
