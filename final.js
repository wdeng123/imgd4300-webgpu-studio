import gulls from './gulls.js';

const WG = 8;
const TOUCHES = 4;
const COUNT = 12000;
const PGRID = Math.ceil(Math.sqrt(COUNT));
const $ = s => document.querySelector(s);
const show = (id,v,d=3)=>$(id).textContent=Number(v).toFixed(d);

function computeShader(W,H){return `
struct P{pos:vec2f,vel:vec2f,life:f32,seed:f32};
@group(0) @binding(0) var<uniform> screen: vec2f;
@group(0) @binding(1) var<uniform> sim: vec4f; // feed kill swirl speed
@group(0) @binding(2) var<uniform> touchCfg: vec4f; // brush force _ _
@group(0) @binding(3) var<uniform> touches: array<vec4f, ${TOUCHES}>;
@group(0) @binding(4) var<uniform> time: f32;
@group(0) @binding(5) var<storage, read> aIn: array<f32>;
@group(0) @binding(6) var<storage, read_write> aOut: array<f32>;
@group(0) @binding(7) var<storage, read> bIn: array<f32>;
@group(0) @binding(8) var<storage, read_write> bOut: array<f32>;
@group(0) @binding(9) var<storage, read_write> delta: array<f32>;
@group(0) @binding(10) var<storage, read_write> glow: array<f32>;
@group(0) @binding(11) var<storage, read> pIn: array<P>;
@group(0) @binding(12) var<storage, read_write> pOut: array<P>;
fn h(v:f32)->f32{return fract(sin(v*43758.5453)*1399763.5453);} 
fn idx(x:i32,y:i32)->u32{return u32(((y%${H}+${H})%${H})*${W}+((x%${W}+${W})%${W}));}
fn pidx(c:vec3u)->u32{return c.x+c.y*${PGRID}u;}
fn sB(uv:vec2f)->f32{let x=i32(floor(fract(uv.x+1.)*f32(${W})));let y=i32(floor(fract(uv.y+1.)*f32(${H})));return bIn[idx(x,y)];}
fn paint(uv:vec2f)->f32{var m=0.;for(var i=0;i<${TOUCHES};i=i+1){let t=touches[i];if(t.z>.5){m+=smoothstep(touchCfg.x,0.,distance(uv,t.xy));}}return min(m,1.2);} 
fn pull(pos:vec2f)->vec2f{var f=vec2f(0.);for(var i=0;i<${TOUCHES};i=i+1){let t=touches[i];if(t.z>.5){let q=t.xy*2.-1.;let d=q-pos;let l=max(length(d),0.001);f+=normalize(d)*smoothstep(.9,0.,l)*t.w;}}return f;}
@compute @workgroup_size(${WG},${WG},1)
fn cs(@builtin(global_invocation_id) gid:vec3u){
  let x=i32(gid.x);
  let y=i32(gid.y);
  if(x<${W}&&y<${H}){
    let i=idx(x,y); let A=aIn[i]; let B=bIn[i];
    let lapA=.05*aIn[idx(x-1,y-1)]+.2*aIn[idx(x,y-1)]+.05*aIn[idx(x+1,y-1)]+.2*aIn[idx(x-1,y)]-A+.2*aIn[idx(x+1,y)]+.05*aIn[idx(x-1,y+1)]+.2*aIn[idx(x,y+1)]+.05*aIn[idx(x+1,y+1)];
    let lapB=.05*bIn[idx(x-1,y-1)]+.2*bIn[idx(x,y-1)]+.05*bIn[idx(x+1,y-1)]+.2*bIn[idx(x-1,y)]-B+.2*bIn[idx(x+1,y)]+.05*bIn[idx(x-1,y+1)]+.2*bIn[idx(x,y+1)]+.05*bIn[idx(x+1,y+1)];
    let uv=(vec2f(f32(x),f32(y))+.5)/vec2f(f32(${W}),f32(${H}));
    let n=vec2f(h(uv.x*31.+uv.y*79.+time*.08)-.5,h(uv.x*67.-uv.y*23.-time*.06)-.5)*sim.z;
    let advA=(aIn[idx(x+1,y)]-aIn[idx(x-1,y)])*n.x+(aIn[idx(x,y+1)]-aIn[idx(x,y-1)])*n.y;
    let advB=(bIn[idx(x+1,y)]-bIn[idx(x-1,y)])*n.x+(bIn[idx(x,y+1)]-bIn[idx(x,y-1)])*n.y;
    let react=A*B*B;
    var na=clamp(A+(1.*lapA-react+sim.x*(1.-A)-advA*.08),0.,1.);
    var nb=clamp(B+(.5*lapB+react-(sim.y+sim.x)*B-advB*.08),0.,1.);
    let ink=paint(uv);
    if(ink>.001){nb=max(nb,ink);na=min(na,.15+(1.-ink)*.25);} 
    aOut[i]=na; bOut[i]=nb; delta[i]=abs(nb-B);
  }
  if(gid.x<${PGRID}u&&gid.y<${PGRID}u){
    let i=pidx(gid); if(i>=${COUNT}u){return;}
    var p=pIn[i];
    let uv=p.pos*.5+.5;
    let sx=1./f32(${W});
    let sy=1./f32(${H});
    let b=sB(uv);
    let grad=vec2f(sB(uv+vec2f(sx,0.))-sB(uv-vec2f(sx,0.)),sB(uv+vec2f(0.,sy))-sB(uv-vec2f(0.,sy)));
    let curl=vec2f(-grad.y,grad.x);
    let t=pull(p.pos);
    let j=vec2f(h(p.seed+time*.1+f32(i)*.01)-.5,h(p.seed*1.7-time*.07+f32(i)*.02)-.5);
    p.vel=p.vel*.986+grad*(.03+b*.06)+curl*(.02+sim.z*.02)+t*touchCfg.y*.012+j*.002;
    p.pos=p.pos+p.vel*sim.w;
    if(p.pos.x<-1.){p.pos.x=1.;} if(p.pos.x>1.){p.pos.x=-1.;}
    if(p.pos.y<-1.){p.pos.y=1.;} if(p.pos.y>1.){p.pos.y=-1.;}
    p.life=fract(p.life+.004+b*.02); p.seed+=.0004; pOut[i]=p;
    let px=i32(floor((p.pos.x*.5+.5)*f32(${W})));
    let py=i32(floor((p.pos.y*.5+.5)*f32(${H})));
    glow[idx(px,py)]=clamp(.25+b*.6+length(p.vel)*3.+p.life*.2,0.,1.);
  }
}`;}

