// Simulate a CRT's glow by drawing into a phosphor texture,
// thereby "depositing" photons into the phosphor, and then
// drawing the texture to the screen, thereby "emitting"
// a fraction of the photons from the phosphor. Another pass
// removes those photons from the phosphor texture, "fading" it.
//
// This makes each phosphor texel glow for a few frames after
// being "hit" by the cathod ray, and then fade out over time.
//
// The phosphor texture is ping-ponged between two sim textures
// because we need to read from the previous frame's texture
// while writing to the current frame's texture.
//
// The phosphor texture is in linear space. When drawn to the
// screen, the values are gamma corrected to sRGB.

// TODO
// [x] Gaussian deposition of photons
// [x] UI for experimenting with parameters
// [x] lightpen tracking
// [x] interlaced rendering
// [ ] use for Sketchpad drawing
// [ ] use >8bit textures for higher dynamic range
// [ ] avoid uploading 8 buffers for interlacing (indexed or instancing maybe?)
// [ ] fix interlacing (up to 8 spots are not drawn at the end)

import 'webgl-lint'; // for debugging
import * as twgl from 'twgl.js';
import * as dat from 'dat.gui';
import * as wrapper from './wrapper';
import config from './config';
import { showHideConsole } from './console';

export type Spot = {
  x: number;
  y: number;
  id?: number;
};

// Sketchpad used 36 bit words for spot locations in the display table
// (which Ivan called "display file" in the thesis):
// 10 bits from each of the two half-words for x and y,
// plus the remaining 16 bits as ID for the lightpen

// we will use 16 bits out of the two half-words in a 64 bit word for x and y
// and 16 more bits in the x word for the spot id. The 16 bits in the y word
// are used for a spot index, which can be used to colorize spots
const MAX_SPOTS = 16348; // TX-2 used 32K words for display table with double buffering
let displayTable = new Int32Array(MAX_SPOTS * 2 + 64); // 64 extra for interlaced rendering
let spotCount = 0; // number of spots in display table
let penSpotCount = 0; // number of spots at the end of the table for penTracker
let spotsSeen: Spot[] = []; // spots seen by the lightpen
let startSpot = 0; // start of current frame's spots in display table (50K/sec)
let spotsChanged = false; // true if spots have changed since last frame
let pen = { // pen location and pseudo pen location
    pos: { x: 0, y: 0 },
    pseudo: { x: 0, y: 0 },
};
///////// PUBLIC API //////////

export function init(canvas: HTMLCanvasElement, options?: Partial<typeof params>) {
  if (options) setParams(options);
  return startup(canvas);
}

export function clearSpots() {
  spotCount = 0;
  penSpotCount = 0;
  spotsChanged = true;
}

export function addSpot(x: number | Spot, y?: number, id?: number) {
  if (typeof x === 'object') {
    const s: Spot = x as Spot;
    return addSpot(s.x, s.y, s.id);
  }
  if (typeof x !== 'number' || typeof y !== 'number')
    throw Error('addSpot(x, y, id?) expects x, y as numbers');
  if (!id) id = 0;
  if (params.clipToSquare && (x < -512 || x >= 512 || y < -512 || y >= 512)) {
    return;
  }
  if (spotCount >= MAX_SPOTS) {
    console.warn(`MAX_SPOTS (${MAX_SPOTS}) reached`);
    return;
  }
  const idx = spotCount;
  let i = idx;
  if (params.twinkleSpots) {
    const j = (Math.random() * spotCount) | 0;
    displayTable[2 * i] = displayTable[2 * j];
    displayTable[2 * i + 1] = displayTable[2 * j + 1];
    i = j;
  }
  // putting pos in the upper half makes it easy to sign-extend in the shader
  displayTable[2 * i] = (x << 16) | (id & 65535); // for pen tracking?
  displayTable[2 * i + 1] = (y << 16) | (idx & 65535); // for colorizing spots
  spotCount++;
  spotsChanged = true;
}

export function getSpotCount() {
  return spotCount;
}

export function getSpots() {
  const spots: Spot[] = [];
  for (let i = 0; i < spotCount; i++) {
    spots.push({
      x: displayTable[2 * i] >> 16,
      y: displayTable[2 * i + 1] >> 16,
      id: displayTable[2 * i] & 65535,
    });
  }
  return spots;
}

