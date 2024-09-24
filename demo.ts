/*

TODOs:

* Make parallel and perpendicular pick the correct angle

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

function addArc(a: Handle, b: Handle, c: Handle): Arc {
  const arc = { a, b, c };
  arcs.push(arc);
  return arc;
}

const pointer: Position & { downPos: Position | null } = {
  x: -1,
  y: -1,
  downPos: null,
};

const keysDown = {};

let hoverHandle: Handle | null = null;

type Thing = Line | Arc;
const selection = new Set<Thing>();
const selectedHandleOrigPos = new Map<Handle, Position>();

let copiedThings: Thing[] | null = null;

function copySelection() {
  copiedThings = [...selection];
}

function getHandles(things: Iterable<Thing>) {
  const handles = new Set<Handle>();
  for (const thing of things) {
    handles.add(thing.a.canonicalInstance);
    handles.add(thing.b.canonicalInstance);
    if ('c' in thing) {
      handles.add(thing.c.canonicalInstance);
    }
  }
  return handles;
}

function paste() {
  if (!copiedThings) {
    return;
  }

  const copiedHandles = getHandles(copiedThings);

  const xs = [...copiedHandles].map((h) => h.x);
  const ys = [...copiedHandles].map((h) => h.y);
  const center = {
    x: (Math.max(...xs) + Math.min(...xs)) / 2,
    y: (Math.max(...ys) + Math.min(...ys)) / 2,
  };
  const offset = Vec.sub(pointer, center);

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

  const newThings: Thing[] = [];
  for (const thing of copiedThings) {
    let newThing: Thing;
    if (!('c' in thing)) {
      // line
      newThing = addLine(handleMap.get(thing.a)!, handleMap.get(thing.b)!);
    } else {
      // arc
      newThing = addArc(handleMap.get(thing.a)!, handleMap.get(thing.b)!, handleMap.get(thing.c)!);
    }
  }

  selection.clear();
  for (const thing of newThings) {
    selection.add(thing);
  }
}

function toggleSelected(thing: Thing) {
  if (selection.has(thing)) {
    selection.delete(thing);
  } else {
    selection.add(thing);
  }
}

let draggingHandle: Handle | null = null;
let drawingLines: Handle[] | null = null;
let drawingArc: { c: Handle; a: Handle; b: Handle | null } | null = null;

window.addEventListener('keydown', (e) => {
  if (keysDown[e.key]) {
    return;
  }

  keysDown[e.key] = true;

  if (pointer.downPos) {
    return;
  }

  switch (e.key) {
    case 'l':
      for (const { a, b } of selection) {
        constraints.constant(constraints.polarVector(a, b).distance);
      }
      selection.clear();
      break;
    case 'e': {
      const lines = [...selection]; // TODO: filter so that it's only lines?
      for (let idx = 1; idx < lines.length; idx++) {
        constraints.equals(
          constraints.polarVector(lines[idx - 1].a, lines[idx - 1].b).distance,
          constraints.polarVector(lines[idx].a, lines[idx].b).distance,
        );
      }
      selection.clear();
      break;
    }
    case '/':
      if (selection.size === 2) {
        // TODO: only ok if it's two lines!
        const [line1, line2] = selection;
        // TODO: if they're not pointing the same way, use linear relationship to keep them 180 deg apart
        constraints.equals(
          constraints.polarVector(line1.a, line1.b).angle,
          constraints.polarVector(line2.a, line2.b).angle,
        );
      }
      selection.clear();
      break;
    case '.':
      if (selection.size === 2) {
        // TODO: only ok if it's two lines!
        const [line1, line2] = selection;
        // TODO: pick the nearest square angle
        constraints.linearRelationship(
          constraints.polarVector(line1.a, line1.b).angle,
          1,
          constraints.polarVector(line2.a, line2.b).angle,
          Math.PI / 2,
        );
      }
      selection.clear();
      break;
    case 'b': {
      const h = Handle.getNearestHandle(pointer);
      if (h) {
        if (h.absorbedHandles.size > 0) {
          const [a] = h.absorbedHandles;
          h.breakOff(a);
        }
      }
      break;
    }
    case 'w':
      const h = Handle.getNearestHandle(pointer);
      if (h) {
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
      const c = Handle.create(pointer);
      addImplicitConstraints(c);
      const a = Handle.create(pointer, false);
      drawingArc = { c, a, b: null };
      break;
    }
    case 'c':
      copySelection();
      break;
    case 'v':
      paste();
      break;
    case 'h':
      for (const { a, b } of selection) {
        if (Math.abs(a.x - b.x) < HANDLE_RADIUS * 25) {
          a.xVariable.value = b.xVariable.value = (a.x + b.x) / 2;
          constraints.equals(a.xVariable, b.xVariable);
        }
        if (Math.abs(a.y - b.y) < HANDLE_RADIUS * 25) {
          a.yVariable.value = b.yVariable.value = (a.y + b.y) / 2;
          constraints.equals(a.yVariable, b.yVariable);
        }
      }
      selection.clear();
      break;
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

  if (drawingArc) {
    if (!drawingArc.b) {
      addImplicitConstraints(drawingArc.a);
      drawingArc.b = Handle.create(pointer, false);
    } else {
      addImplicitConstraints(drawingArc.b);
      const arc = addArc(drawingArc.a, drawingArc.b, drawingArc.c);
      drawingArc = null;
      const r = Vec.dist(arc.c, arc.a);
      const angle = Vec.angle(Vec.sub(arc.b, arc.c));
      arc.b.position = {
        x: arc.c.x + r * Math.cos(angle),
        y: arc.c.y + r * Math.sin(angle),
      };
      constraints.equals(
        constraints.polarVector(arc.c, arc.a).distance,
        constraints.polarVector(arc.c, arc.b).distance,
      );
      for (const h of Handle.all) {
        if (h !== arc.a && h !== arc.b && h !== arc.c) {
          addImplicitPointOnArcConstraint(h, arc);
        }
      }
    }
  } else if (drawingLines) {
    const h = Handle.create(pointer);
    addImplicitConstraints(h);
    drawingLines.push(h);
  } else if ('Meta' in keysDown) {
    const h = Handle.getNearestHandle(pointer);
    if (h) {
      h.togglePin();
    }
  } else if ('Shift' in keysDown) {
    const thing = getThingNear(pointer);
    if (thing) {
      toggleSelected(thing);
    }
  } else {
    selection.clear();
    draggingHandle = Handle.getNearestHandle(pointer);
    if (!draggingHandle) {
      const thing = getThingNear(pointer);
      if (thing) {
        toggleSelected(thing);
      }
    }
  }

  selectedHandleOrigPos.clear();
  for (const h of getHandles(selection)) {
    selectedHandleOrigPos.set(h, { x: h.x, y: h.y });
  }
});

function getThingNear(p: Position) {
  for (const line of lines) {
    if (pointIsOnLine(p, line)) {
      return line;
    }
  }
  for (const arc of arcs) {
    if (pointIsOnArc(p, arc)) {
      return arc;
    }
  }
  return null;
}

function addImplicitConstraints(h: Handle) {
  h.getAbsorbedByNearestHandle();

  for (const line of lines) {
    addImplicitPointOnLineConstraint(h, line);
  }

  for (const arc of arcs) {
    addImplicitPointOnArcConstraint(h, arc);
  }
}

function addImplicitPointOnLineConstraint(h: Handle, line: Line) {
  if (pointIsOnLine(h, line)) {
    constraints.equals(
      constraints.polarVector(line.a, h).angle,
      constraints.polarVector(h, line.b).angle,
    );
  }
}

function addImplicitPointOnArcConstraint(h: Handle, arc: Arc) {
  if (pointIsOnArc(h, arc)) {
    constraints.equals(
      constraints.polarVector(arc.c, h).distance,
      constraints.polarVector(arc.c, arc.a).distance,
    );
  }
}

function pointIsOnArc(p: Position, arc: Arc) {
  return Math.abs(Vec.dist(p, arc.c) - Vec.dist(arc.a, arc.c)) < 4 * HANDLE_RADIUS;
}

function pointIsOnLine(p: Position, line: Line) {
  return (
    distToPoint(line, p) < 4 * HANDLE_RADIUS && // point is on the line...
    Vec.dist(p, line.a) > 4 * HANDLE_RADIUS && // ... but not near
    Vec.dist(p, line.b) > 4 * HANDLE_RADIUS // ... the ends
  );
}

canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e as any).layerX;
  pointer.y = (e as any).layerY;

  if (drawingArc) {
    (drawingArc.b ?? drawingArc.a).position = pointer;
  } else if (pointer.downPos) {
    if (draggingHandle) {
      draggingHandle.position = pointer;
    } else if (selection.size > 0) {
      const delta = Vec.sub(pointer, pointer.downPos);
      for (const h of getHandles(selection)) {
        const c = h.hasPin
          ? constraints.pin(h) // user moves the pin
          : constraints.finger(fingerOfGod.checked, h); // add/update finger constraint
        c.position = Vec.add(selectedHandleOrigPos.get(h)!, delta);
      }
    }
  }

  hoverHandle = Handle.getNearestHandle(pointer);
});

canvas.addEventListener('pointerup', (e) => {
  canvas.releasePointerCapture(e.pointerId);
  pointer.downPos = null;
  selectedHandleOrigPos.clear();

  if (draggingHandle) {
    addImplicitConstraints(draggingHandle);
    draggingHandle = null;
  }

  if (selection.size > 0) {
    for (const h of getHandles(selection)) {
      if (!h.hasPin) {
        constraints.finger(fingerOfGod.checked, h).remove();
      }
      addImplicitConstraints(h);
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
        drawLine(drawingLines[idx - 1], drawingLines[idx]);
      }
      drawLine(drawingLines[drawingLines.length - 1], pointer);
    }

    for (const line of lines) {
      renderLine(line);
    }

    if (drawingArc) {
      drawArc(drawingArc.a, drawingArc.b, drawingArc.c);
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
  selection.clear();
  for (const handle of Handle.all) {
    handle.remove();
  }
  draggingHandle = null;
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
  if (h !== hoverHandle) {
    return;
  }

  ctx.fillStyle = flickeryWhite();
  ctx.beginPath();
  ctx.arc(h.position.x, h.position.y, HANDLE_RADIUS, 0, TAU);
  ctx.closePath();
  ctx.fill();

  if (h === draggingHandle) {
    ctx.beginPath();
    ctx.arc(h.position.x, h.position.y, HANDLE_RADIUS + 2, 0, TAU);
    ctx.closePath();
    ctx.stroke();
  }
}

function renderLine(line: Line) {
  drawLine(line.a, line.b, selection.has(line) ? flickeryWhite(0.9, 0.1) : flickeryWhite());
}

function drawLine(a: Position, b: Position, strokeStyle = flickeryWhite()) {
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function renderArc(arc: Arc) {
  drawArc(arc.a, arc.b, arc.c, selection.has(arc) ? flickeryWhite(0.9, 0.1) : flickeryWhite());
}

function drawArc(a: Position, b: Position | null, c: Position, strokeStyle = flickeryWhite()) {
  ctx.beginPath();

  if (b) {
    ctx.strokeStyle = strokeStyle;
    const theta1 = Math.atan2(a.y - c.y, a.x - c.x);
    const theta2 = Math.atan2(b.y - c.y, b.x - c.x);
    ctx.arc(c.x, c.y, Vec.dist(c, a), theta1, theta2);
    ctx.stroke();
  }

  ctx.strokeStyle = flickeryWhite(0.1, 0.05);
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(a.x, a.y);
  if (b) {
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(b.x, b.y);
  }
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
