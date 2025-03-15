import 'webgl-lint'; // for debugging
import * as twgl from 'twgl.js';
import * as dat from 'dat.gui';
import * as wrapper from './wrapper';
import * as NativeEvents from './NativeEvents';
import config from './config';
import { showHideConsole } from './console';

config().usePredictedEvents = true;
config().console = true;
showHideConsole();

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
// [ ] use 8 draw calls for interlaced rendering
// [ ] use for Sketchpad drawing
// [ ] use >8bit textures for higher dynamic range

const MAX_SPOTS = 16348;     // TX-2 used 32K words for display table with double buffering
const SPOTS_PER_MS = 50;     // TX-2 could display 50K spots/sec

// Sketchpad used 36 bit words for spot locations in the display table:
// 10 bits from each of the two half-words for x and y,
// plus the remaining 16 bits as ID for lightpen

// we will use 16 bits out of the two half-words in a 64 bit word for x and y
// and 16 more bits in the x word for the spot id. The 16 bits in the y word
// are used for a spot index, which can be used to colorize spots
let displayTable = new Int32Array(MAX_SPOTS*2);
let startSpot = 0;         // start of current frame's spots in display table (50K/sec)
let spotCount = 0;         // number of spots in display table
let penSpotCount = 0;      // number of spots at the end of the table for penTracker
let spotsChanged = false;  // true if spots have changed since last frame

///////// PUBLIC API //////////

export function init(canvas: HTMLCanvasElement) {
    startup(canvas);
}

export function clearSpots() {
    spotCount = 0;
    penSpotCount = 0;
    spotsChanged = true;
}

export function addSpot(x: number, y: number, id: number = 0) {
    if (spotCount >= MAX_SPOTS) {
        console.warn(`MAX_SPOTS (${MAX_SPOTS}) reached`);
        return;
    }
    const idx = spotCount;
    let i = idx;
    if (params.twinkle) {
        const j = Math.random() * spotCount | 0;
        displayTable[2*i] = displayTable[2*j];
        displayTable[2*i+1] = displayTable[2*j+1];
        i = j;
    }
    // putting pos in the upper half makes it easy to sign-extend in the shader
    displayTable[2*i]   = x << 16 | (id & 65535);   // for pen tracking?
    displayTable[2*i+1] = y << 16 | (idx & 65535);  // for colorizing spots
    spotCount++;
    spotsChanged = true;
}

///////// DEMO //////////

const params = {
    demoSpots: 4000,
    demoSpeed: 10,
    twinkle: false,     // scramble spots for less flicker
    colorize: false,     // colorize spots by ID
    penTracker: true,   // draw pen tracker
    scissor: false,     // only draw 1024x1024 square
    fullscreen: false,
}

let prev = 0;
let phase = 0;
function step() {
    const now = Date.now();
    phase += (now - prev) * params.demoSpeed / 10000;
    prev = now;
    clearSpots();
    lissajous(400, 400, phase, 3, 4, params.demoSpots);
};
step();
setInterval(step, 50);

function lissajous(w: number, h: number, phase: number, a: number, b: number, nSpots: number) {
    for (let i = 0, angle = 0; i < nSpots; i++, angle += Math.PI * 2 / nSpots) {
        addSpot(
            Math.sin(a * angle + phase) * w,
            Math.cos(b * angle + phase) * h,
        );
    }
}

///////// IMPLEMENTATION //////////

const SPOT_VSHADER = `#version 300 es
in      ivec2 xyIdIx;          // position, id, and index of spot
uniform vec2  screenScale;     // half width/height of screen
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
        v_color = hue(float(idx) / float(colorIdx));       // color by table index
    } else {
        v_color = vec3(1.0);                               // default: white
    }
    gl_Position = vec4(vec2(pos) / screenScale, 0.0, 1.0);
    gl_PointSize = spotSize * 512.0 / max(screenScale.x, screenScale.y);
}`;

