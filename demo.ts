/*

TODOs:

* Select lines by clicking on them
  - then make HORV work on lines
  - this is crucial to do the rivet demo right

* Refactor rendering / renderable code
* Better gestures to add constraints, lines, arcs, ...
* Rotation gesture
* User should be able to change fixed angles and lengths
* Lasso gesture to select handles for move / copy
* Gizmos + property pickers + plus and times nodes and wires?
* Some way to see all constraints that involve a handle so we can remove or change it.

* Higher-level architecture for constraints
  - things add constraints
  - you don't remove constraints, you remove things!
  - the set of constraints is rebuilt from scratch
  - every time you add/remove a thing

* Think about the "pins on absorbed handles" problem!
  - see Handle's togglePin method
  - solution may be to add x and y "owned variables" to Pin constraint
    (for the desired position)

*/

import Handle, { HANDLE_RADIUS } from './src/Handle';
import * as constraints from './src/constraints';
import {
  Absorb,
  Constant,
  Constraint,
  Formula,
  LinearRelationship,
  Pin,
  PolarVector,
  Variable,
  Weight,
} from './src/constraints';
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

function addLine(a: Handle, b: Handle): Line {
  const line = { a, b };
  lines.push(line);
  return line;
}

function addArc(a: Handle, b: Handle, c: Handle) {
  arcs.push({ a, b, c });
}

const pointer: Position & { downPos: Position | null } = {
  x: -1,
  y: -1,
  downPos: null,
};

const keysDown = {};

let hoverHandle: Handle | null = null;

const selectedHandles = new Map<Handle, Position>();

let copiedHandles: Handle[] | null = null;

function clearSelection() {
  selectedHandles.clear();
}

function copySelection() {
  copiedHandles = [...new Set([...selectedHandles.keys()].map((h) => h.canonicalInstance))];
}

function paste() {
  if (!copiedHandles) {
    return;
  }

  const xs = copiedHandles.map((h) => h.x);
  const ys = copiedHandles.map((h) => h.y);
  const center = {
    x: (Math.max(...xs) + Math.min(...xs)) / 2,
    y: (Math.max(...ys) + Math.min(...ys)) / 2,
  };
  const offset = Vec.sub(pointer, center);

  // console.log(
  //   'copied handles',
  //   copiedHandles.map((h) => ({ id: h.id, absorbed: [...h.absorbedHandles].map((h) => h.id) })),
  // );

  const handleMap = new Map<Handle, Handle>();
  const variableMap = new Map<Variable, Variable>();

  for (const h of copiedHandles) {
    const newH = Handle.create(Vec.add(h, offset));
    handleMap.set(h, newH);
    variableMap.set(h.xVariable, newH.xVariable);
    variableMap.set(h.yVariable, newH.yVariable);
    for (const a of h.absorbedHandles) {
      const newA = Handle.create(Vec.add(a, offset), false);
      handleMap.set(a, newA);
      variableMap.set(a.xVariable, newA.xVariable);
      variableMap.set(a.yVariable, newA.yVariable);
    }
  }

  for (const c of Constraint.all) {
    if (c instanceof PolarVector && handleMap.has(c.a) && handleMap.has(c.b)) {
      const newC = constraints.polarVector(handleMap.get(c.a)!, handleMap.get(c.b)!);
      variableMap.set(c.distance, newC.distance);
      variableMap.set(c.angle, newC.angle);
    } else if (c instanceof Weight && handleMap.has(c.handle)) {
      const newC = constraints.weight(handleMap.get(c.handle)!, c.weight.value);
      variableMap.set(c.weight, newC.weight);
    }
  }

  for (const c of Constraint.all) {
    if (c instanceof Absorb && handleMap.has(c.parent) && handleMap.has(c.child)) {
      constraints.absorb(handleMap.get(c.parent)!, handleMap.get(c.child)!);
    } else if (c instanceof LinearRelationship && variableMap.has(c.x) && variableMap.has(c.y)) {
      constraints.linearRelationship(variableMap.get(c.y)!, c.m, variableMap.get(c.x)!, c.b);
    } else if (c instanceof Constant && variableMap.has(c.variable)) {
      constraints.constant(variableMap.get(c.variable)!, c.value);
    } else if (c instanceof Pin && handleMap.has(c.handle)) {
      constraints.pin(handleMap.get(c.handle)!, Vec.add(c.position, offset));
    }
    // TODO: Formula constraint
  }

  for (const line of lines) {
    if (handleMap.has(line.a) && handleMap.has(line.b)) {
      addLine(handleMap.get(line.a)!, handleMap.get(line.b)!);
    }
  }

  for (const arc of arcs) {
    if (handleMap.has(arc.a) && handleMap.has(arc.b) && handleMap.has(arc.c)) {
      addArc(handleMap.get(arc.a)!, handleMap.get(arc.b)!, handleMap.get(arc.c)!);
    }
  }

  clearSelection();
  for (const h of handleMap.values()) {
    toggleSelected(h);
  }
}

