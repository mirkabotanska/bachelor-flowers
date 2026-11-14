// Page 8 – Garden: where the light is. The flashlight found by the camera (same detection as page 5:
// calibrate with the light off, then everything brighter than the reference by more than the threshold counts
// as light), or the mouse while its button is held. Positions come out in the simulation's pixels (W x H).
const WIDTH = 320, HEIGHT = 180;
const CALIBRATION_FRAMES = 30;
const MIN_LIGHT_PIXELS = 20;
const LIGHT_HOLD_SECONDS = 0.2;

export function createLightInput(canvas, preview, W, H) {
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.hidden = true;
  document.body.appendChild(video);
  const cameraCanvas = document.createElement('canvas');
  cameraCanvas.width = WIDTH; cameraCanvas.height = HEIGHT;
  const cameraContext = cameraCanvas.getContext('2d', { willReadFrequently: true });
  preview.width = WIDTH; preview.height = HEIGHT;
  const previewContext = preview.getContext('2d');
  const maskImage = previewContext.createImageData(WIDTH, HEIGHT);

  const state = { useCamera: false, threshold: 70, showPreview: false, status: 'Mouse: hold the button down = light', size: { W, H } };
  let reference = null, calibration = null, lastLight = null, lightLostSeconds = 0;
  const mouse = { x: 0, y: 0, down: false };

  const brightness = (px, i) => 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];

  function calibrate() {
    if (!state.useCamera) return;
    calibration = { sum: new Float32Array(WIDTH * HEIGHT), framesLeft: CALIBRATION_FRAMES };
    state.status = 'Calibrating: keep the flashlight off…';
  }

  function findLight(pixels) {
    let lit = 0, sumX = 0, sumY = 0;
    for (let i = 0; i < reference.length; i++) {
      const isLit = brightness(pixels, i) - reference[i] > state.threshold;
      const o = i * 4;
      maskImage.data[o] = maskImage.data[o + 1] = maskImage.data[o + 2] = isLit ? 255 : 0;
      maskImage.data[o + 3] = 255;
      if (isLit) { lit++; sumX += i % WIDTH; sumY += Math.floor(i / WIDTH); }
    }
    return lit >= MIN_LIGHT_PIXELS ? { x: sumX / lit, y: sumY / lit, size: lit } : null;
  }

  function detect(dt) {
    if (video.readyState < 2) return null;
    cameraContext.drawImage(video, 0, 0, WIDTH, HEIGHT);
    const pixels = cameraContext.getImageData(0, 0, WIDTH, HEIGHT).data;
    if (calibration) {
      for (let i = 0; i < calibration.sum.length; i++) calibration.sum[i] += brightness(pixels, i);
      if (--calibration.framesLeft === 0) { reference = calibration.sum.map((t) => t / CALIBRATION_FRAMES); calibration = null; state.status = 'Calibrated. Shine the flashlight.'; }
      return null;
    }
    if (!reference) { state.status = 'Flashlight off, then press Calibrate'; return null; }
    let light = findLight(pixels);
    if (light) { lastLight = light; lightLostSeconds = 0; }
    else { lightLostSeconds += dt; if (lightLostSeconds >= LIGHT_HOLD_SECONDS) lastLight = null; light = lastLight; }
    if (state.showPreview) {
      previewContext.putImageData(maskImage, 0, 0);
      previewContext.globalAlpha = 0.5; previewContext.drawImage(cameraCanvas, 0, 0); previewContext.globalAlpha = 1;
      if (light) { previewContext.strokeStyle = '#ff3b6b'; previewContext.lineWidth = 2; previewContext.beginPath(); previewContext.arc(light.x, light.y, 8, 0, Math.PI * 2); previewContext.stroke(); }
    }
    state.status = light ? `Light at x ${Math.round(light.x)}, y ${Math.round(light.y)} (${light.size} px)` : 'No light detected';
    return light;
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      state.status = 'Flashlight off, then press Calibrate';
    } catch (error) {
      state.status = `Could not start the camera: ${error.message} (the mouse still works)`;
      state.useCamera = false;
    }
  }
  function stopCamera() {
    if (video.srcObject) { video.srcObject.getTracks().forEach((t) => t.stop()); video.srcObject = null; }
    reference = null; calibration = null; lastLight = null;
    state.status = 'Mouse: hold the button down = light';
  }

  // the mouse as a light, in simulation pixels
  const toSim = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * state.size.W;
    mouse.y = ((e.clientY - r.top) / r.height) * state.size.H;
  };
  canvas.addEventListener('pointerdown', (e) => { toSim(e); mouse.down = true; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', toSim);
  canvas.addEventListener('pointerup', () => { mouse.down = false; });
  canvas.addEventListener('pointercancel', () => { mouse.down = false; });

  return {
    state, mouse, calibrate, startCamera, stopCamera,
    setCamera(on) { state.useCamera = on; on ? startCamera() : stopCamera(); },
    setSize(w, h) { state.size.W = w; state.size.H = h; },
    // the lights that are on right now ({id, x, y} in simulation pixels)
    update(dt) {
      const out = [];
      if (state.useCamera) {
        const l = detect(dt);
        if (l) out.push({ id: 'camera', x: (l.x / WIDTH) * state.size.W, y: (l.y / HEIGHT) * state.size.H, size: l.size });
      } else if (mouse.down) out.push({ id: 'mouse', x: mouse.x, y: mouse.y });
      return out;
    },
    dispose() { stopCamera(); video.remove(); },
  };
}
