import * as display from './display';
import { set } from './status';

export function start(canvas: HTMLCanvasElement) {
    const { gui } = display.init(canvas, {
        showGui: true,
        openGui: true,
    });

    const demo = {
        demoMulX: 3,
        demoMulY: 4,
        demoRotation: 10,
    };

    gui.add(demo, 'demoMulX', 1, 10);
    gui.add(demo, 'demoMulY', 1, 10);
    gui.add(demo, 'demoRotation', 0, 50);
    // shorter side is -512 to 512
    const scale = Math.min(canvas.offsetWidth, canvas.offsetHeight) / 1024;

    canvas.onmousemove = canvas.onmousedown = canvas.onmouseup = (e) => {
        const x = (e.offsetX - canvas.offsetWidth / 2) / scale;
        const y = (canvas.offsetHeight / 2 - e.offsetY) / scale;
        display.setPen(x, y);
    }

    let paramHash = '';
    function paramsChanged() {
        const hash = demo.demoMulX + ',' + demo.demoMulY + ',' + display.getParam('spotSize') + display.getParam('spotDensity');
        if (hash === paramHash) return false;
        paramHash = hash;
        return true;
    }

    let prev = 0;
    let phase = 0;
    function animate() {
        const ms = 2000 / (demo.demoRotation || 1);
        const now = Date.now();
        if (now - prev < ms && !paramsChanged()) return;
        phase += (now - prev) * demo.demoRotation / 100000;
        prev = now;
        display.clearSpots();
        lissajous(400, 400, phase, 0, demo.demoMulX|0, demo.demoMulY|0, display.getParam('spotSize') / display.getParam('spotDensity'));
        let mulX = demo.demoMulX;
        let mulY = demo.demoMulY;
        let density = display.getParam('spotDensity');
    };

    setInterval(animate, 1000 / 20);
}

function lissajous(
    w: number,
    h: number,
    phaseX: number,
    phaseY: number,
    a: number,
    b: number,
    density: number,
) {
    const nSpots = Math.min(8000 / density, 16000)
    for (let i = 0; i < nSpots; i++) {
        const angle = (i * Math.PI * 2) / nSpots;
        const x = (Math.sin(a * angle + phaseX) * w) | 0;
        const y = (Math.cos(b * angle + phaseY) * h) | 0;
        display.addSpot(x, y);
    }
}
