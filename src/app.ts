import config from './config';
import scope from './scope';
import * as status from './status';
import * as display from './display';
import * as raster from './raster';
import { drawArc, drawLine, drawPoint, drawText, flickeryWhite } from './canvas';
import { letterDrawings } from './font';
import { Drawing } from './Drawing';
import { Position, TAU } from './helpers';
import { Handle, Instance, Line, Thing } from './things';
import { EqualDistanceConstraint } from './constraints';
import { Var } from './state';

// TODO: finish direction-based improvements to arcs
// TODO: equal length should work for lines and arcs (and combinations!) (el)
// TODO: use hover for drawing lines, pencil down starts new segment (marcel)
// TODO: refactor so that we can make more than one sketchpad
// TODO: vcr-like undo interface (w/ worlds)

// ---------- pen ----------

let pos: Position | null = null;

export const pen = {
  get pos(): Position | null {
    return pos;
  },

  snapPos(dragThing?: Thing, snapPos?: Position) {
    return pos ? drawing().snap(pos, dragThing, snapPos) : null;
  },

  moveToScreenPos(screenPos: Position) {
    const p = scope.fromScreenPosition(screenPos);
    if (!pos) {
      pos = p;
    } else {
      pos.x = p.x;
      pos.y = p.y;
    }
    maybeUpdateArcDirection();
  },

  clearPos() {
    pos = null;
  },
};

function doWithoutMovingPointer(fn: () => void) {
  if (!pen.pos) {
    fn();
    return;
  }

  const penScreenPos = scope.toScreenPosition(pen.pos);
  fn();
  ({ x: pen.pos.x, y: pen.pos.y } = scope.fromScreenPosition(penScreenPos));
}

// ---------- drawings ----------

export const drawings: { [key: string]: Drawing } = {};
for (let idx = 1; idx < 10; idx++) {
  drawings['' + idx] = new Drawing();
}

let _drawing = new Var(drawings['1']);
(window as any).drawing = _drawing;

export function drawing(id?: string) {
  return id ? (drawings[id] ?? letterDrawings.get(id)) : _drawing.value;
}
(window as any).drawing = drawing;

export function switchToDrawing(id: string) {
  const d = drawing(id);
  if (!d || d === drawing()) {
    return;
  }

  drawing().leave();
  _drawing.value = d;
  doWithoutMovingPointer(() => scope.reset());
  endEqualLength();
  status.set('drawing #' + id);
}

const allDrawings = [...Object.values(drawings), ...letterDrawings.values()];

// ---------- drawing in progress ----------

let drawingInProgress:
  | { type: 'line'; start: Position }
  | { type: 'arc'; positions: Position[]; prevAngle?: number; cummRotation?: number }
  | null = null;

export function moreLines() {
  if (!pen.pos) {
    return;
  }

  const pos = { x: pen.pos.x, y: pen.pos.y };
  if (drawingInProgress?.type === 'line') {
    drawing().addLine(drawingInProgress.start, pos);
  }
  drawingInProgress = {
    type: 'line',
    start: pos,
  };
}

export function endLines() {
  if (drawingInProgress?.type === 'line') {
    drawingInProgress = null;
  }
}

export function moreArc() {
  if (!pen.pos) {
    return;
  }

  if (drawingInProgress?.type !== 'arc') {
    drawingInProgress = { type: 'arc', positions: [], cummRotation: 0 };
  }
  drawingInProgress.positions.push({ x: pen.pos.x, y: pen.pos.y });
  if (drawingInProgress.positions.length === 3) {
    const [c, a, b] = drawingInProgress.positions;
    drawing().addArc(a, b, c, drawingInProgress.cummRotation! < 0 ? 'cw' : 'ccw');
    drawingInProgress = null;
  }
}

function maybeUpdateArcDirection() {
  if (
    !drawingInProgress ||
    drawingInProgress.type !== 'arc' ||
    drawingInProgress.positions.length !== 2 ||
    !pen.pos
  ) {
    return;
  }

  const [c, a] = drawingInProgress.positions;
  pen.snapPos(undefined, a); // TODO: haptic feedback! (needs refactoring?)

  const angle = Math.atan2(pen.pos.y - c.y, pen.pos.x - c.x);
  if (!drawingInProgress.prevAngle) {
    drawingInProgress.prevAngle = angle;
    drawingInProgress.cummRotation = 0;
    return;
  }

  // prevAngle = pi - .0001
  // angle = -pi + .0001
  // naive diff = -2pi + .0002
  // want diff to be .0002
  let diff = angle - drawingInProgress.prevAngle;
  if (diff > Math.PI) {
    diff -= TAU;
  } else if (diff < -Math.PI) {
    diff += TAU;
  }
  drawingInProgress.cummRotation! += diff;
  drawingInProgress.prevAngle = angle;
  // console.log('cr', drawingInProgress.cummRotation);
}

