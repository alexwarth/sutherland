// import 'webgl-lint'; // for debugging
import * as twgl from 'twgl.js';
import * as dat from 'dat.gui';

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
// [ ] use for Sketchpad drawing
// [ ] use >8bit textures for higher dynamic range

const MAX_SPOTS = 16348;     // TX-2 used 32K for display table with double buffering

// Sketchpad used 36 bit words for spot locations in the display table:
// 10 bits from each of the two half-words for x and y,
// plus the remaining 16 bits as ID for lightpen

// we will use 10 bits out of the two half-words in a 32 bit word for x and y
const displayTable = new Int16Array(MAX_SPOTS*2);
let numSpots = 0;

///////// PUBLIC API //////////

export function init(canvas: HTMLCanvasElement) {
    startup(canvas);
}

export function clearSpots() {
    numSpots = 0;
}

export function addSpot(x: number, y: number) {
    displayTable[2*numSpots] = x;
    displayTable[2*numSpots+1] = y;
    numSpots++;
}

///////// IMPLEMENTATION //////////

const VERT_SHADER = `
attribute vec2 position;        // position of spot
uniform vec2 screenScale;       // half width/height of screen
uniform float spotSize;        // size of spot

void main() {
  gl_Position = vec4(position / screenScale, 0.0, 1.0);
  gl_PointSize = spotSize;
}`;

const SPOT_SHADER = `
precision mediump float;
void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    float gauss = exp(-dist * 10.0);
    if (gauss < 0.01) discard;
    // src+dst blending to accumulate photons
    gl_FragColor = gauss * vec4(1.0);
}`;

const FADE_SHADER = `
precision mediump float;
uniform float fadeAmount;
void main() {
    vec4 color = vec4(0.0, 0.0, 0.0, fadeAmount);
    // dst*(1-src.a)) blending to fade out
    gl_FragColor = color;
}`;

const uniforms = {
    spotSize: 15,
    screenScale: [512, 512],
    fadeAmount: 0.2,
};

const params = {
    spots: 4000,
    speed: 10,
    penTracker: true,
    fullscreen: false,
}

function startup(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })!;
    if (!gl) throw new Error('No WebGL2 context found');

    function resize() {
        twgl.resizeCanvasToDisplaySize(canvas, devicePixelRatio);
        gl.viewport(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width/512, canvas.height/512);
        uniforms.screenScale = [canvas.width/scale, canvas.height/scale];
        // only draw inner square
        const ratio = canvas.width / canvas.height;
        const left = ratio > 1 ? (canvas.width - canvas.height) / 2 : 0;
        const top = ratio < 1 ? (canvas.height - canvas.width) / 2 : 0;
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor( left, top, canvas.width - 2*left, canvas.height - 2*top);
    }
    onresize = () => resize();
    resize();

    const gui = new dat.GUI();
    gui.add(uniforms, 'spotSize', 1, 512);
    gui.add(uniforms, 'fadeAmount', 0, 1);
    gui.add(params, 'spots', 1, MAX_SPOTS);
    gui.add(params, 'speed', 0, 100);
    gui.add(params, 'penTracker').onChange((on: boolean) => {
        canvas.style.cursor = on ? 'none' : 'default';
    });
    gui.add(params, 'fullscreen').onChange((on: boolean) => {
        if (on) document.body.requestFullscreen();
        else document.exitFullscreen();
    });

    const penLoc = { x: 0, y: 0 };
    canvas.onpointerdown = (e) => e.preventDefault();
    canvas.onpointermove = (e) => {
        const b = canvas.getBoundingClientRect();
        penLoc.x = (e.clientX - b.left - b.width/2) / b.width * 2 * uniforms.screenScale[0] | 0;
        penLoc.y = (e.clientY - b.top - b.height/2) / b.height * -2 * uniforms.screenScale[1] | 0;
    };
    canvas.focus();

    const fadeProg = twgl.createProgramInfo(gl, [VERT_SHADER, FADE_SHADER]);
    const fadeArrays: twgl.Arrays = {
        position: {
            numComponents: 2,
            data: [-512, -512, 512, -512, 512, 512, -512, 512],
        },
    };
    const fadeBuffers = twgl.createBufferInfoFromArrays(gl, fadeArrays);

    const spotsProg = twgl.createProgramInfo(gl, [VERT_SHADER, SPOT_SHADER]);
    const spotsArrays: twgl.Arrays = {
        position: {
            numComponents: 2,
            data: displayTable,
        },
    };
    const spotsBuffers = twgl.createBufferInfoFromArrays(gl, spotsArrays);

    let phase = 0;
    let prevTime = 0;
    function render(time: number) {
        if (!spotsBuffers.attribs) throw new Error('No buffer attribs');
        phase += (time - prevTime) * params.speed / 10000;
        prevTime = time;

        // start add spots
        clearSpots();
        if (params.penTracker) penTracker(penLoc.x, penLoc.y);
        lissajous(400, 400, phase, 3, 4, params.spots);
        // end add spots

        // update spots buffer
        twgl.setAttribInfoBufferFromArray(gl,
            spotsBuffers.attribs.position,
            new Int16Array(displayTable.buffer, 0, numSpots*2));

        // render phosphor fade
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(fadeProg.program);
        twgl.setBuffersAndAttributes(gl, fadeProg, fadeBuffers);
        twgl.setUniforms(fadeProg, uniforms);
        twgl.drawBufferInfo(gl, fadeBuffers, gl.TRIANGLE_FAN);

        // render ray spots
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(spotsProg.program);
        twgl.setBuffersAndAttributes(gl, spotsProg, spotsBuffers);
        twgl.setUniforms(spotsProg, uniforms);
        twgl.drawBufferInfo(gl, spotsBuffers, gl.POINTS, numSpots);

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

function penTracker(x: number, y: number) {
    // log pattern from fig 4.4 of Sketchpad thesis (pg. 58)
    const count = 6;          // number of spots per arm
    const start = 1.8;        // inner opening
    const density = 1.3;      // density of spots
    const scale = Math.max(20, uniforms.spotSize);
    for (let i = 0; i < count; i++) {
        const r = Math.log(start + i) / density;
        for (const [ox, oy] of [[-1,0], [1,0], [0,-1], [0,1]]) {
            addSpot(
                x + ox * scale * r,
                y + oy * scale * r,
            );
        }
    }
}

function lissajous(w: number, h: number, phase: number, a: number, b: number, nSpots: number) {
    for (let i = 0, angle = 0; i < nSpots; i++, angle += Math.PI * 2 / nSpots) {
        addSpot(
            Math.sin(a * angle + phase) * w,
            Math.cos(b * angle + phase) * h,
        );
    }
}
