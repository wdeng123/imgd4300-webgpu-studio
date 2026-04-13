import gulls from './gulls.js';

const noise = `
fn h(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}
fn n(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = h(i);
  let b = h(i + vec2f(1.,0.));
  let c = h(i + vec2f(0.,1.));
  let d = h(i + vec2f(1.,1.));
  let u = f * f * (3. - 2. * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1. - u.x) + (d - b) * u.x * u.y;
}
fn fbm(p: vec2f) -> f32 {
  var v = 0.; var a = .5; var f = 1.;
  for (var i = 0; i < 4; i = i + 1) { v += a * n(p * f); f *= 2.; a *= .5; }
  return v;
}
fn flow(p: vec2f, s: f32) -> vec2f {
  let q = p * s;
  let ang = fbm(q + vec2f(.13, 3.7)) * 6.2831853 + fbm(q * 1.8 + vec2f(4.2, 1.1)) * 3.1415926;
  return vec2f(cos(ang), sin(ang));
}
`;

const compute = `
${noise}
@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<uniform> ptr: vec4f;
@group(0) @binding(2) var<uniform> feed: f32;
@group(0) @binding(3) var<uniform> kill: f32;
@group(0) @binding(4) var<uniform> da: f32;
@group(0) @binding(5) var<uniform> db: f32;
@group(0) @binding(6) var<uniform> dt: f32;
@group(0) @binding(7) var<uniform> flowAmt: f32;
@group(0) @binding(8) var<uniform> flowScale: f32;
@group(0) @binding(9) var<storage, read> aIn: array<f32>;
@group(0) @binding(10) var<storage, read_write> aOut: array<f32>;
@group(0) @binding(11) var<storage, read> bIn: array<f32>;
@group(0) @binding(12) var<storage, read_write> bOut: array<f32>;
@group(0) @binding(13) var<storage, read> dIn: array<f32>;
@group(0) @binding(14) var<storage, read_write> dOut: array<f32>;
fn wrap(v: i32, m: i32) -> i32 { return (v % m + m) % m; }
fn idx(x: i32, y: i32) -> u32 { let r = vec2i(res); return u32(wrap(y, r.y) * r.x + wrap(x, r.x)); }
fn sa(x: i32, y: i32) -> f32 { return aIn[idx(x, y)]; }
fn sb(x: i32, y: i32) -> f32 { return bIn[idx(x, y)]; }
@compute @workgroup_size(8,8)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  let x = i32(gid.x);
  let y = i32(gid.y);
  let r = vec2i(res);
  if (x >= r.x || y >= r.y) { return; }
  let i = idx(x, y);
  let A = aIn[i];
  let B = bIn[i];
  let lapA = 0.05*sa(x-1,y-1)+0.20*sa(x,y-1)+0.05*sa(x+1,y-1)+0.20*sa(x-1,y)-A+0.20*sa(x+1,y)+0.05*sa(x-1,y+1)+0.20*sa(x,y+1)+0.05*sa(x+1,y+1);
  let lapB = 0.05*sb(x-1,y-1)+0.20*sb(x,y-1)+0.05*sb(x+1,y-1)+0.20*sb(x-1,y)-B+0.20*sb(x+1,y)+0.05*sb(x-1,y+1)+0.20*sb(x,y+1)+0.05*sb(x+1,y+1);
  let uv = vec2f(f32(x)/res.x, f32(y)/res.y);
  let f = flow(uv + vec2f(.2,.7), flowScale * 2.5) * flowAmt;
  let ax = i32(sign(f.x));
  let ay = i32(sign(f.y));
  let advA = (sa(x+ax,y)-sa(x-ax,y))*.5*abs(f.x) + (sa(x,y+ay)-sa(x,y-ay))*.5*abs(f.y);
  let advB = (sb(x+ax,y)-sb(x-ax,y))*.5*abs(f.x) + (sb(x,y+ay)-sb(x,y-ay))*.5*abs(f.y);
  let react = A * B * B;
  var na = clamp(A + (da*lapA - react + feed*(1.-A) - advA*.25) * dt, 0., 1.);
  var nb = clamp(B + (db*lapB + react - (kill+feed)*B - advB*.25) * dt, 0., 1.);
  if (ptr.z > .5 && distance(uv, ptr.xy) < ptr.w) { nb = 1.; na = min(na, .18); }
  aOut[i] = na; bOut[i] = nb; dOut[i] = abs(nb - B);
}
`;

