import gulls from './gulls.js';

const GRID_SIZE = 3;
const NUM_AGENTS = 768;
const WG = 8;
const AGENT_GRID = Math.ceil(Math.sqrt(NUM_AGENTS));
const WORKGROUPS = Math.ceil(AGENT_GRID / WG);

const W = Math.max(64, Math.floor(window.innerWidth / GRID_SIZE));
const H = Math.max(64, Math.floor(window.innerHeight / GRID_SIZE));

const AGENT_STRIDE = 6; // x, y, dirTurns, kind, timer, spin
const TYPE_NAMES = ['Classic 90°', 'Diagonal 45°', 'Timer Reset'];

const compute = `
struct Ant {
  pos: vec2f,
  dir: f32,
  kind: f32,
  timer: f32,
  spin: f32
};

@group(0) @binding(0) var<storage, read_write> ants: array<Ant>;
@group(0) @binding(1) var<storage, read_write> pheromones: array<f32>;
@group(0) @binding(2) var<storage, read_write> render: array<f32>;
@group(0) @binding(3) var<uniform> stepsPerFrame: f32;

fn antIndex(c: vec3u) -> u32 {
  return c.x + c.y * ${AGENT_GRID}u;
}

fn wrapPos(pos: vec2f) -> vec2f {
  let x = (pos.x + ${W}.0) % ${W}.0;
  let y = (pos.y + ${H}.0) % ${H}.0;
  return vec2f(x, y);
}

fn pheromoneIndex(pos: vec2f) -> u32 {
  let p = wrapPos(round(pos));
  return u32(p.y) * ${W}u + u32(p.x);
}

fn stepDir(turns: f32) -> vec2f {
  let a = turns * 6.28318530718;
  return round(vec2f(sin(a), cos(a)));
}

fn applyClassic(ant: ptr<function, Ant>, pIdx: u32, hasPheromone: bool) {
  if (hasPheromone) {
    (*ant).dir = (*ant).dir + 0.25 * (*ant).spin;
    pheromones[pIdx] = 0.0;
  } else {
    (*ant).dir = (*ant).dir - 0.25 * (*ant).spin;
    pheromones[pIdx] = 1.0;
  }
}

fn applyDiagonal(ant: ptr<function, Ant>, pIdx: u32, hasPheromone: bool) {
  if (hasPheromone) {
    (*ant).dir = (*ant).dir + 0.125 * (*ant).spin;
    pheromones[pIdx] = 0.0;
  } else {
    (*ant).dir = (*ant).dir - 0.125 * (*ant).spin;
    pheromones[pIdx] = 1.0;
  }
}

fn applyTimer(ant: ptr<function, Ant>, pIdx: u32, hasPheromone: bool) {
  if (hasPheromone) {
    pheromones[pIdx] = 0.0;
    (*ant).timer = 10.0;
  } else {
    pheromones[pIdx] = 1.0;
    (*ant).timer = (*ant).timer - 1.0;
    if ((*ant).timer <= 0.0) {
      (*ant).dir = (*ant).dir + 0.25 * (*ant).spin;
      (*ant).timer = 10.0;
    }
  }
}

@compute @workgroup_size(${WG}, ${WG}, 1)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  let i = antIndex(gid);
  if (i >= ${NUM_AGENTS}u) { return; }

  var ant = ants[i];
  let pIdx = pheromoneIndex(ant.pos);
  let hasPheromone = pheromones[pIdx] > 0.5;
  let kind = u32(ant.kind);

  if (kind == 0u) {
    applyClassic(&ant, pIdx, hasPheromone);
  } else if (kind == 1u) {
    applyDiagonal(&ant, pIdx, hasPheromone);
  } else {
    applyTimer(&ant, pIdx, hasPheromone);
  }

  let stepMul = max(1.0, floor(stepsPerFrame));
  let d = stepDir(ant.dir);
  ant.pos = wrapPos(ant.pos + d * stepMul);
  ants[i] = ant;

  let drawIdx = pheromoneIndex(ant.pos);
  render[drawIdx] = ant.kind + 1.0;
}
`;