export function getSeenSpots() {
  return spotsSeen;
}

export function setPen(x: number, y: number) {
  pen.pos.x = x | 0;
  pen.pos.y = y | 0;
}

export function getPen() {
  return pen;
}

export function setParams(p: Partial<typeof params>) {
  Object.assign(params, p);
}

export function getParam<P extends keyof typeof params>(p: P): typeof params[P] {
  return params[p];
}

///////// CONFIG //////////

// you can override these defaults by passing options to init()
// or by calling setParams()
const params = {
  spotSize: 9,                    // size of spot texture
  spotIntensity: 0.3,            // like beam current
  spotDensity: devicePixelRatio,  // spots on line/arc
  spotsPerSec: 100000,            // draw speed in spots per second
  spotsCPUFraction: 0.5,          // fraction of CPU time for spots
  phosphorSpeed: 0.5,             // fade amount per frame
  phosphorAmbient: 0.3,           // base brightness
  phosphorSmoothness: 0.95,       // 0: rough, 1: smooth
  phosphorGrain: 3,               // size of graininess
  clipToSquare: false,            // only draw within 1024x1024 square
  interlaceSpots: false,          // interlaced rendering
  twinkleSpots: false,            // scramble spots for less flicker
  penTracker: true,               // draw pen tracking cross
  trackerSize: 5,                 // size of tracking cross
  trackerSnap: 5,                 // snap distance for pseudo pen location
  colorizeByIndex: false,         // colorize spots by ID
  showConsole: config().console,
  fullscreen: false,
  showGui: false,                 // show GUI
  openGui: false,                 // open controls at start
  // below just for internal use as uniforms
  colorIdx: 0,                    // how many spots to color in frag shader
  pixelRatio: devicePixelRatio,   // scale for pointSize
  screenScale: [0, 0],            // set in resize()
};

///////// IMPLEMENTATION //////////

const FADE_VSHADER = `#version 300 es
in vec2 pos;
out vec2 uv;
void main() {
    gl_Position = vec4(pos, 0.0, 1.0);
    uv = pos * 0.5 + 0.5;
}`;

const FADE_FSHADER = `#version 300 es
precision mediump float;
uniform float phosphorSpeed;
uniform float phosphorAmbient;
uniform float phosphorSmoothness;
uniform float phosphorGrain;
uniform float pixelRatio;
in vec2 uv;
out vec4 photons;

// Simplex Noise Function
vec2 mod289(vec2 x) { return x - floor(x / 289.0) * 289.0; }
vec3 mod289(vec3 x) { return x - floor(x / 289.0) * 289.0; }
vec3 permute(vec3 x) { return mod289((x * 34.0 + 1.0) * x); }

float simplexNoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1.x = step( x0.y, x0.x );
    i1.y = 1.0 - i1.x;
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m *= m;
    m *= m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    // noise to simulate phosphor roughness
    float noise = simplexNoise(uv * pixelRatio / phosphorGrain * 500.0);
    float p = phosphorAmbient * mix(noise * 2.0, 1.0, phosphorSmoothness);
    // used with src * src.a + dst*(1-src.a)) blending to fade out
    photons = vec4(p, p, p, phosphorSpeed);
}`;

const SPOT_VSHADER = `#version 300 es
in      ivec2 xyIdIx;          // position in upper 16 bits, id in lower 16 bits
uniform vec2  screenScale;     // half width/height of screen
uniform float pixelRatio;      // device pixel ratio
uniform float spotSize;        // size of spot

void main() {
    ivec2 pos = xyIdIx >> ivec2(16, 16);                   // sign extend 16 bits to 32
    gl_Position = vec4(vec2(pos) / screenScale, 0.0, 1.0);
    gl_PointSize = spotSize * pixelRatio;
}`;

const SPOT_FSHADER = `#version 300 es
precision mediump float;
uniform float spotIntensity;
out vec4 photons;
void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    float gauss = exp(-20.0 * dist*dist) * spotIntensity;          // 20 works well for 8 bit color components
    // src+dst blending to accumulate photons
    photons = vec4(gauss, gauss, gauss, 1.0);
}`;

// fancy version that colorizes spots by index