export function endArc() {
  if (drawingInProgress?.type === 'arc') {
    drawingInProgress = null;
  }
}

// ---------- attachers ----------

function removeAttacher(m: Drawing, a: Handle) {
  drawing().attachers.removeAll((attacher) => attacher === a);
  for (const d of Object.values(drawings)) {
    d.onAttacherRemoved(m, a);
  }
}

function addAttacher(m: Drawing, a: Handle) {
  m.attachers.unshift(a);
  for (const d of Object.values(drawings)) {
    d.onAttacherAdded(m, a);
  }
}

// ---------- work done on every frame ----------

export function onFrame() {
  if (config().autoSolve) {
    const t0 = performance.now();
    let n = 0;
    while (performance.now() - t0 < 20 && drawing().relax()) {
      n++;
    }
  }
}

// ---------- rendering ----------

let prevSpotCount = 0;

export function render() {
  display.clearSpots();
  if (!drawingInProgress && drawing().isEmpty()) {
    renderInk();
  }
  renderDrawingInProgress();
  raster.clear();
  drawing().render();
  raster.rasterize();
  renderCrosshairs();

  const spotCount = display.getSpotCount();
  if (spotCount != prevSpotCount) {
    prevSpotCount = spotCount;
    status.set(`${spotCount} spots`);
  }

  status.render();
  renderDebugInfo();
}

function renderInk() {
  const unit = innerWidth / 100;
  const line = (p1: Position, p2: Position) =>
    drawLine(p1, p2, flickeryWhite(), scope.toScreenPosition);

  // I
  line({ x: -7 * unit, y: -4 * unit }, { x: -7 * unit, y: 4 * unit });
  // N
  line({ x: -3 * unit, y: -4 * unit }, { x: -3 * unit, y: 4 * unit });
  line({ x: -3 * unit, y: 4 * unit }, { x: 2 * unit, y: -4 * unit });
  line({ x: 2 * unit, y: -4 * unit }, { x: 2 * unit, y: 4 * unit });
  // K
  line({ x: 6 * unit, y: -4 * unit }, { x: 6 * unit, y: 4 * unit });
  line({ x: 6 * unit, y: 1 * unit }, { x: 10 * unit, y: 4 * unit });
  line({ x: 8 * unit, y: 2.4 * unit }, { x: 10 * unit, y: -4 * unit });
}

function renderDrawingInProgress() {
  switch (drawingInProgress?.type) {
    case 'line':
      if (pen.pos) {
        drawLine(drawingInProgress.start, pen.pos, flickeryWhite(), scope.toScreenPosition);
      }
      break;
    case 'arc':
      if (config().showControlPoints) {
        for (const cp of drawingInProgress.positions) {
          drawPoint(cp, config().controlPointColor, scope.toScreenPosition);
        }
      }
      if (
        drawingInProgress.positions.length == 2 &&
        pen.pos &&
        drawingInProgress.cummRotation !== undefined &&
        Math.abs(drawingInProgress.cummRotation) > 0.05
      ) {
        drawArc(
          drawingInProgress.positions[0],
          drawingInProgress.positions[1],
          pen.pos,
          drawingInProgress.cummRotation < 0 ? 'cw' : 'ccw',
          flickeryWhite(),
          scope.toScreenPosition,
        );
      }
      break;
  }
}

function renderCrosshairs() {
  if (!pen.pos) {
    return;
  }

  const tpen = scope.toScreenPosition(pen.pos);
  drawLine(
    { x: tpen.x - config().crosshairsSize, y: tpen.y },
    { x: tpen.x + config().crosshairsSize, y: tpen.y },
    "red",
  );
  drawLine(
    { x: tpen.x, y: tpen.y - config().crosshairsSize },
    { x: tpen.x, y: tpen.y + config().crosshairsSize },
    "red"
  );
}

function renderDebugInfo() {
  if (!config().debug) {
    return;
  }

  // draw axes
  const origin = scope.toScreenPosition({ x: 0, y: 0 });
  drawLine({ x: 0, y: origin.y }, { x: innerWidth, y: origin.y }, config().axisColor);
  drawLine({ x: origin.x, y: 0 }, { x: origin.x, y: innerHeight }, config().axisColor);

  // draw pointer
  const ppos = pen.pos;
  if (ppos) {
    const screenPos = scope.toScreenPosition(ppos);
    screenPos.y -= 25;
    drawText(screenPos, `(${ppos.x.toFixed()}, ${ppos.y.toFixed()})`);
  }
}

// ---------- actions triggered by the controller ----------

