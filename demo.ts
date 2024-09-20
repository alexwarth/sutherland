// TODO: higher-level architecture for constraints
// - things add constraints
// - you don't remove constraints, you remove things!
// - the set of constraints is rebuilt from scratch
// - every time you add/remove a thing

// TODO: think about the pins-on-absorbed-handles problem!
// - see Handle's togglePin method

// TODO: refactor rendering / renderable code
// TODO: add handle (and line) gesture
// TODO: gestures to add constraints:
// - ...
// TODO: copy and paste
// TODO: rotation gesture
// TODO: user should be able to change fixed angles and lengths

import Handle, { HANDLE_RADIUS } from './src/Handle';
import * as constraints from './src/constraints';
import { Constraint, Pin, PolarVector, Weight } from './src/constraints';
import { TAU } from './src/helpers';
import Vec from './src/lib/vec';

(window as any).constraints = constraints;
(window as any).Constraint = Constraint;
(window as any).Handle = Handle;

const pinImage = new Image();
pinImage.src = 'pin.png';
let pinImageLoaded = false;
pinImage.onload = () => {
  console.log('pin image loaded!');
  pinImageLoaded = true;
};

const fingerOfGod = document.createElement('input') as any;
fingerOfGod.setAttribute('type', 'checkbox');
fingerOfGod.defaultChecked = false;
fingerOfGod.style.position = 'absolute';
fingerOfGod.style.top = '60px';
fingerOfGod.style.right = '30px';
// document.body.appendChild(fingerOfGod);

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

interface Position {
  x: number;
  y: number;
}

const pointer: Position & { downPos: Position | null } = {
  x: -1,
  y: -1,
  downPos: null,
};

const keysDown = {};

let hoverHandle: Handle | null = null;

const selectedHandles = new Map<Handle, Position>();

function clearSelection() {
  for (const h of selectedHandles.keys()) {
    selectedHandles.delete(h);
  }
}

function toggleSelected(h: Handle) {
  if (selectedHandles.has(h)) {
    selectedHandles.delete(h);
  } else {
    selectedHandles.set(h, { x: h.position.x, y: h.position.y });
  }
}

let prevHandle: Handle | null = null;

let drawingArc: { a: Handle; b: Handle; c: Handle; moving: Handle | null } | null = null;

window.addEventListener('keydown', (e) => {
  keysDown[e.key] = true;

  if (!pointer.downPos) {
    switch (e.key) {
      case 'x':
        if (selectedHandles.size >= 2) {
          const handles = [...selectedHandles.keys()];
          for (let idx = 1; idx < handles.length; idx++) {
            constraints.equals(handles[idx - 1].xVariable, handles[idx].xVariable);
          }
        }
        break;
      case 'y':
        if (selectedHandles.size >= 2) {
          const handles = [...selectedHandles.keys()];
          for (let idx = 1; idx < handles.length; idx++) {
            constraints.equals(handles[idx - 1].yVariable, handles[idx].yVariable);
          }
        }
        break;
      case 'l':
        const handles = [...selectedHandles.keys()];
        for (let idx = 1; idx < handles.length; idx++) {
          constraints.constant(constraints.polarVector(handles[idx - 1], handles[idx]).distance);
        }
        break;
      case 'e': {
        const handles = [...selectedHandles.keys()];
        if (handles.length === 3) {
          handles.splice(1, 0, handles[1]);
        } else if (handles.length !== 4) {
          break;
        }
        const [a, b, c, d] = handles;
        constraints.equals(
          constraints.polarVector(a, b).distance,
          constraints.polarVector(c, d).distance,
        );
        break;
      }
      case '/': {
        const handles = [...selectedHandles.keys()];
        if (handles.length === 3) {
          handles.splice(1, 0, handles[1]);
        } else if (handles.length !== 4) {
          break;
        }
        const [a, b, c, d] = handles;
        // TODO: if they're not pointing the same way, use linear relationship to keep them 180 deg apart
        constraints.equals(
          constraints.polarVector(a, b).angle,
          constraints.polarVector(c, d).angle,
        );
        break;
      }
      case '.': {
        const handles = [...selectedHandles.keys()];
        if (handles.length === 3) {
          handles.splice(1, 0, handles[1]);
        } else if (handles.length !== 4) {
          break;
        }
        const [a, b, c, d] = handles;
        constraints.linearRelationship(
          constraints.polarVector(a, b).angle,
          1,
          constraints.polarVector(c, d).angle,
          Math.PI / 2, // TODO: pick closest "45"
        );
        break;
      }
      case 'b':
        if (selectedHandles.size === 1) {
          const [h] = selectedHandles.keys();
          if (h.absorbedHandles.size > 0) {
            const [a] = h.absorbedHandles;
            h.breakOff(a);
            clearSelection();
            toggleSelected(a);
          }
        }
        break;
      case 'w':
        if (selectedHandles.size === 1) {
          const [h] = selectedHandles.keys();
          constraints.weight(h, 2);
        }
        break;
      case 'a': {
        const a = Handle.create(pointer, false);
        const b = Handle.create(pointer, false);
        const c = Handle.create(pointer, false);
        drawingArc = { a, b, c, moving: a };
        arcs.push(drawingArc);
        break;
      }
    }
  }
});