function toggleSelected(h: Handle) {
  if (selectedHandles.has(h)) {
    selectedHandles.delete(h);
  } else {
    selectedHandles.set(h, { x: h.position.x, y: h.position.y });
  }
}

let drawingLines: Handle[] | null = null;
let drawingArc: { a: Handle; b: Handle; c: Handle; moving: Handle | null } | null = null;

window.addEventListener('keydown', (e) => {
  if (keysDown[e.key]) {
    return;
  }

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
      case 'p': {
        const h = Handle.create(pointer);
        addImplicitConstraints(h);
        drawingLines = [h];
        break;
      }
      case 'a': {
        const a = Handle.create(pointer, false);
        const b = Handle.create(pointer, false);
        const c = Handle.create(pointer, false);
        // addImplicitConstraints(c, false);
        addImplicitConstraints(c);
        drawingArc = { a, b, c, moving: a };
        addArc(a, b, c);
        break;
      }
      case 'c':
        copySelection();
        break;
      case 'v':
        paste();
        break;
      case 'h':
        for (const h1 of selectedHandles.keys()) {
          for (const h2 of selectedHandles.keys()) {
            if (h1 === h2) {
              continue;
            }
            if (Math.abs(h1.x - h2.x) < HANDLE_RADIUS * 8) {
              constraints.equals(h1.xVariable, h2.xVariable);
            }
            if (Math.abs(h1.y - h2.y) < HANDLE_RADIUS * 8) {
              constraints.equals(h1.yVariable, h2.yVariable);
            }
          }
        }
        break;
    }
  }
});

window.addEventListener('keyup', (e) => {
  delete keysDown[e.key];

  if (e.key === 'p' && drawingLines) {
    if (drawingLines.length === 1) {
      drawingLines[0].remove();
    } else {
      for (let idx = 1; idx < drawingLines.length; idx++) {
        const line = addLine(drawingLines[idx - 1], drawingLines[idx]);
        for (const h of Handle.all) {
          if (h !== line.a && h !== line.b) {
            addImplicitPointOnLineConstraint(h, line);
          }
        }
      }
    }
    drawingLines = null;
  }
});

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointer.downPos = { x: pointer.x, y: pointer.y };

  if (drawingArc?.moving) {
    if (drawingArc.moving === drawingArc.a) {
      // addImplicitConstraints(drawingArc.a);
      drawingArc.moving = drawingArc.b;
    } else {
      // addImplicitConstraints(drawingArc.b);
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

  if (drawingLines) {
    const h = Handle.create(pointer);
    addImplicitConstraints(h);
    drawingLines.push(h);
    return;
  }

  const h = Handle.getNearestHandle(pointer);
  if ('Meta' in keysDown) {
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

function addImplicitConstraints(h: Handle) {
  // TOOD: add mergeHandles as an optional arg
  // if (mergeHandles) {
  //   h.getAbsorbedByNearestHandle();
  // }

  for (const line of lines) {
    addImplicitPointOnLineConstraint(h, line);
  }

  for (const arc of arcs) {
    if (Math.abs(Vec.dist(h, arc.c) - Vec.dist(arc.a, arc.c)) < 4 * HANDLE_RADIUS) {
      // it's on an arc
      constraints.equals(
        constraints.polarVector(arc.c, h).distance,
        constraints.polarVector(arc.c, arc.a).distance,
      );
    }
  }
}

function addImplicitPointOnLineConstraint(h: Handle, line: Line) {
  if (handleIsOnLine(h, line)) {
    constraints.equals(
      constraints.polarVector(line.a, h).angle,
      constraints.polarVector(h, line.b).angle,
    );
  }
}

function handleIsOnLine(h: Handle, line: Line) {
  // h is on the line, but not near the ends
  return (
    distToPoint(line, h) < 4 * HANDLE_RADIUS &&
    Vec.dist(h, line.a) > 4 * HANDLE_RADIUS &&
    Vec.dist(h, line.b) > 4 * HANDLE_RADIUS
  );
}

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
    const d = Vec.sub(pointer, pointer.downPos);
    for (const [h, origPos] of selectedHandles.entries()) {
      const c = h.hasPin
        ? constraints.pin(h) // user moves the pin
        : constraints.finger(fingerOfGod.checked, h); // add/update finger constraint
      c.position = Vec.add(origPos, d);
    }
  }

  hoverHandle = Handle.getNearestHandle(pointer);
});