function renderShader(W,H){return gulls.constants.vertex+`
@group(0) @binding(0) var<uniform> screen: vec2f;
@group(0) @binding(1) var<uniform> sim: vec4f;
@group(0) @binding(2) var<uniform> touchCfg: vec4f;
@group(0) @binding(3) var<uniform> touches: array<vec4f, ${TOUCHES}>;
@group(0) @binding(4) var<uniform> time: f32;
@group(0) @binding(5) var<storage> a: array<f32>;
@group(0) @binding(7) var<storage> b: array<f32>;
@group(0) @binding(9) var<storage> delta: array<f32>;
@group(0) @binding(10) var<storage> glow: array<f32>;
fn idx(x:i32,y:i32)->u32{return u32(((y%${H}+${H})%${H})*${W}+((x%${W}+${W})%${W}));}
fn g(x:i32,y:i32)->f32{return glow[idx(x,y)];}
fn touch(uv:vec2f)->f32{var m=0.;for(var i=0;i<${TOUCHES};i=i+1){let t=touches[i];if(t.z>.5){m+=smoothstep(touchCfg.x*1.7,0.,distance(uv,t.xy));}}return m;}
@fragment
fn fs(@builtin(position) pos:vec4f)->@location(0) vec4f{
  let uv=pos.xy/screen;
  let x=i32(floor(uv.x*f32(${W})));
  let y=i32(floor(uv.y*f32(${H})));
  let i=idx(x,y);
  let B=b[i];
  let D=clamp(delta[i]*26.,0.,1.);
  let e=vec2f(b[idx(x+1,y)]-b[idx(x-1,y)], b[idx(x,y+1)]-b[idx(x,y-1)]);
  let rim=clamp(length(e)*2.1,0.,1.);
  let bloom=g(x,y)*1.5+.9*(g(x-1,y)+g(x+1,y)+g(x,y-1)+g(x,y+1))+.45*(g(x-1,y-1)+g(x+1,y-1)+g(x-1,y+1)+g(x+1,y+1));
  let t=touch(uv);
  let deep=vec3f(.02,.03,.08);
  let aqua=vec3f(.08,.42,.56);
  let coral=vec3f(.95,.43,.58);
  let gold=vec3f(1.,.82,.48);
  let mist=vec3f(.75,.94,1.);
  var col=mix(deep,aqua,smoothstep(.08,.62,B));
  col=mix(col,coral,smoothstep(.22,.92,B)*.78);
  col+=gold*pow(clamp(bloom,0.,1.4),1.15)*.26;
  col+=mist*rim*.18;
  col+=vec3f(.18,.13,.28)*D;
  col+=vec3f(.11,.2,.34)*t;
  col*=smoothstep(.92,.14,distance(uv,vec2f(.5)));
  return vec4f(clamp(col,vec3f(0.),vec3f(1.)),1.);
}`;}