const COLORIZE_SPOT_VSHADER = `#version 300 es
in      ivec2 xyIdIx;          // position in upper 16 bits, id and index in lower 16 bits
uniform vec2  screenScale;     // half width/height of screen
uniform float pixelRatio;      // device pixel ratio
uniform float spotSize;        // size of spot
uniform uint  colorIdx;        // start of spots in display table
out     vec3  v_color;         // color of spot

vec3 hue(float h) {
    h = mod(h, 1.0);
    float r = abs(h * 6.0 - 3.0) - 1.0;
    float g = 2.0 - abs(h * 6.0 - 2.0);
    float b = 2.0 - abs(h * 6.0 - 4.0);
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

void main() {
    ivec2 pos = xyIdIx >> ivec2(16, 16);                   // sign extend 16 bits to 32
    uint idx = uint(xyIdIx.y & 65535);                     // 16 bit index
    if (idx < colorIdx) {
        float fraction = float(idx) / float(colorIdx);     // map to [0, 1)
        v_color = hue(fraction * 0.7);                     // color by table index from red to purple
    } else {
        v_color = vec3(1.0);                               // default: white
    }
    gl_Position = vec4(vec2(pos) / screenScale, 0.0, 1.0);
    gl_PointSize = spotSize * pixelRatio;
}`;

const COLORIZE_SPOT_FSHADER = `#version 300 es
precision mediump float;
in vec3 v_color;
uniform float spotIntensity;
out vec4 photons;
void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    float gauss = exp(-20.0 * dist*dist) * spotIntensity;          // 20 works well for 8 bit color components
    // src+dst blending to accumulate photons
    photons = gauss * vec4(v_color, 1.0);
}`;