window.addEventListener('keyup', (e) => {
  delete keysDown[e.key];

  if (e.key === 'p') {
    prevHandle = null;
  }
});

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointer.downPos = { x: pointer.x, y: pointer.y };

  if (drawingArc?.moving) {
    if (drawingArc.moving === drawingArc.a) {
      drawingArc.moving = drawingArc.b;
    } else {
      const r = Vec.dist(drawingArc.c, drawingArc.a);
      const angle = Vec.angle(Vec.sub(drawingArc.b, drawingArc.c));
      drawingArc.b.position = {
        x: drawingArc.c.x + r * Math.cos(angle),
        y: drawingArc.c.y + r * Math.sin(angle),
      };
      drawingArc.moving = null;
      if (!drawingArc.moving) {
        constraints.equals(
          constraints.polarVector(drawingArc.c, drawingArc.a).distance,
          constraints.polarVector(drawingArc.c, drawingArc.b).distance,
        );
        drawingArc = null;
      }
    }
    return;
  }

  const h = Handle.getNearestHandle(pointer);
  if ('p' in keysDown) {
    const h = Handle.create(pointer);
    if (prevHandle) {
      addLine(prevHandle, h);
    }
    prevHandle = h;
  } else if ('Meta' in keysDown) {
    if (h) {
      h.togglePin();
    }
  } else if ('Shift' in keysDown) {
    if (h) {
      toggleSelected(h);
    }
  } else {
    if (h) {
      if (!selectedHandles.has(h)) {
        clearSelection();
        toggleSelected(h);
      }
    } else {
      clearSelection();
    }
  }
});

canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e as any).layerX;
  pointer.y = (e as any).layerY;

  if (drawingArc?.moving) {
    drawingArc.moving.position = pointer;
    if (drawingArc.moving === drawingArc.a) {
      // also move b
      drawingArc.b.position = pointer;
    }
    return;
  }

  if (pointer.downPos && selectedHandles.size > 0) {
    const dx = pointer.x - pointer.downPos.x;
    const dy = pointer.y - pointer.downPos.y;
    for (const [h, origPos] of selectedHandles.entries()) {
      const c = h.hasPin
        ? constraints.pin(h) // user moves the pin
        : constraints.finger(fingerOfGod.checked, h); // add/update finger constraint
      c.position = { x: origPos.x + dx, y: origPos.y + dy };
    }
  }

  hoverHandle = Handle.getNearestHandle(pointer);
});

canvas.addEventListener('pointerup', (e) => {
  canvas.releasePointerCapture(e.pointerId);
  pointer.downPos = null;

  if (selectedHandles.size > 0) {
    for (const h of selectedHandles.keys()) {
      constraints.finger(fingerOfGod.checked, h).remove();
      h.getAbsorbedByNearestHandle();
    }
  }
});

function addWeight(h: Handle) {
  const weight = constraints.weight(h, 2).weight;
  weightSlider.value = weight.value;
  weightSlider.oninput = () => weight.lock(weightSlider.value);
}

interface Line {
  a: Handle;
  b: Handle;
}

interface Arc {
  a: Handle;
  b: Handle;
  c: Handle;
}

const lines: Line[] = [];
const arcs: Arc[] = [];

function addLine(a: Handle, b: Handle) {
  lines.push({ a, b });
}

interface Demo {
  init(): void;
  render(): void;
}

let demo: Demo;