canvas.addEventListener('pointerup', (e) => {
  canvas.releasePointerCapture(e.pointerId);
  pointer.downPos = null;

  if (selectedHandles.size > 0) {
    for (const h of selectedHandles.keys()) {
      if (!h.hasPin) {
        constraints.finger(fingerOfGod.checked, h).remove();
      }
      h.getAbsorbedByNearestHandle();
    }
  }
});

function addWeight(h: Handle) {
  const weight = constraints.weight(h, 2).weight;
  weightSlider.value = weight.value;
  weightSlider.oninput = () => weight.lock(weightSlider.value);
}

interface Demo {
  init(): void;
  render(): void;
}

let demo: Demo;

const demo1 = {
  init() {},

  render() {
    ctx.lineWidth = 2;

    for (const c of Constraint.all) {
      renderConstraint(c);
    }

    if (drawingLines) {
      for (let idx = 1; idx < drawingLines.length; idx++) {
        renderLine(drawingLines[idx - 1], drawingLines[idx]);
      }
      renderLine(drawingLines[drawingLines.length - 1], pointer);
    }

    for (const line of lines) {
      renderLine(line.a, line.b);
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
      renderLine(line.a, line.b);
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
      renderLine(line.a, line.b);
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
  drawingLines = null;
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

function flickeryWhite(baseAlpha = 0.35, multiplier = 0.3) {
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

function renderLine(a: Position, b: Position) {
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

  ctx.strokeStyle = flickeryWhite(0.1, 0.05);
  ctx.moveTo(c.position.x, c.position.y);
  ctx.lineTo(a.position.x, a.position.y);
  ctx.moveTo(c.position.x, c.position.y);
  ctx.lineTo(b.position.x, b.position.y);
  ctx.stroke();
}

function distToPoint(line: { a: Position; b: Position }, point: Position) {
  return Vec.dist(point, closestPoint(line, point));
}

function isZero(n: number) {
  return Math.abs(n) < Number.EPSILON;
}

function closestPoint(line: { a: Position; b: Position }, point: Position, strict = true) {
  const { a, b } = line;
  const ab = Vec.sub(b, a);
  const ap = Vec.sub(point, a);

  // Special case for when a === b, w/o which we get NaNs.
  if (isZero(ab.x) && isZero(ab.y)) {
    // TODO: revise
    return a;
  }

  // Calculate the projection of AP onto AB
  const projection = Vec.dot(ap, ab) / Vec.dot(ab, ab);

  // Check if the projection is outside the line segment
  if (strict && projection <= 0) {
    return a;
  } else if (strict && projection >= 1) {
    return b;
  } else {
    return Vec.add(a, Vec.mulS(ab, projection));
  }
}