function startup(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })!;
  if (!gl) throw new Error('No WebGL2 context found');

  function resize() {
    twgl.resizeCanvasToDisplaySize(canvas, devicePixelRatio);
    const scale = Math.min(canvas.width / 512, canvas.height / 512);
    gl.viewport(0, 0, canvas.width, canvas.height);
    params.screenScale = [canvas.width / scale, canvas.height / scale];
    // clear outside of 1024x1024 square
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (params.clipToSquare) {
      // only draw inner square
      const ratio = canvas.width / canvas.height;
      const left = ratio > 1 ? (canvas.width - canvas.height) / 2 : 0;
      const top = ratio < 1 ? (canvas.height - canvas.width) / 2 : 0;
      const size = ratio > 1 ? canvas.height : canvas.width;
      gl.scissor(left, top, size, size);
      gl.enable(gl.SCISSOR_TEST);
    } else {
      gl.disable(gl.SCISSOR_TEST);
    }
  }
  onresize = () => resize();
  resize();

  config().console = params.showConsole;
  showHideConsole();

  const gui = new dat.GUI();
  gui.add(params, 'spotSize', 1, 100);
  gui.add(params, 'spotIntensity', 0.1, 1);
  gui.add(params, 'spotDensity', 0.1, 5);
  gui.add(params, 'spotsPerSec', 1000, 500000);
  gui.add(params, 'spotsCPUFraction', 0.01, 1).listen(); // changed in app()
  gui.add(params, 'phosphorSpeed', 0, 1);
  gui.add(params, 'phosphorAmbient', 0, 0.5);
  gui.add(params, 'phosphorSmoothness', 0, 1);
  gui.add(params, 'phosphorGrain', 1, 10);
  gui.add(params, 'clipToSquare').onChange(() => resize());
  gui.add(params, 'interlaceSpots');
  gui.add(params, 'twinkleSpots');
  gui.add(params, 'penTracker').onChange((on: boolean) => {
    canvas.style.cursor = on ? 'none' : 'default';
    if (!on) clearPenSpots();
  });
  gui.add(params, 'trackerSize', 1, 20);
  gui.add(params, 'trackerSnap', 1, 20);
  gui.add(params, 'colorizeByIndex');
  gui.add(params, 'showConsole').onChange((on) => {
    config().console = on;
    showHideConsole();
  });
  gui.add(params, 'fullscreen').onChange((on: boolean) => {
    if (on) document.body.requestFullscreen();
    else document.exitFullscreen();
  });
  if (!params.showGui) gui.hide();
  if (!params.openGui) gui.close();
  canvas.style.cursor = params.penTracker ? 'none' : 'default';

  const fadeProg = twgl.createProgramInfo(gl, [FADE_VSHADER, FADE_FSHADER]);
  const fadeArrays: twgl.Arrays = {
    pos: {
      numComponents: 2,
      data: [-1, -1, 1, -1, 1, 1, -1, 1],
    },
  };
  const fadeBuffer = twgl.createBufferInfoFromArrays(gl, fadeArrays);

  let simpleSpotsProg = twgl.createProgramInfo(gl, [SPOT_VSHADER, SPOT_FSHADER]);
  let colorizeSpotsProg = twgl.createProgramInfo(gl, [
    COLORIZE_SPOT_VSHADER,
    COLORIZE_SPOT_FSHADER,
  ]);
  const spotsArrays: twgl.Arrays = {
    xyIdIx: {
      numComponents: 2,
      data: displayTable,
    },
  };
  const spotsBuffer = twgl.createBufferInfoFromArrays(gl, spotsArrays);
  const interlacedBuffers: twgl.BufferInfo[] = [];
  for (let i = 0; i < 8; i++) {
    const interlacedArrays: twgl.Arrays = {
      xyIdIx: {
        numComponents: 2,
        data: displayTable,
        stride: 64, // every 8th spot, 8 bytes per spot
        offset: 8 * i, // staggered by 8 bytes
      },
    };
    interlacedBuffers.push(twgl.createBufferInfoFromArrays(gl, interlacedArrays));
  }

  let prevTime = 0;
  function display(time: number) {
    const delta = time - prevTime;
    prevTime = time;
    let spotsBudget = ((Math.max(8, Math.min(delta, 30)) * params.spotsPerSec * params.spotsCPUFraction) / 1000) | 0;
    // console.log('spotsBudget', spotsBudget);

    if (params.penTracker) penTracker();

    // render phosphor fade
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(fadeProg.program);
    twgl.setBuffersAndAttributes(gl, fadeProg, fadeBuffer);
    twgl.setUniforms(fadeProg, params);
    twgl.drawBufferInfo(gl, fadeBuffer, gl.TRIANGLE_FAN);

    // update spots buffers
    if (spotsChanged) {
      twgl.setAttribInfoBufferFromArray(
        gl,
        spotsBuffer.attribs!.xyIdIx,
        new Int32Array(displayTable.buffer, 0, spotCount * 2),
      );
      for (let i = 0; i < 8; i++) {
        twgl.setAttribInfoBufferFromArray(
          gl,
          interlacedBuffers[i].attribs!.xyIdIx,
          new Int32Array(displayTable.buffer, 0, spotCount * 2),
        );
      }
      spotsChanged = false;
    }

    // we can only render spotsBudget spots now.
    // use startSpot to keep track of where we are
    const spotsToDraw = spotCount - penSpotCount; // don't draw pen spots yet
    if (startSpot >= spotsToDraw) startSpot = 0; // after spotCount reduction

    let spotsProg = params.colorizeByIndex ? colorizeSpotsProg : simpleSpotsProg;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(spotsProg.program);
    params.colorIdx = spotsToDraw;
    twgl.setUniforms(spotsProg, params);

    if (params.interlaceSpots && spotsToDraw > 8) {
      // stride was set to every 8th spot
      // render to end of non-pen spots in display table
      const drawInterlaced = spotsToDraw >> 3;
      let spotsDrawn = 0; // draw until we exhaust spotsBudget
      let from = startSpot >> 3; // decompose startSpot into from and i
      let i = startSpot & 7;
      while (spotsBudget > 0 && spotsToDraw > spotsDrawn) {
        twgl.setBuffersAndAttributes(gl, spotsProg, interlacedBuffers[i]);
        const segEnd = Math.min(from + spotsBudget, drawInterlaced);
        const segSize = segEnd - from;
        if (segSize <= 0) break;
        twgl.drawBufferInfo(gl, interlacedBuffers[i], gl.POINTS, segSize, from);
        spotsDrawn += segSize;
        spotsBudget -= segSize;
        from += segSize;
        if (from === drawInterlaced) {
          from = 0;
          if (i++ === 7) i = 0;
        }
      }
      startSpot = (from << 3) + i; // recompose from and i into startSpot
      // console.log('startSpot', startSpot);
    } else if (spotsToDraw > 0) {
      // first, draw up to end of non-pen spots in display table
      twgl.setBuffersAndAttributes(gl, spotsProg, spotsBuffer);
      const segEnd = Math.min(startSpot + spotsBudget, spotsToDraw);
      const segSize = segEnd - startSpot;
      if (segSize > 0) twgl.drawBufferInfo(gl, spotsBuffer, gl.POINTS, segSize, startSpot);
      const spotsDrawn = segSize;
      spotsBudget -= spotsDrawn;
      startSpot = (startSpot + spotsDrawn) % spotsToDraw;
      // then draw from start of display table to frame end
      if (spotsBudget > 0 && spotsToDraw > spotsDrawn) {
        const remaining = Math.min(spotsBudget, spotsToDraw - spotsDrawn);
        twgl.drawBufferInfo(gl, spotsBuffer, gl.POINTS, remaining);
        startSpot = (startSpot + remaining) % spotsToDraw;
      }
    }

    // draw pen spots, which are beyond spotsToDraw
    if (penSpotCount > 0) {
      params.colorIdx = 0; // don't colorize pen spots
      twgl.setUniforms(spotsProg, params);
      twgl.setBuffersAndAttributes(gl, spotsProg, spotsBuffer);
      twgl.drawBufferInfo(gl, spotsBuffer, gl.POINTS, penSpotCount, spotsToDraw);
    }

    requestAnimationFrame(display);
  }
  requestAnimationFrame(display);

  return { gui };
}