const frag = `
${noise}
@group(0) @binding(0) var<uniform> res: vec2f;
@group(0) @binding(1) var<uniform> ptr: vec4f;
@group(0) @binding(2) var<uniform> feed: f32;
@group(0) @binding(3) var<uniform> kill: f32;
@group(0) @binding(4) var<uniform> da: f32;
@group(0) @binding(5) var<uniform> db: f32;
@group(0) @binding(6) var<uniform> dt: f32;
@group(0) @binding(7) var<uniform> flowAmt: f32;
@group(0) @binding(8) var<uniform> flowScale: f32;
@group(0) @binding(9) var<storage> a: array<f32>;
@group(0) @binding(11) var<storage> b: array<f32>;
@group(0) @binding(13) var<storage> d: array<f32>;
fn idx(x: i32, y: i32) -> u32 { let r = vec2i(res); let xx = (x % r.x + r.x) % r.x; let yy = (y % r.y + r.y) % r.y; return u32(yy * r.x + xx); }
@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / res;
  let i = idx(i32(pos.x), i32(pos.y));
  let A = a[i];
  let B = b[i];
  let D = clamp(d[i] * 28., 0., 1.);
  let band = smoothstep(.22, .88, B);
  let ridge = smoothstep(.03, .22, B - A * .15);
  let ff = fbm(uv * (2.5 + flowScale) + vec2f(2.1, 8.4));
  let deep = vec3f(.018,.058,.102);
  let teal = vec3f(.09,.45,.49);
  let sand = vec3f(.84,.85,.63);
  let rose = vec3f(.95,.56,.72);
  var col = mix(deep, teal, band);
  col = mix(col, sand, ridge * .75 + ff * .18);
  col = mix(col, rose, D * .9);
  col += vec3f(.06,.03,.08) * fbm(uv * 14. + vec2f(B*3., A*2.)) * D;
  col *= smoothstep(1.15, .15, distance(uv, vec2f(.5)));
  return vec4f(clamp(col, vec3f(0.), vec3f(1.)), 1.);
}
`;

const P = {
  coral:{feed:0.0367,kill:0.0649,da:1,db:0.5,dt:1,flow:0.85,scale:1.6,brush:0.024},
  maze:{feed:0.029,kill:0.057,da:1,db:0.42,dt:1,flow:0.35,scale:0.9,brush:0.022},
  tidal:{feed:0.046,kill:0.062,da:0.94,db:0.33,dt:0.94,flow:1.75,scale:2.4,brush:0.03}
};
const $ = s => document.querySelector(s);
const show = (id,v,d=3) => $(id).textContent = Number(v).toFixed(d);

function state(w,h,name){
  const size = w*h, a1 = new Float32Array(size), a2 = new Float32Array(size), b1 = new Float32Array(size), b2 = new Float32Array(size), d1 = new Float32Array(size), d2 = new Float32Array(size);
  a1.fill(1); a2.fill(1);
  const count = name==='tidal'?11:name==='maze'?7:9, r = Math.max(12, Math.floor(Math.min(w,h)*0.045));
  for(let s=0;s<count;s++){
    const cx = Math.floor((s+1)*w/(count+1)), cy = Math.floor(h*(0.3 + 0.18*Math.sin(s*1.7) + Math.random()*0.2));
    for(let y=-r;y<=r;y++) for(let x=-r;x<=r;x++){
      const px=cx+x, py=cy+y; if(px<0||px>=w||py<0||py>=h) continue;
      if(Math.hypot(x,y) > r*(0.72+Math.random()*0.28)) continue;
      const i = py*w+px; a1[i]=a2[i]=0; b1[i]=b2[i]=1;
    }
  }
  return {a1,a2,b1,b2,d1,d2};
}

