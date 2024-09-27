/*

TODOs:

* Clean up this code!
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
import { distToPoint } from './src/lib/geometry';
import { Position } from './src/types';

(window as any).constraints = constraints;
(window as any).Constraint = Constraint;
(window as any).Handle = Handle;

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

interface Line {
  a: Handle;
  b: Handle;
}

interface Arc {
  a: Handle;
  b: Handle;
  c: Handle;
}

type Thing = Line | Arc;

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
    if (!('c' in thing)) {
      // line
      addLine(handleMap.get(thing.a)!, handleMap.get(thing.b)!);
    } else {
      // arc
      addArc(handleMap.get(thing.a)!, handleMap.get(thing.b)!, handleMap.get(thing.c)!);
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

function remove(thing: Thing) {
  // TODO: also delete handles, constraints, etc.
  if ('c' in thing) {
    arcs.splice(arcs.indexOf(thing), 1);
  } else {
    lines.splice(lines.indexOf(thing), 1);
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
    case 'd':
      for (const thing of selection) {
        remove(thing);
      }
      selection.clear();
      break;
    case 'h':
      for (const line of lines) {
        if (selection.has(line)) {
          const { a, b } = line;
          const dx = Math.abs(a.x - b.x);
          const dy = Math.abs(a.y - b.y);
          if (dx <= dy) {
            constraints.equals(a.xVariable, b.xVariable);
          } else {
            constraints.equals(a.yVariable, b.yVariable);
          }
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
  // TODO: only return `true` if p is between a and b (angle-wise)
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

  hoverHandle = Handle.getNearestHandle(pointer);

  if (drawingArc) {
    (drawingArc.b ?? drawingArc.a).position = pointer;
  } else if (pointer.downPos) {
    if (draggingHandle) {
      drag(draggingHandle, { x: pointer.x, y: pointer.y });
    } else if (selection.size > 0) {
      const delta = Vec.sub(pointer, pointer.downPos);
      for (const h of getHandles(selection)) {
        drag(h, Vec.add(selectedHandleOrigPos.get(h)!, delta));
      }
    }
  }
});

canvas.addEventListener('pointerup', (e) => {
  canvas.releasePointerCapture(e.pointerId);
  pointer.downPos = null;
  selectedHandleOrigPos.clear();

  if (draggingHandle) {
    stopDragging(draggingHandle);
    draggingHandle = null;
  }

  for (const h of getHandles(selection)) {
    stopDragging(h);
  }
});

function drag(h: Handle, pos: Position) {
  const c = h.hasPin
    ? constraints.pin(h) // user moves the pin
    : constraints.finger(h); // add/update finger constraint
  c.position = pos;
}

function stopDragging(h: Handle) {
  if (!h.hasPin) {
    constraints.finger(h).remove();
  }
  addImplicitConstraints(h);
}

function render() {
  constraints.solve();

  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  requestAnimationFrame(render);
}

requestAnimationFrame(render);

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
      let label = c.distance.value.toFixed(0);
      if (label === '-0') {
        label = '0';
      }
      while (label.length < 4) {
        label = ' ' + label;
      }
      const labelWidth = ctx.measureText(label).width;
      ctx.fillText(label, (a.x + b.x) / 2 - labelWidth / 2, (a.y + b.y) / 2 + fontSizeInPixels / 2);
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
  drawLine(line.a, line.b, flickeryWhite(selection.has(line) ? 'bold' : 'normal'));
}

function drawLine(a: Position, b: Position, strokeStyle = flickeryWhite()) {
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function renderArc(arc: Arc) {
  drawArc(arc.a, arc.b, arc.c, flickeryWhite(selection.has(arc) ? 'bold' : 'normal'));
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

  ctx.strokeStyle = flickeryWhite('light');
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(a.x, a.y);
  if (b) {
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

function flickeryWhite(weight: 'light' | 'normal' | 'bold' = 'normal') {
  let baseAlpha: number;
  let multiplier: number;
  if (weight === 'normal') {
    baseAlpha = 0.35;
    multiplier = 0.3;
  } else if (weight === 'light') {
    baseAlpha = 0.1;
    multiplier = 0.05;
  } else {
    baseAlpha = 0.9;
    multiplier = 0.1;
  }
  const alpha = Math.random() * multiplier + baseAlpha;
  return `rgba(255, 255, 255, ${alpha})`;
}