function clearPenSpots() {
  spotCount -= penSpotCount;
  penSpotCount = 0;
}

let hadPseudoLoc = false;
function penTracker() {
  const { x, y } = pen.pos;
  // remove pen spots from the end of the display table
  clearPenSpots();
  const origSpotCount = spotCount;
  const origTwinkle = params.twinkleSpots;
  params.twinkleSpots = false;
  // trackin cross with log pattern from fig 4.4 of Sketchpad thesis (pg. 58)
  const COUNT = 6; // number of spots per arm
  const START = 2.5; // inner opening
  const DENSITY = 0.25; // density of spots
  const BRIGHT = 0.4; // bright dot size for pseudo pen location
  const scale = (Math.max(5, params.spotSize) * devicePixelRatio * params.trackerSize) / 30;
  const pseudoRange = params.trackerSnap * 6; // snap to spot this close
  // find closest spot, make it the pseudo pen location
  spotsSeen.length = 0;
  let pseudoX = x,
    pseudoY = y,
    dist = Infinity;
  for (let i = 0; i < spotCount; i++) {
    const spotX = displayTable[2 * i] >> 16;
    const dx = Math.abs(x - spotX);
    if (dx > pseudoRange) continue;
    const spotY = displayTable[2 * i + 1] >> 16;
    const dy = Math.abs(y - spotY);
    if (dy > pseudoRange) continue;
    spotsSeen.push({ x: spotX, y: spotY, id: displayTable[2 * i] & 65535 });
    const d = Math.min(dx, dy);
    if (d < dist) {
      pseudoX = spotX;
      pseudoY = spotY;
      dist = d;
    }
  }
  // haptic feedback
  const hasPseudoLoc = dist < Infinity;
  if (hasPseudoLoc !== hadPseudoLoc) {
    if (hasPseudoLoc) {
      wrapper.send('prepareHaptics');
      wrapper.send('hapticImpact');
    }
    hadPseudoLoc = hasPseudoLoc;
  }
  // draw bright dot at pseudo pen location
  const r = scale * BRIGHT;
  for (const [ox, oy] of [
    [-2, -2],
    [-3, 0],
    [-2, 2],
    [0, -3],
    [0, 0],
    [0, 3],
    [2, -2],
    [3, 0],
    [2, 2],
  ]) {
    addSpot(pseudoX + ox * r, pseudoY + oy * r);
  }
  // draw arms
  for (let i = 0; i < COUNT; i++) {
    const r = (Math.log(START + i) / DENSITY) * scale;
    for (const [ox, oy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      addSpot(x + ox * r, y + oy * r);
    }
  }
  penSpotCount = spotCount - origSpotCount;
  if (hasPseudoLoc) {
    pen.pseudo.x = pseudoX;
    pen.pseudo.y = pseudoY;
  }
  params.twinkleSpots = origTwinkle;
}
