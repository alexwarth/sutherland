import config from './config';
import scope from './scope';
import { drawArc, drawLine, drawText, flickeryWhite, setStatus } from './canvas';
import { letterDrawings } from './font';
import { Drawing } from './Drawing';
import { Position } from './helpers';
import { Handle, Instance, Line, Thing } from './things';

// ---------- pen ----------

let pos: Position | null = null;

export const pen = {
  get pos(): Position | null {
    return pos;
  },

  snapPos(dragThing?: Thing) {
    return pos ? _drawing.snap(pos, dragThing) : null;
  },

  moveToScreenPos(screenPos: Position) {
    const p = scope.fromScreenPosition(screenPos);
    if (!pos) {
      pos = p;
    } else {
      pos.x = p.x;
      pos.y = p.y;
    }
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

const drawings: { [key: string]: Drawing } = {};
for (let idx = 1; idx < 10; idx++) {
  drawings['' + idx] = new Drawing();
}

let _drawing = drawings['1'];
(window as any).drawing = _drawing;

export function drawing(id?: string) {
  return id ? (drawings[id] ?? letterDrawings.get(id)) : _drawing;
}

export function switchToDrawing(id: string) {
  const d = drawing(id);
  if (!d || d === _drawing) {
    return;
  }

  _drawing.leave();
  _drawing = d;
  doWithoutMovingPointer(() => scope.reset());
  setStatus('drawing #' + id);
  (window as any).drawing = _drawing;
}

const allDrawings = [...Object.values(drawings), ...letterDrawings.values()];

// ---------- drawing in progress ----------

let drawingInProgress:
  | { type: 'line'; start: Position }
  | { type: 'arc'; positions: Position[] }
  | null = null;

export function moreLines() {
  if (!pen.pos) {
    return;
  }

  const pos = { x: pen.pos.x, y: pen.pos.y };
  if (drawingInProgress?.type === 'line') {
    _drawing.addLine(drawingInProgress.start, pos);
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
    drawingInProgress = { type: 'arc', positions: [] };
  }
  drawingInProgress.positions.push({ x: pen.pos.x, y: pen.pos.y });
  if (drawingInProgress.positions.length === 3) {
    const [c, a, b] = drawingInProgress.positions;
    _drawing.addArc(a, b, c);
    drawingInProgress = null;
  }
}

export function endArc() {
  if (drawingInProgress?.type === 'arc') {
    drawingInProgress = null;
  }
}

// ---------- attachers ----------

function removeAttacher(m: Drawing, a: Handle) {
  const idx = m.attachers.indexOf(a);
  _drawing.attachers.splice(idx, 1);
  for (const d of Object.values(drawings)) {
    d.onAttacherRemoved(m, a);
  }
}

function addAttacher(m: Drawing, a: Handle) {
  m.attachers.push(a);
  for (const d of Object.values(drawings)) {
    d.onAttacherAdded(m, a);
  }
}

// ---------- work done on every frame ----------

export function onFrame() {
  if (config.autoSolve) {
    const t0 = performance.now();
    let n = 0;
    while (performance.now() - t0 < 20 && _drawing.relax()) {
      n++;
    }
  }
}

// ---------- rendering ----------

export function render() {
  if (!drawingInProgress && _drawing.isEmpty()) {
    renderInk();
  }
  renderDrawingInProgress();
  _drawing.render();
  renderCrosshairs();
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
      if (drawingInProgress.positions.length > 1 && pen.pos) {
        drawArc(
          drawingInProgress.positions[0],
          drawingInProgress.positions[1],
          pen.pos,
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
    { x: tpen.x - config.crosshairsSize, y: tpen.y },
    { x: tpen.x + config.crosshairsSize, y: tpen.y },
    flickeryWhite('bold'),
  );
  drawLine(
    { x: tpen.x, y: tpen.y - config.crosshairsSize },
    { x: tpen.x, y: tpen.y + config.crosshairsSize },
    flickeryWhite('bold'),
  );
}

function renderDebugInfo() {
  if (!config.debug) {
    return;
  }

  // draw axes
  const origin = scope.toScreenPosition({ x: 0, y: 0 });
  drawLine({ x: 0, y: origin.y }, { x: innerWidth, y: origin.y }, config.axisColor);
  drawLine({ x: origin.x, y: 0 }, { x: origin.x, y: innerHeight }, config.axisColor);

  // draw pointer
  const ppos = pen.pos;
  if (ppos) {
    drawText(scope.toScreenPosition(ppos), `(${ppos.x.toFixed()}, ${ppos.y.toFixed()})`);
  }
}

// ---------- actions triggered by the controller ----------

export function handle() {
  return pen.pos ? _drawing.handleAt(pen.pos) : null;
}

export function thing() {
  return pen.pos ? _drawing.thingAt(pen.pos) : null;
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
  if (!_drawing.isEmpty()) {
    setStatus('solve');
    _drawing.relax();
  }
}

export function toggleAutoSolve() {
  config.autoSolve = !config.autoSolve;
  setStatus(`auto-solve ${config.autoSolve ? 'on' : 'off'}`);
}

export function del() {
  if (pen.pos && _drawing.delete(pen.pos)) {
    setStatus('delete');
    cleanUp();
    if (_drawing.isEmpty()) {
      doWithoutMovingPointer(() => scope.reset());
    }
  }
}

export function fixedDistance() {
  if (pen.pos && _drawing.fixedDistance(pen.pos)) {
    setStatus('fixed distance');
  }
}

export function fixedPoint() {
  if (pen.pos && _drawing.fixedPoint(pen.pos)) {
    setStatus('fixed point');
    return true;
  } else {
    return false;
  }
}

export function weight() {
  if (pen.pos && _drawing.weight(pen.pos)) {
    setStatus('weight');
  }
}

export function horizontalOrVertical() {
  if (pen.pos && _drawing.horizontalOrVertical(pen.pos)) {
    setStatus('HorV');
  }
}

export function fullSize() {
  if (pen.pos && _drawing.fullSize(pen.pos)) {
    setStatus('full size');
  }
}

export function reCenter() {
  const ppos = pen.pos;
  if (ppos) {
    setStatus('re-center');
    doWithoutMovingPointer(() => {
      scope.centerAt(ppos);
    });
  }
}

export function instantiate(id: string) {
  const m = drawing(id);
  if (!m.isEmpty() && pen.pos) {
    setStatus('instantiate #' + id);
    _drawing.addInstance(m, pen.pos, (0.5 * m.size) / scope.scale, 0);
  }
}

export function dismember() {
  if (pen.pos && _drawing.dismember(pen.pos)) {
    setStatus('dismember');
    cleanUp();
  }
}

export function rotateInstanceBy(dTheta: number) {
  return !!pen.pos && _drawing.rotateInstanceAt(pen.pos, dTheta);
}

export function scaleInstanceBy(scaleMultiplier: number) {
  return !!pen.pos && _drawing.resizeInstanceAt(pen.pos, scaleMultiplier);
}

export function toggleSelected(thing?: Thing) {
  if (thing) {
    _drawing.toggleSelected(thing);
  } else if (pen.pos) {
    _drawing.toggleSelections(pen.pos);
  }
}

export function moveSelectionBy(dx: number, dy: number) {
  _drawing.moveSelectionBy(dx, dy);
}

export function clearSelection() {
  _drawing.clearSelection();
}

export function toggleAttacher() {
  if (!pen.pos) {
    return;
  }

  const h = _drawing.handleAt(pen.pos);
  if (!h) {
    return;
  }

  if (_drawing.attachers.includes(h)) {
    removeAttacher(_drawing, h);
    setStatus('remove attacher');
  } else {
    addAttacher(_drawing, h);
    setStatus('add attacher');
  }
}

export function equalLength() {
  if (_drawing.equalDistance()) {
    setStatus('equal length');
  }
}

export function setScale(newScale: number) {
  doWithoutMovingPointer(() => (scope.scale = newScale));
  setStatus('scale=' + scope.scale.toFixed(1));
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