const demo1 = {
  init() {},

  render() {
    for (const c of Constraint.all) {
      renderConstraint(c);
    }

    for (const line of lines) {
      renderLine(line);
    }

    for (const arc of arcs) {
      renderArc(arc);
    }

    for (const h of Handle.all) {
      renderHandle(h);
    }
  },
};

const demo2 = {
  init() {
    const handles = [
      { x: 37, y: 44 },
      { x: 99, y: 44 },
      { x: 161, y: 45 },
      { x: 222, y: 45 },
      { x: 283, y: 47 },
      { x: 37, y: 205 },
      { x: 99, y: 147 },
      { x: 160, y: 109 },
      { x: 221, y: 86 },
      { x: 282, y: 73 },
      { x: 343, y: 72 },
      { x: 649, y: 44 },
      { x: 587, y: 44 },
      { x: 525, y: 45 },
      { x: 464, y: 45 },
      { x: 403, y: 47 },
      { x: 649, y: 205 },
      { x: 587, y: 147 },
      { x: 526, y: 109 },
      { x: 465, y: 86 },
      { x: 404, y: 73 },
    ].map((pos) => Handle.create(pos));

    const triangles = [
      [0, 5, 6],
      [0, 6, 1],
      [1, 6, 7],
      [1, 7, 2],
      [2, 7, 8],
      [2, 8, 3],
      [3, 8, 9],
      [3, 9, 4],
      [4, 9, 10],
      [11, 17, 16],
      [11, 12, 17],
      [12, 18, 17],
      [12, 13, 18],
      [13, 19, 18],
      [13, 14, 19],
      [14, 20, 19],
      [14, 15, 20],
      [15, 10, 20],
    ].map((indices) => indices.map((idx) => handles[idx]));

    for (const [a, b, c] of triangles) {
      addLine(a, b);
      addLine(b, c);
      addLine(c, a);
      constraints.polarVector(a, b).distance.lock();
      constraints.polarVector(b, c).distance.lock();
      constraints.polarVector(c, a).distance.lock();
    }

    constraints.pin(handles[0]);
    constraints.pin(handles[5]);
    constraints.pin(handles[11]);
    constraints.pin(handles[16]);

    const weightHandle = Handle.create({ x: 343, y: 150 });
    addLine(handles[10], weightHandle);
    constraints.polarVector(handles[10], weightHandle).distance.lock();
    addWeight(weightHandle);
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

    for (const line of lines) {
      renderLine(line);
    }

    for (const arc of arcs) {
      renderArc(arc);
    }

    for (const h of Handle.all) {
      renderHandle(h);
    }
  },
};

interface Part {
  a: Handle;
  b: Handle;
  c: Handle;
  d: Handle;
}

const adjustLabelPosition = new Set<Constraint>();

const demo3 = {
  init() {
    let lastPart: Part | null = null;
    for (let idx = 0; idx < 6; idx++) {
      const part = this.makePart(
        lastPart ? lastPart.c : Handle.create({ x: 50, y: 50 }),
        lastPart ? lastPart.d : Handle.create({ x: 50, y: 150 }),
      );
      if (!lastPart) {
        constraints.pin(part.b);
      }
      if (idx === 1) {
        const weightHandle = Handle.create({ x: part.d.x, y: part.d.y + 150 });
        constraints.polarVector(part.d, weightHandle).distance.lock();
        addLine(part.d, weightHandle);
        const weight = constraints.weight(weightHandle, 2).weight;
        weightSlider.value = weight.value;
        weightSlider.oninput = () => weight.lock(weightSlider.value);
      }
      lastPart = part;
    }
    addLine(lastPart!.c, lastPart!.d);
    constraints.polarVector(lastPart!.c, lastPart!.d).distance.lock();
    constraints.pin(lastPart!.d);
  },

  makePart(a: Handle, b: Handle): Part {
    const c = Handle.create({ x: a.x + 100, y: a.y });
    const d = Handle.create({ x: b.x + 100, y: b.y });
    constraints.polarVector(a, b).distance.lock();
    constraints.polarVector(a, c).distance.lock();
    constraints.polarVector(b, c).distance.lock();
    constraints.polarVector(b, d).distance.lock();
    constraints.polarVector(a, d).distance.lock();
    addLine(a, b);
    addLine(a, c);
    addLine(b, c);
    addLine(b, d);
    addLine(a, d);
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

    for (const line of lines) {
      renderLine(line);
    }

    for (const h of Handle.all) {
      renderHandle(h);
    }
  },
};

const demos = [demo1, demo2, demo3];