function seedField(W,H){
  const n=W*H,a1=new Float32Array(n),a2=new Float32Array(n),b1=new Float32Array(n),b2=new Float32Array(n),d=new Float32Array(n),g=new Float32Array(n);
  a1.fill(1); a2.fill(1);
  const seeds=9, r=Math.max(10,Math.floor(Math.min(W,H)*0.045));
  for(let s=0;s<seeds;s++){
    const cx=Math.floor((s+1)*W/(seeds+1)), cy=Math.floor(H*(0.34+0.18*Math.sin(s*1.31)+Math.random()*0.16));
    for(let y=-r;y<=r;y++) for(let x=-r;x<=r;x++){
      const px=cx+x, py=cy+y; if(px<0||py<0||px>=W||py>=H) continue;
      if(Math.hypot(x,y)>r*(0.65+Math.random()*0.28)) continue;
      const i=py*W+px; a1[i]=a2[i]=0; b1[i]=b2[i]=1;
    }
  }
  return {a1,a2,b1,b2,d,g};
}

function seedParticles(){
  const data=new Float32Array(COUNT*6);
  for(let i=0;i<COUNT;i++){
    const b=i*6, a=Math.random()*Math.PI*2, r=Math.sqrt(Math.random())*.35;
    data[b]=Math.cos(a)*r; data[b+1]=Math.sin(a)*r;
    data[b+2]=(Math.random()-.5)*.01; data[b+3]=(Math.random()-.5)*.01;
    data[b+4]=Math.random(); data[b+5]=Math.random()*1000;
  }
  return data;
}

