import gulls from './gulls.js';

const COUNT = 8192;
const WG = 8;
const GRID = Math.ceil(Math.sqrt(COUNT));
const WORKGROUPS = Math.ceil(GRID / WG);

const compute = `
struct Particle {
  pos: vec2f,
  vel: vec2f,
  life: f32,
  seed: f32
};

@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<uniform> ptr: vec4f; // x, y, down, burstRadius
@group(0) @binding(2) var<uniform> dt: f32;
@group(0) @binding(3) var<uniform> gravity: f32;
@group(0) @binding(4) var<uniform> drag: f32;
@group(0) @binding(5) var<uniform> burst: f32;
@group(0) @binding(6) var<storage, read> stateIn: array<Particle>;
@group(0) @binding(7) var<storage, read_write> stateOut: array<Particle>;

fn hash(v: f32) -> f32 {
  return fract(sin(v * 43758.5453123) * 1399763.5453);
}

fn idx(c: vec3u) -> u32 {
  return c.x + c.y * ${GRID}u;
}

@compute @workgroup_size(${WG}, ${WG})
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  let i = idx(gid);
  if(i >= ${COUNT}u) { return; }

  var p = stateIn[i];
  let n = hash(p.seed + f32(i) * 0.1327);
  let n2 = hash(p.seed * 0.71 + f32(i) * 0.913);
  let pointer = vec2f(ptr.x, ptr.y);
  let clicked = ptr.z > 0.5;
  let nearClick = distance(p.pos, pointer) < ptr.w;

  p.life = p.life - dt;
  p.vel.y = p.vel.y - gravity * dt;
  p.vel = p.vel * max(0.0, 1.0 - drag * dt);
  p.pos = p.pos + p.vel * dt;

  if(p.life <= 0.0 || abs(p.pos.x) > 1.4 || p.pos.y < -1.3 || p.pos.y > 1.3 || (clicked && nearClick)) {
    let ang = n * 6.2831853;
    let rad = sqrt(n2) * ptr.w * 0.65;
    let center = select(vec2f(0.0, -0.8), pointer, clicked);
    p.pos = center + vec2f(cos(ang), sin(ang)) * rad;

    let speed = burst * (0.25 + hash(n * 17.3 + f32(i)) * 0.9);
    let launch = vec2f(cos(ang), sin(ang)) * speed;
    p.vel = launch + vec2f((hash(n2 * 9.7) - 0.5) * 0.2, 0.4 + hash(n * 11.2) * 0.8);
    p.life = 0.7 + hash(n + n2) * 2.2;
    p.seed = p.seed + 0.013 + hash(f32(i) * 0.031);
  }

  stateOut[i] = p;
}
`;

const frag = `
struct Particle {
  pos: vec2f,
  vel: vec2f,
  life: f32,
  seed: f32
};

struct VertexIn {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) tint: vec3f,
  @location(1) alpha: f32
};

@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<uniform> ptr: vec4f;
@group(0) @binding(2) var<uniform> dt: f32;
@group(0) @binding(3) var<uniform> gravity: f32;
@group(0) @binding(4) var<uniform> drag: f32;
@group(0) @binding(5) var<uniform> burst: f32;
@group(0) @binding(6) var<storage> state: array<Particle>;
fn hash(v: f32) -> f32 { return fract(sin(v * 43758.5453123) * 1399763.5453); }

@vertex
fn vs(v: VertexIn) -> VertexOut {
  let p = state[v.instance];
  let speed = length(p.vel);
  let lifeNorm = clamp(p.life / 2.6, 0.0, 1.0);
  let aspect = res.y / max(1.0, res.x);
  let size = 0.0038 + speed * 0.0016;
  let quad = v.pos * size;

  var out: VertexOut;
  out.position = vec4f(
    p.pos.x + quad.x * aspect,
    p.pos.y + quad.y,
    0.0,
    1.0
  );

  let hueJitter = hash(p.seed * 2.7 + f32(v.instance) * 0.17);
  let cool = vec3f(0.25, 0.57, 1.0);
  let warm = vec3f(1.0, 0.53, 0.18);
  let hot = vec3f(1.0, 0.9, 0.62);
  let ramp = mix(cool, warm, clamp(speed * 0.38, 0.0, 1.0));
  out.tint = mix(ramp, hot, lifeNorm * 0.5 + hueJitter * 0.2);
  out.alpha = clamp(0.04 + lifeNorm * 0.35 + speed * 0.04, 0.0, 0.55);
  return out;
}

@fragment
fn fs(inf: VertexOut) -> @location(0) vec4f {
  return vec4f(inf.tint, inf.alpha);
}
`;