const SPOT_FSHADER = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 photons;
void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    float gauss = exp(-15.0 * dist*dist);                  // -15 works well for 8 bit color components
    if (gauss < 0.01) discard;
    // src+dst blending to accumulate photons
    photons = gauss * vec4(v_color, 1.0);
}`;

const FADE_VSHADER = `#version 300 es
in      vec2 pos;             // position, id, and index of spot
uniform vec2  screenScale;     // half width/height of screen
void main() {
    gl_Position = vec4(pos / screenScale, 0.0, 1.0);
}`;

const FADE_FSHADER = `#version 300 es
precision mediump float;
uniform float fadeAmount;
out vec4 photons;
void main() {
    vec4 color = vec4(0.0, 0.0, 0.0, fadeAmount);
    // dst*(1-src.a)) blending to fade out
    photons = color;
}`;

const uniforms = {
    spotSize: 20,
    fadeAmount: 0.5,
    screenScale: [0, 0],    // set in resize()
    colorIdx: 0,
};

function startup(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })!;
    if (!gl) throw new Error('No WebGL2 context found');

    function resize() {
        twgl.resizeCanvasToDisplaySize(canvas, devicePixelRatio);
        gl.viewport(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width/512, canvas.height/512);
        uniforms.screenScale = [canvas.width/scale, canvas.height/scale];
        if (params.scissor) {
            // only draw inner square
            const ratio = canvas.width / canvas.height;
            const left = ratio > 1 ? (canvas.width - canvas.height) / 2 : 0;
            const top = ratio < 1 ? (canvas.height - canvas.width) / 2 : 0;
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor( left, top, canvas.width - 2*left, canvas.height - 2*top);
        } else {
            gl.disable(gl.SCISSOR_TEST);
        }
    }
    onresize = () => resize();
    resize();

    const gui = new dat.GUI();
    gui.add(uniforms, 'spotSize', 1, 256);
    gui.add(uniforms, 'fadeAmount', 0, 1);
    gui.add(params, 'twinkle');
    gui.add(params, 'colorize');
    gui.add(params, 'penTracker').onChange((on: boolean) => {
        canvas.style.cursor = on ? 'none' : 'default';
        if (!on) clearPenSpots();
    });
    gui.add(params, 'demoSpots', 1, MAX_SPOTS-348); // leave room for penTracker
    gui.add(params, 'demoSpeed', 0, 100);
    gui.add(params, 'fullscreen').onChange((on: boolean) => {
        if (on) document.body.requestFullscreen();
        else document.exitFullscreen();
    });

    const penLoc = { x: 0, y: 0 };
    function updatePen(x, y) {
        const b = canvas.getBoundingClientRect();
        penLoc.x = (x - b.left - b.width/2) / b.width * 2 * uniforms.screenScale[0] | 0;
        penLoc.y = (y - b.top - b.height/2) / b.height * -2 * uniforms.screenScale[1] | 0;
    };
    canvas.onpointermove = canvas.onpointerdown = canvas.onpointerup = (e) => {
        updatePen(e.clientX, e.clientY);
    }
    function processNativeEvents() {
        for (const event of NativeEvents.getQueuedEvents()) {
            if (event.type === 'pencil') updatePen(event.position.x, event.position.y);
        }
    }

    const fadeProg = twgl.createProgramInfo(gl, [FADE_VSHADER, FADE_FSHADER]);
    const fadeArrays: twgl.Arrays = {
        pos: {
            numComponents: 2,
            data: [
                -1024, -1024, // 2x screen size
                 1024, -1024,
                 1024,  1024,
                -1024,  1024,
            ],
        },
    };
    const fadeBuffers = twgl.createBufferInfoFromArrays(gl, fadeArrays);

    const spotsProg = twgl.createProgramInfo(gl, [SPOT_VSHADER, SPOT_FSHADER]);
    const spotsArrays: twgl.Arrays = {
        xyIdIx: {
            numComponents: 2,
            data: displayTable,
        },
    };
    const spotsBuffers = twgl.createBufferInfoFromArrays(gl, spotsArrays);

    let prevTime = 0;
    function render(time: number) {
        const delta = time - prevTime;
        prevTime = time;
        let spotsThisFrame = Math.min(delta, 30) * SPOTS_PER_MS | 0;

        processNativeEvents();

        if (params.penTracker) penTracker(penLoc);

        // update spots buffer
        if (spotsChanged) {
            twgl.setAttribInfoBufferFromArray(gl,
                spotsBuffers.attribs!.xyIdIx,
                new Int32Array(displayTable.buffer, 0, spotCount*2));
            spotsChanged = false;
        }

        // render phosphor fade
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(fadeProg.program);
        twgl.setBuffersAndAttributes(gl, fadeProg, fadeBuffers);
        twgl.setUniforms(fadeProg, uniforms);
        twgl.drawBufferInfo(gl, fadeBuffers, gl.TRIANGLE_FAN);

        // render ray spots
        uniforms.colorIdx = params.colorize ? spotCount : 0;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(spotsProg.program);
        twgl.setBuffersAndAttributes(gl, spotsProg, spotsBuffers);
        twgl.setUniforms(spotsProg, uniforms);

        // draw up to end of non-pen spots in display table
        const endSpot = spotCount - penSpotCount;
        if (startSpot >= endSpot) startSpot = 0;
        const segEnd = Math.min(startSpot + spotsThisFrame, endSpot);
        const segSize = segEnd - startSpot;
        if (segSize > 0) {
            twgl.drawBufferInfo(gl, spotsBuffers, gl.POINTS, segSize, startSpot);
        }
        spotsThisFrame -= segSize;
        startSpot = segEnd;
        // draw from start of display table to frame end
        if (startSpot === endSpot && spotsThisFrame > 0) {
            const remaining = Math.min(spotsThisFrame, endSpot - segSize);
            if (remaining > 0) {
                twgl.drawBufferInfo(gl, spotsBuffers, gl.POINTS, remaining);
                startSpot = remaining;
            }
        }
        // draw pen spots
        if (penSpotCount > 0) {
            uniforms.colorIdx = 0;
            twgl.setUniforms(spotsProg, uniforms);
            twgl.drawBufferInfo(gl, spotsBuffers, gl.POINTS, penSpotCount, endSpot);
        }

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

function clearPenSpots() {
    spotCount -= penSpotCount;
    penSpotCount = 0;
}

let hadPseudoLoc = false;
function penTracker({ x, y}) {
    // remove pen spots from the end of the display table
    clearPenSpots();
    const origSpotCount = spotCount;
    const origTwinkle = params.twinkle;
    params.twinkle = false;
    // log pattern from fig 4.4 of Sketchpad thesis (pg. 58)
    const COUNT = 6;          // number of spots per arm
    const START = 2.5;        // inner opening
    const DENSITY = 0.25;      // density of spots
    const PSEUDO = 5;         // snap distance for pseudo pen location
    const BRIGHT = 0.4;       // bright dot size for pseudo pen location
    const scale = Math.max(10, uniforms.spotSize) / 5;
    const pseudoRange = scale * PSEUDO;  // snap to spot this close
    // find closest spot, make it the pseudo pen location
    let pseudoX = x, pseudoY = y, dist = Infinity;
    for (let i = 0; i < spotCount; i++) {
        const spotX = displayTable[2*i] >> 16;
        const dx = Math.abs(x - spotX);
        if (dx > pseudoRange) continue;
        const spotY = displayTable[2*i+1] >> 16;
        const dy = Math.abs(y - spotY);
        if (dy > pseudoRange) continue;
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
    for (const [ox, oy] of [[-2,-2], [-3,0], [-2,2], [0,-3], [0,0], [0,3], [2,-2], [3,0], [2,2]]) {
        addSpot(pseudoX + ox * r, pseudoY + oy * r);
    }
    // draw arms
    for (let i = 0; i < COUNT; i++) {
        const r = Math.log(START + i) / DENSITY * scale;
        for (const [ox, oy] of [[-1,0], [1,0], [0,-1], [0,1]]) {
            addSpot(x + ox * r, y + oy * r);
        }
    }
    penSpotCount = spotCount - origSpotCount;
    params.twinkle = origTwinkle;
}
