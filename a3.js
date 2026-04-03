import { default as gulls } from './gulls.js'

const noiseFns = `
fn hash(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash(i);
  let b = hash(i + vec2f(1.0, 0.0));
  let c = hash(i + vec2f(0.0, 1.0));
  let d = hash(i + vec2f(1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var f = 1.0;
  for (var i = 0; i < 5; i = i + 1) {
    v += a * noise(p * f);
    f *= 2.0;
    a *= 0.5;
  }
  return v;
}
`;

const uniforms = `
@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<uniform> frame: f32;
@group(0) @binding(2) var<uniform> feedbackIntensity: f32;
@group(0) @binding(3) var<uniform> noiseScale: f32;
@group(0) @binding(4) var<uniform> chromaticShift: f32;
@group(0) @binding(5) var<uniform> colorRot: f32;
@group(0) @binding(6) var<uniform> videoEnabled: f32;
@group(0) @binding(7) var<uniform> noiseEnabled: f32;
`;

const backbufferBindings = `
@group(0) @binding(8) var videoSampler: sampler;
@group(0) @binding(9) var backBuffer: texture_2d<f32>;
`;

const externalVideoBinding = `
@group(1) @binding(0) var videoBuffer: texture_external;
`;

// Video-feedback version (matches: out = v * 0.05 + last * 0.95)
const fragmentFeedbackVideo = `
${noiseFns}
${uniforms}
${backbufferBindings}
${externalVideoBinding}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / res;               // 0..1
  let p = uv - vec2f(0.5, 0.5);      // centered -1..1 (ish)
  let t = frame * 0.01;

  // Sinusoidal warp drives both sampling from the webcam and sampling from the backbuffer.
  let warp = vec2f(
    sin((uv.y + t) * 12.0),
    cos((uv.x - t) * 9.0)
  ) * 0.015 * feedbackIntensity;

  let uvW = clamp(uv + warp, vec2f(0.0), vec2f(1.0));

  // Channel offset for chromatic aberration.
  let c = chromaticShift * (0.5 + 0.5 * sin(t));
  let uvR = clamp(uvW + vec2f(c, 0.0), vec2f(0.0), vec2f(1.0));
  let uvG = uvW;
  let uvB = clamp(uvW - vec2f(c, 0.0), vec2f(0.0), vec2f(1.0));

  // Use step() so the shader stays branch-friendly.
  let useV = step(0.5, videoEnabled); // 0 or 1
  let vWeight = useV * 0.05;
  let fbWeight = 1.0 - vWeight;

  let vR = textureSampleBaseClampToEdge(videoBuffer, videoSampler, uvR).r;
  let vG = textureSampleBaseClampToEdge(videoBuffer, videoSampler, uvG).g;
  let vB = textureSampleBaseClampToEdge(videoBuffer, videoSampler, uvB).b;

  let fbR = textureSample(backBuffer, videoSampler, uvR).r;
  let fbG = textureSample(backBuffer, videoSampler, uvG).g;
  let fbB = textureSample(backBuffer, videoSampler, uvB).b;

  // Simple feedback blend from the assignment hint.
  var col = vec3f(
    vR * vWeight + fbR * fbWeight,
    vG * vWeight + fbG * fbWeight,
    vB * vWeight + fbB * fbWeight
  );

  if (noiseEnabled > 0.5) {
    let n = fbm(uvW * noiseScale + vec2f(t * 0.7, -t * 0.5));
    col += vec3f(n * 0.32);
  }

  // Color rotation (only on R/G plane).
  let a = colorRot;
  let ca = cos(a);
  let sa = sin(a);
  col = vec3f(
    col.r * ca - col.g * sa,
    col.r * sa + col.g * ca,
    col.b
  );

  let vignette = smoothstep(1.05, 0.1, length(p));
  return vec4f(col * vignette, 1.0);
}
`;

// Fallback version when webcam is unavailable: noise + backbuffer echo.
const fragmentFeedbackFallback = `
${noiseFns}
${uniforms}
${backbufferBindings}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / res;
  let p = uv - vec2f(0.5, 0.5);
  let t = frame * 0.01;

  let warp = vec2f(
    sin((uv.y + t) * 12.0),
    cos((uv.x - t) * 9.0)
  ) * 0.015 * feedbackIntensity;

  let uvW = clamp(uv + warp, vec2f(0.0), vec2f(1.0));

  let fb = textureSample(backBuffer, videoSampler, uvW).rgb;

  var col = fb * 0.95;

  if (noiseEnabled > 0.5) {
    let n1 = fbm(uvW * noiseScale + vec2f(t * 0.6, 0.0));
    let n2 = fbm((uvW + vec2f(0.2, -0.1)) * (noiseScale * 1.7) - vec2f(0.0, t * 0.4));
    col += vec3f(n1 * 0.5, n2 * 0.45, (n1 + n2) * 0.25);
  }

  // Reuse the same R/G color rotation for consistency.
  let a = colorRot;
  let ca = cos(a);
  let sa = sin(a);
  col = vec3f(
    col.r * ca - col.g * sa,
    col.r * sa + col.g * ca,
    col.b
  );

  let vignette = smoothstep(1.05, 0.1, length(p));
  return vec4f(col * vignette, 1.0);
}
`;

function setText(id, value) {
  document.querySelector(id).textContent = value;
}

