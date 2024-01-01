import Handle from './Handle';
import * as constraints from './constraints';
import { Constraint, Pin, PolarVector, Weight } from './constraints';
import Vec from './lib/vec';

const pinImage = new Image();
pinImage.src = 'pin.png';
let pinImageLoaded = false;
pinImage.onload = () => {
  console.log('pin image loaded!');
  pinImageLoaded = true;
};

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
initCanvas();

function initCanvas() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;

  // setup the canvas for device-independent pixels
  if (devicePixelRatio !== 1) {
    const oldW = canvas.width;
    const oldH = canvas.height;

    canvas.width = oldW * devicePixelRatio;
    canvas.height = oldH * devicePixelRatio;
    canvas.style.width = oldW + 'px';
    canvas.style.height = oldH + 'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
  }
}

let handleUnderMouse: Handle | null = null;

canvas.addEventListener('mousedown', e => {
  handleUnderMouse = Handle.getNearestHandle({ x: (e as any).layerX, y: (e as any).layerY });
  if (handleUnderMouse) {
    constraints.finger(handleUnderMouse);
  }
});

canvas.addEventListener('mousemove', e => {
  if (handleUnderMouse) {
    const finger = constraints.finger(handleUnderMouse);
    finger.position = { x: (e as any).layerX, y: (e as any).layerY };
  }
});

canvas.addEventListener('mouseup', e => {
  if (handleUnderMouse) {
    constraints.finger(handleUnderMouse).remove();
    handleUnderMouse = null;
  }
});

const toggleDemoButton = document.createElement('button');
toggleDemoButton.textContent = 'toggle demo';
toggleDemoButton.style.position = 'absolute';
toggleDemoButton.style.top = '30px';
toggleDemoButton.style.right = '30px';
toggleDemoButton.onclick = toggleDemo;
document.body.appendChild(toggleDemoButton);

// typecast weightSlider to `any` to get the typechecker to shut up!
const weightSlider = document.createElement('input') as any;
weightSlider.setAttribute('type', 'range');
weightSlider.min = 0;
weightSlider.max = 5;
weightSlider.step = 0.01;
weightSlider.style.position = 'absolute';
weightSlider.style.top = '2px';
weightSlider.style.right = '30px';
document.body.appendChild(weightSlider);

interface Demo {
  init(): void;
  render(): void;
}

let demo: Demo;

const demo1 = {
  init() {
    const handles = [
        {x: 37, y: 44},
        {x: 99, y: 44},
        {x: 161, y: 45},
        {x: 222, y: 45},
        {x: 283, y: 47},
        {x: 37, y: 205},
        {x: 99, y: 147},
        {x: 160, y: 109},
        {x: 221, y: 86},
        {x: 282, y: 73},
        {x: 343, y: 72},
        {x: 649, y: 44},
        {x: 587, y: 44},
        {x: 525, y: 45},
        {x: 464, y: 45},
        {x: 403, y: 47},
        {x: 649, y: 205},
        {x: 587, y: 147},
        {x: 526, y: 109},
        {x: 465, y: 86},
        {x: 404, y: 73}
    ].map(pos => Handle.create(pos));

    const triangles = [
        [0,5,6],
        [0,6,1],
        [1,6,7],
        [1,7,2],
        [2,7,8],
        [2,8,3],
        [3,8,9],
        [3,9,4],
        [4,9,10],
        [11,17,16],
        [11,12,17],
        [12,18,17],
        [12,13,18],
        [13,19,18],
        [13,14,19],
        [14,20,19],
        [14,15,20],
        [15,10,20]
    ].map(indices => indices.map(idx => handles[idx]));

    for (const [a, b, c] of triangles) {
      constraints.polarVector(a, b).distance.lock();
      constraints.polarVector(b, c).distance.lock();
      constraints.polarVector(c, a).distance.lock();
    }

    constraints.pin(handles[0]);
    constraints.pin(handles[5]);
    constraints.pin(handles[11]);
    constraints.pin(handles[16]);

    const weightHandle = Handle.create({x: 343, y: 150});
    constraints.polarVector(handles[10], weightHandle).distance.lock();
    const weight = constraints.weight(weightHandle, 2).weight;
    weightSlider.value = weight.value;
    weightSlider.oninput = () => weight.lock(weightSlider.value)
  
    weightSlider.style.right = '30px';
    document.body.appendChild(weightSlider);
  },

  render() {
    // left
    drawRotated(pinImage, 0, 29, 42);
    drawRotated(pinImage, -60, 30, 210);

    // right
    drawRotated(pinImage, 180, 658, 47);
    drawRotated(pinImage, -120, 650, 212);
  
    for (const c of Constraint.all) {
      renderConstraint(c);
    }
  }
};

