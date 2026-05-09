# imgd4300-webgpu-studio

Personal course website for **IMGD/CS 4300: Graphics, Simulation, and Aesthetics**  
WPI · D-Term 2026 · Instructor: Charlie Roberts

## Files

| File | Purpose |
|------|---------|
| `index.html` | Course home page — lists all assignments |
| `a2.html` | A2: Shader Live Coding write-up page |
| `a2.wgsl` | WGSL fragment shader used in A2 performance |
| `a3.html` | A3 interactive WebGPU project |
| `a3.js` | A3 shader / interaction logic |
| `a3-doc.html` | A3 technical + aesthetic explanation |
| `a4.html` | A4 reaction-diffusion project |
| `a4.js` | A4 compute shader + controls |
| `a4-doc.html` | A4 technical + aesthetic explanation |
| `a5.html` | A5 particle simulation project |
| `a5.js` | A5 compute + render particle pipeline |
| `a5-doc.html` | A5 technical + aesthetic explanation |
| `a6.html` | A6 Langton vants simulation |
| `a6.js` | A6 compute + render vant behaviors |
| `a6-doc.html` | A6 behavior analysis + reflection |
| `final.html` | Final project interactive simulation |
| `final.js` | Final project hybrid compute/render logic |
| `final-doc.html` | Final project process + aesthetic write-up |
| `A1_A2_Checklist.md` | Personal submission checklist |

## Assignment Notes

- **A3** is a fullscreen fragment-shader piece with webcam feedback, noise, and chromatic distortion.
- **A4** is a GPU Gray–Scott reaction-diffusion simulation with live controls for `feed`, `kill`, `diffusion A`, and `diffusion B`, plus a flow-field option and click-based painting.
- **A5** is a WebGPU particle burst system with real-time controls for gravity, drag, burst energy, and spawn radius.
- **A6** is a Langton-style ant simulation with three concurrent behavior types (classic 90°, diagonal 45°, and timer-reset turns) sharing one pheromone grid.
- **Final Project** is a hybrid reaction-diffusion plus particle-field instrument with multitouch input, chemical painting, and glow-based rendering. It explicitly combines interaction and representation goals from the final brief.

## Deployment

Host via GitHub Pages or any static host. After deployment, make sure the course homepage links to:

- the running project page,
- the repository,
- and the explanation page for each assignment.