const render = gulls.constants.vertex + `
struct Ant {
  pos: vec2f,
  dir: f32,
  kind: f32,
  timer: f32,
  spin: f32
};

@group(0) @binding(0) var<storage> ants: array<Ant>;
@group(0) @binding(1) var<storage> pheromones: array<f32>;
@group(0) @binding(2) var<storage> render: array<f32>;
@group(0) @binding(3) var<uniform> stepsPerFrame: f32;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let g = floor(pos.xy / ${GRID_SIZE}.0);
  let idx = u32(g.y) * ${W}u + u32(g.x);

  let p = pheromones[idx];
  let a = render[idx];

  let dark = vec3f(0.03, 0.05, 0.09);
  let trail = dark + vec3f(p * 0.66, p * 0.75, p * 0.72);

  var antColor = vec3f(0.94, 0.34, 0.22); // classic
  if (a > 1.5 && a < 2.5) {
    antColor = vec3f(0.32, 0.72, 1.0); // diagonal
  } else if (a > 2.5) {
    antColor = vec3f(1.0, 0.86, 0.32); // timer
  }

  let c = select(trail, antColor, a > 0.5);
  return vec4f(c, 1.0);
}
`;

function makeAgents() {
  const data = new Float32Array(NUM_AGENTS * AGENT_STRIDE);
  for (let i = 0; i < NUM_AGENTS; i++) {
    const base = i * AGENT_STRIDE;
    const band = i % 3;
    data[base] = Math.floor((0.45 + Math.random() * 0.1) * W);
    data[base + 1] = Math.floor((0.45 + Math.random() * 0.1) * H);
    data[base + 2] = 0;
    data[base + 3] = band;
    data[base + 4] = 6 + Math.floor(Math.random() * 8);
    data[base + 5] = Math.random() > 0.5 ? 1 : -1;
  }
  return data;
}

const $ = (s) => document.querySelector(s);

async function init() {
  const sg = await gulls.init();
  const pheromoneData = new Float32Array(W * H);
  const renderData = new Float32Array(W * H);
  let agentData = makeAgents();

  const antBuffer = sg.buffer(agentData);
  const pheromoneBuffer = sg.buffer(pheromoneData);
  const renderBuffer = sg.buffer(renderData);
  const stepsU = sg.uniform(1);

  const data = [antBuffer, pheromoneBuffer, renderBuffer, stepsU];
  const computePass = sg.compute({
    shader: compute,
    data,
    dispatchCount: [WORKGROUPS, WORKGROUPS, 1]
  });
  const renderPass = await sg.render({
    shader: render,
    data
  });

  let paused = false;
  $('#pauseBtn').onclick = () => {
    paused = !paused;
    $('#pauseBtn').textContent = `Pause: ${paused ? 'On' : 'Off'}`;
  };

  $('#stepsSlider').addEventListener('input', () => {
    const v = Number($('#stepsSlider').value);
    stepsU.value = v;
    $('#stepsValue').textContent = v.toFixed(0);
  });
  $('#stepsValue').textContent = Number($('#stepsSlider').value).toFixed(0);

  $('#resetBtn').onclick = () => {
    agentData = makeAgents();
    sg.device.queue.writeBuffer(antBuffer.buffer, 0, agentData);
    pheromoneBuffer.clear();
    renderBuffer.clear();
  };

  let frame = 0;
  async function loop() {
    if (!paused) {
      renderBuffer.clear();
      await sg.once(computePass, renderPass);
      frame += 1;
      $('#frameText').textContent = String(frame);
      const typeIndex = frame % 3;
      $('#modeText').textContent = TYPE_NAMES[typeIndex];
    } else {
      await sg.once(renderPass);
    }
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

init().catch(console.error);