export function handle() {
  return pen.pos ? drawing().handleAt(pen.pos) : null;
}

export function thing() {
  return pen.pos ? drawing().thingAt(pen.pos) : null;
}

export function line() {
  const t = thing();
  return t instanceof Line ? t : null;
}

export function instance() {
  const t = thing();
  return t instanceof Instance ? t : null;
}

export function solve() {
  if (!drawing().isEmpty()) {
    status.set('solve');
    drawing().relax();
  }
}

export function toggleAutoSolve() {
  config().autoSolve = !config().autoSolve;
  status.set(`auto-solve ${config().autoSolve ? 'on' : 'off'}`);
}

export function del() {
  if (pen.pos && drawing().delete(pen.pos)) {
    cleanUp();
    if (drawing().isEmpty()) {
      doWithoutMovingPointer(() => scope.reset());
    }
  }
}

export function fixedDistance() {
  return !!pen.pos && drawing().fixedDistance(pen.pos);
}

export function fixedPoint() {
  return !!pen.pos && drawing().fixedPoint(pen.pos);
}

export function weight() {
  return !!pen.pos && drawing().weight(pen.pos);
}

export function horizontalOrVertical() {
  return !!pen.pos && drawing().horizontalOrVertical(pen.pos);
}

export function fullSize() {
  return !!pen.pos && drawing().fullSize(pen.pos);
}

export function reCenter() {
  const ppos = pen.pos;
  if (ppos) {
    status.set('re-center');
    doWithoutMovingPointer(() => {
      scope.centerAt(ppos);
    });
  }
}

export function instantiate(id: string) {
  const m = drawing(id);
  // TODO: this check for recursion is not sufficient
  // (adding an instance of a master after it has already been instantiated
  // can lead to mutually-recursive masters)
  if (!m.isEmpty() && pen.pos && !m.contains(drawing())) {
    const instance = drawing().addInstance(m, pen.pos, (0.5 * m.size) / scope.scale, 0);
    status.set('instantiate #' + id, instance);
  }
}

export function dismember() {
  if (pen.pos && drawing().dismember(pen.pos)) {
    cleanUp();
  }
}

export function rotateInstanceBy(dTheta: number) {
  return !!pen.pos && drawing().rotateInstanceAt(pen.pos, dTheta);
}

export function scaleInstanceBy(scaleMultiplier: number) {
  return !!pen.pos && drawing().resizeInstanceAt(pen.pos, scaleMultiplier);
}

export function toggleAttacher() {
  if (!pen.pos) {
    return;
  }

  const h = drawing().handleAt(pen.pos);
  if (!h) {
    return;
  }

  if (drawing().attachers.includes(h)) {
    removeAttacher(drawing(), h);
    status.set('remove attacher');
  } else {
    addAttacher(drawing(), h);
    status.set('add attacher');
  }
}

let _equalLengthLine: Line | null = null;

export function moreEqualLength() {
  if (!_equalLengthLine) {
    if ((_equalLengthLine = line())) {
      status.set('equal length', _equalLengthLine);
    }
    return;
  }

  const otherLine = line();
  if (otherLine) {
    drawing().constraints.add(
      new EqualDistanceConstraint(_equalLengthLine.a, _equalLengthLine.b, otherLine.a, otherLine.b),
    );
    status.set('equal length', _equalLengthLine, otherLine);
  }
}

export function endEqualLength() {
  _equalLengthLine = null;
}

export function setScale(newScale: number) {
  doWithoutMovingPointer(() => (scope.scale = newScale));
  status.set('scale=' + scope.scale.toFixed(1));
}

export function panBy(dx: number, dy: number) {
  doWithoutMovingPointer(() => {
    scope.center.x -= dx;
    scope.center.y -= dy;
  });
}

// ---------- clean up ----------

// TODO: simplify this logic!

function cleanUp() {
  while (_cleanUp()) {
    // keep going
  }
}

function _cleanUp() {
  const things = new Set<Thing>();
  const handles = new Set<Handle>();
  for (const drawing of allDrawings) {
    for (const thing of drawing.things) {
      things.add(thing);
      thing.forEachHandle((h) => handles.add(h));
    }
  }

  for (const drawing of allDrawings) {
    let needMoreCleanUp = false;
    for (const attacher of drawing.attachers) {
      if (!handles.has(attacher)) {
        removeAttacher(drawing, attacher);
        needMoreCleanUp = true;
      }
    }
    if (needMoreCleanUp) {
      return true;
    }
  }

  for (const drawing of allDrawings) {
    drawing.constraints.forEach((constraint) => {
      if (!constraint.isStillValid(things, handles)) {
        drawing.constraints.remove(constraint);
      }
    });
  }

  return false;
}