function setVideoStatus(ok, reason = null) {
  const dot = document.querySelector('#videoStatus');
  const txt = document.querySelector('#videoStatusText');
  if (ok) {
    dot.classList.remove('off');
    txt.textContent = 'Ready';
  } else {
    dot.classList.add('off');
    txt.textContent = reason ? `Unavailable (${reason})` : 'Unavailable (fallback)';
  }
}

async function getCamera(sg, isFirefox) {
  // gulls.js does not support external video textures on Firefox.
  // We return null so we use the fallback shader variant.
  if (isFirefox) return { texture: null, reason: 'Firefox fallback' };
  try {
    const gUM = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!gUM) return null;

    let stream = null;
    try {
      stream = await gUM({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
    } catch (_err1) {
      // Retry with fewer constraints if the device rejects the preferred resolution.
      stream = await gUM({ video: true, audio: false });
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    const texture = await sg.video(video);
    return { texture, reason: null };
  } catch (_e) {
    const name = _e && _e.name ? _e.name : '';
    const msg = String(_e && _e.message ? _e.message : _e);
    console.warn('Camera error:', name, msg);

    let reason = 'camera unavailable';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') reason = 'permission blocked';
    else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') reason = 'no camera found';
    else if (name === 'OverconstrainedError') reason = 'camera constraints rejected';
    else if (name === 'SecurityError') reason = 'insecure context (use https/localhost)';

    return { texture: null, reason };
  }
}

async function init() {
  const sg = await gulls.init();
  const quad = gulls.constants.vertex;
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

  const resU = sg.uniform([window.innerWidth, window.innerHeight]);
  const frameU = sg.uniform(0);
  const feedbackU = sg.uniform(0.85);
  const noiseScaleU = sg.uniform(2.5);
  const chromaU = sg.uniform(0.015);
  const colorRotU = sg.uniform(0.0);
  const videoOnU = sg.uniform(1.0);
  const noiseOnU = sg.uniform(1.0);

  const commonData = [resU, frameU, feedbackU, noiseScaleU, chromaU, colorRotU, videoOnU, noiseOnU];

  // Persistent feedback texture (backbuffer).
  const back = new Float32Array(sg.width * sg.height * 4);
  const feedback_t = sg.texture(back);
  const videoSampler = sg.sampler();

  const cam = await getCamera(sg, isFirefox);
  const videoTexture = cam && cam.texture ? cam.texture : null;
  const reason = cam && cam.reason ? cam.reason : null;
  const useVideo = !!videoTexture && !isFirefox;
  setVideoStatus(useVideo, !useVideo ? reason : null);

  if (!useVideo) {
    videoOnU.value = 0.0;
    document.querySelector('#videoToggle').classList.remove('active');
    document.querySelector('#videoToggle').textContent = 'Video: OFF';
  }

  const shader = quad + (useVideo ? fragmentFeedbackVideo : fragmentFeedbackFallback);
  const data = useVideo ? [...commonData, videoSampler, feedback_t, videoTexture] : [...commonData, videoSampler, feedback_t];

  const pass = await sg.render({
    shader,
    data,
    copy: feedback_t,
    onframe() { frameU.value++; }
  });

  sg.run(pass);

  const feedbackSlider = document.querySelector('#feedbackSlider');
  const noiseScaleSlider = document.querySelector('#noiseScaleSlider');
  const chromaticSlider = document.querySelector('#chromaticSlider');
  const colorRotSlider = document.querySelector('#colorRotSlider');
  const videoToggle = document.querySelector('#videoToggle');
  const noiseToggle = document.querySelector('#noiseToggle');

  feedbackSlider.oninput = () => {
    feedbackU.value = parseFloat(feedbackSlider.value);
    setText('#feedbackValue', feedbackU.value.toFixed(2));
  };

  noiseScaleSlider.oninput = () => {
    noiseScaleU.value = parseFloat(noiseScaleSlider.value);
    setText('#noiseScaleValue', noiseScaleU.value.toFixed(1));
  };

  chromaticSlider.oninput = () => {
    chromaU.value = parseFloat(chromaticSlider.value);
    setText('#chromaticValue', chromaU.value.toFixed(3));
  };

  colorRotSlider.oninput = () => {
    colorRotU.value = parseFloat(colorRotSlider.value);
    setText('#colorRotValue', colorRotU.value.toFixed(2));
  };

  videoToggle.onclick = () => {
    if (!useVideo) return;
    const enabled = videoOnU.value > 0.5;
    videoOnU.value = enabled ? 0.0 : 1.0;
    videoToggle.classList.toggle('active');
    videoToggle.textContent = enabled ? 'Video: OFF' : 'Video: ON';
  };

  noiseToggle.onclick = () => {
    const enabled = noiseOnU.value > 0.5;
    noiseOnU.value = enabled ? 0.0 : 1.0;
    noiseToggle.classList.toggle('active');
    noiseToggle.textContent = enabled ? 'Noise: OFF' : 'Noise: ON';
    document.querySelector('#noiseStatus').classList.toggle('off', enabled);
    document.querySelector('#noiseStatusText').textContent = enabled ? 'Inactive' : 'Active';
  };

  window.onresize = () => {
    resU.value = [window.innerWidth, window.innerHeight];
  };
}

init().catch(console.error);