async function init(){
  const sg=await gulls.init();
  let computePass=null, renderPass=null, glowBuffer=null, paused=false, rebuild=false, frame=0;
  const sim=new Float32Array([0.034,0.062,1.12,1.0]);
  const touchCfg=new Float32Array([0.09,1.35,0,0]);
  const touchData=new Float32Array(TOUCHES*4);
  const points=new Map(), order=[];

  const screenU=sg.uniform([innerWidth,innerHeight]);
  const simU=sg.uniform([...sim]);
  const touchCfgU=sg.uniform([...touchCfg]);
  const touchesU=sg.uniform([...touchData]);
  const timeU=sg.uniform(0);
  const sync=()=>{simU.value=[...sim]; touchCfgU.value=[...touchCfg];};
  const slide=(sid,vid,arr,idx,d=3)=>{const el=$(sid); const up=()=>{arr[idx]=parseFloat(el.value); sync(); show(vid,el.value,d);}; el.addEventListener('input',up); up();};
  slide('#feedSlider','#feedValue',sim,0,3); slide('#killSlider','#killValue',sim,1,3); slide('#swirlSlider','#swirlValue',sim,2,2); slide('#speedSlider','#speedValue',sim,3,2); slide('#brushSlider','#brushValue',touchCfg,0,2); slide('#forceSlider','#forceValue',touchCfg,1,2);

  const syncTouches=()=>{
    touchData.fill(0);
    order.slice(0,TOUCHES).forEach((id,i)=>{const p=points.get(id); if(!p) return; const b=i*4; touchData[b]=p.x; touchData[b+1]=p.y; touchData[b+2]=1; touchData[b+3]=i%2===0?1:-1;});
    touchesU.value=[...touchData];
    $('#touchCount').textContent=String(Math.min(order.length,TOUCHES));
  };
  const setPoint=e=>{const r=sg.canvas.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height; points.set(e.pointerId,{x,y}); if(!order.includes(e.pointerId)) order.push(e.pointerId); syncTouches();};
  const clearPoint=id=>{points.delete(id); const k=order.indexOf(id); if(k>=0) order.splice(k,1); syncTouches();};

  async function rebuildSim(){
    const W=Math.max(220,Math.floor(innerWidth/2)), H=Math.max(160,Math.floor(innerHeight/2));
    screenU.value=[innerWidth,innerHeight];
    const s=seedField(W,H);
    glowBuffer=sg.buffer(s.g);
    const data=[
      screenU, simU, touchCfgU, touchesU, timeU,
      sg.pingpong(sg.buffer(s.a1),sg.buffer(s.a2)),
      sg.pingpong(sg.buffer(s.b1),sg.buffer(s.b2)),
      sg.buffer(s.d), glowBuffer,
      sg.pingpong(sg.buffer(seedParticles()),sg.buffer(seedParticles()))
    ];
    const dx=Math.max(Math.ceil(W/WG),Math.ceil(PGRID/WG)), dy=Math.max(Math.ceil(H/WG),Math.ceil(PGRID/WG));
    computePass=sg.compute({shader:computeShader(W,H),data,dispatchCount:[dx,dy,1]});
    renderPass=await sg.render({shader:renderShader(W,H),data});
    frame=0;
  }

  sg.canvas.style.touchAction='none';
  sg.canvas.addEventListener('pointerdown',e=>{setPoint(e); sg.canvas.setPointerCapture?.(e.pointerId);});
  sg.canvas.addEventListener('pointermove',e=>{if(points.has(e.pointerId)) setPoint(e);});
  window.addEventListener('pointerup',e=>clearPoint(e.pointerId));
  window.addEventListener('pointercancel',e=>clearPoint(e.pointerId));

  $('#pauseBtn').onclick=()=>{paused=!paused; $('#pauseBtn').textContent=`Pause: ${paused?'On':'Off'}`;};
  $('#resetBtn').onclick=()=>{rebuild=true;};
  $('#clearBtn').onclick=()=>{points.clear(); order.length=0; syncTouches();};
  addEventListener('resize',()=>{rebuild=true;});

  await rebuildSim();
  let last=performance.now(), stamp=performance.now(), fps=0;
  async function loop(now){
    if(rebuild){rebuild=false; await rebuildSim();}
    timeU.value=now*.001;
    if(!paused && computePass && renderPass && glowBuffer){ glowBuffer.clear(); await sg.once(computePass,renderPass); frame++; fps++; } else if(renderPass){ await sg.once(renderPass); }
    if(now-stamp>500){ $('#fpsText').textContent=`${Math.round(fps*1000/(now-stamp))} fps`; $('#frameText').textContent=String(frame); fps=0; stamp=now; last=now; }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

init().catch(console.error);