function makeInitialState() {
  const data = new Float32Array(COUNT * 6);
  for (let i = 0; i < COUNT; i++) {
    const b = i * 6;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.04;
    data[b] = Math.cos(a) * r;
    data[b + 1] = -0.8 + Math.sin(a) * r;
    data[b + 2] = (Math.random() - 0.5) * 0.04;
    data[b + 3] = 0.3 + Math.random() * 0.8;
    data[b + 4] = Math.random() * 2.5;
    data[b + 5] = Math.random() * 1000;
  }
  return data;
}

const $ = (s) => document.querySelector(s);
const show = (id, value, digits = 3) => { $(id).textContent = Number(value).toFixed(digits); };

async function init() {
  const sg = await gulls.init();
  const quad = gulls.constants.shapes.quad;

  const ui = {
    gravity: 1.35,
    drag: 0.22,
    burst: 1.15,
    radius: 0.16
  };

  const ptr = { x: 0, y: -0.8, down: 0, r: ui.radius };
  const resU = sg.uniform([innerWidth, innerHeight]);
  const ptrU = sg.uniform([ptr.x, ptr.y, ptr.down, ptr.r]);
  const dtU = sg.uniform(1 / 60);
  const gravityU = sg.uniform(ui.gravity);
  const dragU = sg.uniform(ui.drag);
  const burstU = sg.uniform(ui.burst);

  const bindRange = (sliderId, valueId, uniform, digits = 3) => {
    const el = $(sliderId);
    const sync = () => {
      uniform.value = parseFloat(el.value);
      show(valueId, el.value, digits);
    };
    el.addEventListener('input', sync);
    sync();
  };

  bindRange('#gravitySlider', '#gravityValue', gravityU, 2);
  bindRange('#dragSlider', '#dragValue', dragU, 2);
  bindRange('#burstSlider', '#burstValue', burstU, 2);
  $('#radiusSlider').addEventListener('input', () => {
    ptr.r = parseFloat($('#radiusSlider').value);
    ptrU.value = [ptr.x, ptr.y, ptr.down, ptr.r];
    show('#radiusValue', ptr.r, 2);
  });
  show('#radiusValue', ptr.r, 2);

  const stateA = sg.buffer(makeInitialState());
  const stateB = sg.buffer(makeInitialState());
  const data = [resU, ptrU, dtU, gravityU, dragU, burstU, sg.pingpong(stateA, stateB)];

  const computePass = sg.compute({
    shader: compute,
    data,
    dispatchCount: [WORKGROUPS, WORKGROUPS, 1],
    times: 1
  });
  const renderPass = await sg.render({
    shader: frag,
    data,
    vertices: quad,
    count: COUNT,
    blend: true
  });

  const setPointer = (e) => {
    const rect = sg.canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    ptr.x = nx * 2 - 1;
    ptr.y = 1 - ny * 2;
    ptrU.value = [ptr.x, ptr.y, ptr.down, ptr.r];
  };

  sg.canvas.addEventListener('pointerdown', (e) => {
    setPointer(e);
    ptr.down = 1;
    ptrU.value = [ptr.x, ptr.y, ptr.down, ptr.r];
  });
  sg.canvas.addEventListener('pointermove', (e) => {
    if (ptr.down > 0.5) setPointer(e);
  });
  window.addEventListener('pointerup', () => {
    ptr.down = 0;
    ptrU.value = [ptr.x, ptr.y, ptr.down, ptr.r];
  });

  let paused = false;
  $('#pauseBtn').onclick = () => {
    paused = !paused;
    $('#pauseBtn').textContent = `Pause: ${paused ? 'On' : 'Off'}`;
  };

  $('#burstBtn').onclick = () => {
    ptr.down = 1;
    ptrU.value = [0, -0.75, ptr.down, ptr.r * 1.2];
    setTimeout(() => {
      ptr.down = 0;
      ptrU.value = [ptr.x, ptr.y, ptr.down, ptr.r];
    }, 60);
  };

  let last = performance.now();
  let frames = 0;
  async function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 1 / 60);
    last = now;
    dtU.value = dt;
    if (!paused) {
      await sg.once(computePass, renderPass);
      frames++;
    } else {
      await sg.once(renderPass);
    }
    if (frames > 12) {
      $('#fpsText').textContent = `${Math.round(1 / Math.max(dt, 0.0001))} fps`;
      frames = 0;
    }
    requestAnimationFrame(loop);
  }

  addEventListener('resize', () => {
    resU.value = [innerWidth, innerHeight];
  });

  requestAnimationFrame(loop);
}

init().catch(console.error);