interface Part {
  a: Handle;
  b: Handle;
  c: Handle;
  d: Handle;
}

const adjustLabelPosition = new Set<Constraint>();

const demo2 = {
  init() {
    let lastPart: Part | null = null;
    for (let idx = 0; idx < 6; idx++) {
      const part = this.makePart(
        lastPart ? lastPart.c : Handle.create({x: 50, y: 50}),
        lastPart ? lastPart.d : Handle.create({x: 50, y: 150})
      );
      if (!lastPart) {
        constraints.pin(part.b);
      }
      if (idx === 1) {
        const weightHandle = Handle.create({x: part.d.x, y: part.d.y + 150 });
        constraints.polarVector(part.d, weightHandle).distance.lock();
        const weight = constraints.weight(weightHandle, 2).weight;
        weightSlider.value = weight.value;
        weightSlider.oninput = () => weight.lock(weightSlider.value)
      }
      lastPart = part;
    }
    constraints.polarVector(lastPart!.c, lastPart!.d).distance.lock();
    constraints.pin(lastPart!.d);
  },

  makePart(a: Handle, b: Handle): Part {
    const c = Handle.create({ x: a.x + 100, y: a.y});
    const d = Handle.create({ x: b.x + 100, y: b.y});
    constraints.polarVector(a, b).distance.lock();
    constraints.polarVector(a, c).distance.lock();
    constraints.polarVector(b, c).distance.lock();
    constraints.polarVector(b, d).distance.lock();
    constraints.polarVector(a, d).distance.lock();
    adjustLabelPosition.add(constraints.polarVector(a, d));
    adjustLabelPosition.add(constraints.polarVector(b, c));
    return { a, b, c, d };
  },

  render() {
    drawRotated(pinImage, -90, 47, 157);
    drawRotated(pinImage, -90, 647, 157);
  
    for (const c of Constraint.all) {
      renderConstraint(c);
    } 
  }
};

function toggleDemo() {
  adjustLabelPosition.clear();
  for (const constraint of Constraint.all) {
    constraint.remove();
  }
  for (const handle of Handle.all) {
    handle.remove();
  }

  demo = demo === demo1 ? demo2 : demo1;
  demo.init();
}

toggleDemo();

function render() {
  constraints.solve(25);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  demo.render();

  requestAnimationFrame(render);
}

function drawRotated(image: HTMLImageElement, degrees: number, x: number, y: number) {
  ctx.save();
  ctx.globalAlpha = Math.random() * 0.2 + 0.7;
  ctx.translate(x, y);
  ctx.rotate(degrees * Math.PI / 180);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

requestAnimationFrame(render);

function flickeryWhite() {
  const alpha = Math.random() * 0.3 + 0.5;
  return `rgba(255, 255, 255, ${alpha})`;
}

function renderConstraint(c: Constraint) {
  if (c instanceof PolarVector) {
    const { a, b } = c;

    // line
    ctx.strokeStyle = flickeryWhite();
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
    ctx.stroke();

    // label
    ctx.fillStyle = flickeryWhite();
    const fontSizeInPixels = 12;
    ctx.font = `${fontSizeInPixels}px Major Mono Display`;
    const delta = (c.distance.value - Vec.dist(a, b)) / c.distance.value * 10000;
    let label = delta.toFixed(0);
    if (label === '-0') {
      label = '0';
    }
    while (label.length < 4) {
      label = ' ' + label;
    }
    const labelWidth = ctx.measureText(label).width;
    if (adjustLabelPosition.has(c)) {
      ctx.fillText(
        label,
        (a.x + 2 * b.x) / 3 - labelWidth / 2,
        (a.y + 2 * b.y) / 3 + fontSizeInPixels / 2
      );
    } else {
      ctx.fillText(
        label,
        (a.x + b.x) / 2 - labelWidth / 2,
        (a.y + b.y) / 2 + fontSizeInPixels / 2
      );
    }
  } else if (c instanceof Weight) {
    // ctx.fillStyle = flickeryWhite();
    // ctx.beginPath();
    // ctx.arc(c.handle.x, c.handle.y, HANDLE_RADIUS, 0, TAU);
    // ctx.closePath();
    // ctx.fill();
  } else if (c instanceof Pin) {
    // ctx.fillStyle = flickeryWhite();
    // ctx.beginPath();
    // ctx.arc(c.position.x, c.position.y, HANDLE_RADIUS, 0, TAU);
    // ctx.closePath();
    // ctx.fill();
  }
}