async function init(){
  const sg = await gulls.init(), quad = gulls.constants.vertex;
  let preset = 'coral', paused = false, rebuild = false, computePass = null, renderPass = null;
  const ptr = {x:.5,y:.5,down:0,r:P[preset].brush};
  const resU = sg.uniform([innerWidth, innerHeight]), ptrU = sg.uniform([ptr.x,ptr.y,ptr.down,ptr.r]);
  const feedU = sg.uniform(P[preset].feed), killU = sg.uniform(P[preset].kill), daU = sg.uniform(P[preset].da), dbU = sg.uniform(P[preset].db), dtU = sg.uniform(P[preset].dt), flowU = sg.uniform(P[preset].flow), scaleU = sg.uniform(P[preset].scale);
  const pushPtr = () => { ptrU.value = [ptr.x,ptr.y,ptr.down,ptr.r]; };
  const bind = (sid, vid, u, d=3) => { const el=$(sid); el.oninput=()=>{u.value=parseFloat(el.value); show(vid,el.value,d)}; show(vid,el.value,d); };
  bind('#feedSlider','#feedValue',feedU,4);
  bind('#killSlider','#killValue',killU,4);
  bind('#daSlider','#daValue',daU,3);
  bind('#dbSlider','#dbValue',dbU,3);
  bind('#dtSlider','#dtValue',dtU,3);
  bind('#flowSlider','#flowValue',flowU,3);
  bind('#flowScaleSlider','#flowScaleValue',scaleU,3);
  $('#seedSlider').oninput=()=>{ ptr.r=parseFloat($('#seedSlider').value); show('#seedValue',ptr.r,3); pushPtr(); };
  show('#seedValue',ptr.r,3);
  const applyPreset = name => {
    preset = name;
    const p = P[name];
    $('#feedSlider').value=p.feed; $('#killSlider').value=p.kill; $('#daSlider').value=p.da; $('#dbSlider').value=p.db;
    $('#dtSlider').value=p.dt; $('#flowSlider').value=p.flow; $('#flowScaleSlider').value=p.scale; $('#seedSlider').value=p.brush;
    feedU.value=p.feed; killU.value=p.kill; daU.value=p.da; dbU.value=p.db; dtU.value=p.dt; flowU.value=p.flow; scaleU.value=p.scale;
    ptr.r=p.brush; pushPtr();
    show('#feedValue',p.feed,4); show('#killValue',p.kill,4); show('#daValue',p.da,3); show('#dbValue',p.db,3);
    show('#dtValue',p.dt,3); show('#flowValue',p.flow,3); show('#flowScaleValue',p.scale,3); show('#seedValue',p.brush,3);
    document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active', b.dataset.preset===name));
  };
  async function rebuildSim(){
    const w = innerWidth, h = innerHeight;
    resU.value = [w,h];
    const s = state(w,h,preset);
    const data = [
      resU, ptrU, feedU, killU, daU, dbU, dtU, flowU, scaleU,
      sg.pingpong(sg.buffer(s.a1),sg.buffer(s.a2)),
      sg.pingpong(sg.buffer(s.b1),sg.buffer(s.b2)),
      sg.pingpong(sg.buffer(s.d1),sg.buffer(s.d2))
    ];
    computePass = sg.compute({ shader:compute, data, dispatchCount:[Math.ceil(w/8),Math.ceil(h/8),1], times:10 });
    renderPass = await sg.render({ shader:quad + frag, data });
  }
  const setPos = e => {
    const r=sg.canvas.getBoundingClientRect();
    ptr.x=(e.clientX-r.left)/r.width;
    ptr.y=(e.clientY-r.top)/r.height;
    pushPtr();
  };
  sg.canvas.addEventListener('pointermove', e=>setPos(e));
  sg.canvas.addEventListener('pointerdown', e=>{ setPos(e); ptr.down=1; pushPtr(); });
  window.addEventListener('pointerup', ()=>{ ptr.down=0; pushPtr(); });
  sg.canvas.addEventListener('pointerleave', ()=>{ ptr.down=0; pushPtr(); });
  $('#pauseBtn').onclick=()=>{ paused=!paused; $('#pauseBtn').textContent=`Pause: ${paused?'On':'Off'}`; };
  $('#resetBtn').onclick=()=>{ rebuild = true; };
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{ applyPreset(b.dataset.preset); rebuild = true; });
  addEventListener('resize', ()=>{ rebuild = true; });
  applyPreset(preset);
  await rebuildSim();
  let last = performance.now(), frames = 0;
  async function loop(){
    if(rebuild){ rebuild=false; await rebuildSim(); }
    if(!paused && computePass && renderPass){
      await sg.once(computePass, renderPass);
      frames++;
      const now=performance.now();
      if(now-last>500){ $('#frameRateText').textContent=`${Math.round(frames*1000/(now-last))} fps · live`; frames=0; last=now; }
    } else if(renderPass) {
      await sg.once(renderPass);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

init().catch(console.error);