function toggleDemo() {
  adjustLabelPosition.clear();
  for (const constraint of Constraint.all) {
    constraint.remove();
  }
  clearSelection();
  for (const handle of Handle.all) {
    handle.remove();
  }
  prevHandle = null;
  while (lines.length > 0) {
    lines.pop();
  }
  while (arcs.length > 0) {
    arcs.pop();
  }

  const demoIdx = demos.indexOf(demo);
  demo = demos[(demoIdx + 1) % demos.length];
  demo.init();
}

toggleDemo();

function render() {
  constraints.solve();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  demo.render();

  requestAnimationFrame(render);
}

function drawRotated(image: HTMLImageElement, degrees: number, x: number, y: number) {
  ctx.save();
  ctx.globalAlpha = Math.random() * 0.2 + 0.7;
  ctx.translate(x, y);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

requestAnimationFrame(render);

function flickeryWhite(baseAlpha = 0.5, multiplier = 0.3) {
  const alpha = Math.random() * multiplier + baseAlpha;
  return `rgba(255, 255, 255, ${alpha})`;
}

function renderConstraint(c: Constraint) {
  if (c instanceof PolarVector) {
    const { a, b } = c;

    // TODO: show label when distance is in equality relation w/ another distance
    // TODO: show angles
    // etc.

    // label
    if (c.distance.isLocked) {
      ctx.fillStyle = flickeryWhite();
      const fontSizeInPixels = 12;
      ctx.font = `${fontSizeInPixels}px Major Mono Display`;
      const value =
        demo === demo1
          ? c.distance.value
          : ((c.distance.value - Vec.dist(a, b)) / c.distance.value) * 10000;
      let label = value.toFixed(0);
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
          (a.y + 2 * b.y) / 3 + fontSizeInPixels / 2,
        );
      } else {
        ctx.fillText(
          label,
          (a.x + b.x) / 2 - labelWidth / 2,
          (a.y + b.y) / 2 + fontSizeInPixels / 2,
        );
      }
    }
  } else if (c instanceof Weight) {
    ctx.strokeStyle = flickeryWhite();
    ctx.beginPath();
    ctx.arc(c.handle.x, c.handle.y, HANDLE_RADIUS * 2, 0, TAU);
    ctx.closePath();
    ctx.stroke();
  } else if (c instanceof Pin) {
    ctx.fillStyle = flickeryWhite();
    ctx.beginPath();
    ctx.arc(c.position.x, c.position.y, HANDLE_RADIUS / 2, 0, TAU);
    ctx.closePath();
    ctx.fill();
    const oldLineWidth = ctx.lineWidth;
    ctx.lineWidth = 2;
    ctx.moveTo(c.position.x, c.position.y);
    ctx.lineTo(c.position.x + HANDLE_RADIUS * 2, c.position.y - HANDLE_RADIUS * 3);
    ctx.stroke();
    ctx.lineWidth = oldLineWidth;
  }
}

function renderHandle(h: Handle) {
  const isSelected = selectedHandles.has(h);

  if (h !== hoverHandle && !isSelected) {
    return;
  }

  ctx.fillStyle = flickeryWhite();
  ctx.beginPath();
  ctx.arc(h.position.x, h.position.y, HANDLE_RADIUS, 0, TAU);
  ctx.closePath();
  ctx.fill();

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(h.position.x, h.position.y, HANDLE_RADIUS + 2, 0, TAU);
    ctx.closePath();
    ctx.stroke();
  }
}

function renderLine({ a, b }: Line) {
  ctx.strokeStyle = flickeryWhite();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function renderArc({ a, b, c }: Arc) {
  ctx.fillStyle = flickeryWhite();
  ctx.beginPath();

  ctx.strokeStyle = flickeryWhite();
  const theta1 = Math.atan2(a.position.y - c.position.y, a.position.x - c.position.x);
  const theta2 = Math.atan2(b.position.y - c.position.y, b.position.x - c.position.x);
  ctx.arc(c.position.x, c.position.y, Vec.dist(c, a), theta1, theta2);
  ctx.stroke();

  ctx.strokeStyle = flickeryWhite(0.1, 0.3);
  ctx.moveTo(c.position.x, c.position.y);
  ctx.lineTo(a.position.x, a.position.y);
  ctx.moveTo(c.position.x, c.position.y);
  ctx.lineTo(b.position.x, b.position.y);
  ctx.stroke();
}
