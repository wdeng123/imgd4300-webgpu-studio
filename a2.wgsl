// A2 Shader Live Coding — Echo Pulse
// IMGD/CS 4300, D-Term 2026
// Performance shader for wgsl_live (https://charlieroberts.github.io/wgsl_live/)
// Press Ctrl+Enter to reload shader
//
// Functions used (18 total):
//   wgsl_live builtins : uvN, uv, seconds, rotate, lastframe, audio
//   WGSL builtins      : sin, cos, abs, fract, length, distance,
//                        smoothstep, mix, clamp, step, pow, atan2

@fragment
fn fs( @builtin(position) pos : vec4f ) -> @location(0) vec4f {

  let t    = seconds();
  let uv0  = uvN( pos.xy );          // 0..1
  var p    = uv( pos.xy );           // -1..1, centre at origin

  // ── 1. Drifting centre (Lissajous) ────────────────────────────────────
  var centre = vec2f( sin(t * 1.1) * .28, cos(t * 0.85) * .28 );

  // ── 2. Primary circle (soft edge) ─────────────────────────────────────
  let d      = distance( p, centre );
  let radius = .09 + audio[2] * .06;          // high-freq expands circle
  let circle = 1.0 - smoothstep( radius, radius + .03, d );

  // ── 3. Ripple field (polar) ────────────────────────────────────────────
  let r      = length( p );
  let angle  = atan2( p.y, p.x );
  let ripple = sin( r * 14.0 - t * 2.5 + cos( angle * 3.0 + t ) ) * .5 + .5;

  // ── 4. Frame feedback (rotated + mouse offset) ─────────────────────────
  let spin   = t / 7.0 + sin( t * .3 ) * .15;
  let rot    = rotate( uv0, spin ) + mouse.xy * .06;
  let fb     = lastframe( clamp( rot, vec2f(0.0), vec2f(1.0) ) );

  // ── 5. Audio modulation weights ───────────────────────────────────────
  let bass   = .42 + audio[0] * .65;          // bass  → feedback opacity
  let mid    = abs( sin( t * .6 ) ) * .15 + audio[1] * .1;

  // ── 6. Colour synthesis ───────────────────────────────────────────────
  var col    = fb * bass;

  // ripple tints each channel at its own tempo
  col.r += ripple * (.10 + mid);
  col.g += ripple * abs( sin( t * .45 ) ) * .08;
  col.b += (1.0 - ripple) * .07 + mid * .5;

  // circle stamp
  let stamp  = vec4f(
    mix( .3, .95, fract( t * .18 ) ),
    mix( .6,  .2, fract( t * .11 ) ),
    mix( .8,  .4, fract( t * .23 ) ),
    1.0
  );
  col += vec4f( circle ) * stamp;

  // ── 7. Tone / vignette ────────────────────────────────────────────────
  // gentle gamma decay keeps feedback from blowing out
  col    = pow( clamp( col, vec4f(0.0), vec4f(1.0) ), vec4f(1.018) ) * .965;

  // radial vignette
  let vig = smoothstep( 1.1, .25, r );
  col    *= vig;

  // hard-clip
  return clamp( col, vec4f(0.0), vec4f(1.0) );
}
