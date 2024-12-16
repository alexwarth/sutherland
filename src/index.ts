import * as canvas from './canvas';
import { config } from './config';
import { pointDiff, Position, origin, scaleAround, translate } from './helpers';
import { Drawing } from './Drawing';
import { Handle, Instance, Thing } from './things';

// TODO: replace "relaxation abuse" with "auto solve", don't special case point-instance constraints

canvas.init(document.getElementById('canvas') as HTMLCanvasElement);

const pointer: Position & { down: boolean } = { x: Infinity, y: Infinity, down: false };
const keysDown: { [key: string]: boolean } = {};
let drawingInProgress:
  | { type: 'line'; start: Position }
  | { type: 'arc'; positions: Position[] }
  | null = null;
let drag: { thing: Thing & Position; offset: { x: number; y: number } } | null = null;

// scope

const scope = {
  center: { x: 0, y: 0 },
  scale: 1,
  reset() {
    this.center = { x: -window.innerWidth / 2, y: -window.innerHeight / 2 };
    this.scale = 1;
  },
};

scope.reset();

function toScreenPosition(p: Position) {
  return pointDiff(scaleAround(p, origin, scope.scale), scope.center);
}

function fromScreenPosition(pos: Position) {
  return scaleAround(translate(pos, scope.center), origin, 1 / scope.scale);
}

// drawings

const drawings: Drawing[] = [];
for (let idx = 0; idx < 10; idx++) {
  drawings.push(new Drawing());
}

let drawing = drawings[1];

function switchToDrawing(d: Drawing) {
  doWithoutMovingPointer(() => {
    drawing.leave();
    scope.reset();
    drawing = d;
    (window as any).drawing = d;
  });
}

function onFrame() {
  if (keysDown[' ']) {
    canvas.setStatus('solve');
    drawing.relax();
  }

  render();

  requestAnimationFrame(onFrame);
}

onFrame();

// rendering

function render() {
  if (config.autoSolve) {
    const t0 = performance.now();
    let n = 0;
    while (performance.now() - t0 < 20 && drawing.relax()) {
      n++;
    }
  }

  canvas.clear();
  if (!drawingInProgress && drawing.isEmpty()) {
    ink();
  } else {
    drawing.render(toScreenPosition);
  }

  switch (drawingInProgress?.type) {
    case 'line':
      canvas.drawLine(drawingInProgress.start, pointer, canvas.flickeryWhite(), toScreenPosition);
      break;
    case 'arc':
      if (drawingInProgress.positions.length > 1) {
        canvas.drawArc(
          drawingInProgress.positions[0],
          drawingInProgress.positions[1],
          pointer,
          canvas.flickeryWhite(),
          toScreenPosition,
        );
      }
      break;
  }

  const crosshairsSize = 15;
  const tPointer = toScreenPosition(pointer);
  canvas.drawLine(
    { x: tPointer.x - crosshairsSize, y: tPointer.y },
    { x: tPointer.x + crosshairsSize, y: tPointer.y },
    canvas.flickeryWhite('bold'),
  );
  canvas.drawLine(
    { x: tPointer.x, y: tPointer.y - crosshairsSize },
    { x: tPointer.x, y: tPointer.y + crosshairsSize },
    canvas.flickeryWhite('bold'),
  );
}

function ink() {
  const unit = window.innerWidth / 100;

  // I
  line(-7 * unit, 4 * unit, -7 * unit, -4 * unit);
  // N
  line(-3 * unit, 4 * unit, -3 * unit, -4 * unit);
  line(-3 * unit, -4 * unit, 2 * unit, 4 * unit);
  line(2 * unit, 4 * unit, 2 * unit, -4 * unit);
  // K
  line(6 * unit, 4 * unit, 6 * unit, -4 * unit);
  line(6 * unit, -1 * unit, 10 * unit, -4 * unit);
  line(8 * unit, -2 * unit, 10 * unit, 4 * unit);

  // line(-1000, 0, 1000, 0);
  // line(0, -1000, 0, 1000);

  function line(x1: number, y1: number, x2: number, y2: number) {
    canvas.drawLine({ x: x1, y: y1 }, { x: x2, y: y2 }, canvas.flickeryWhite(), toScreenPosition);
  }
}

// input handlers

window.addEventListener('keydown', (e) => {
  keysDown[e.key] = true;

  if ('Digit0' <= e.code && e.code <= 'Digit9') {
    const n = parseInt(e.code.slice(5));
    const m = drawings[n];
    if (keysDown['Shift']) {
      if (!m.isEmpty()) {
        canvas.setStatus('instantiate #' + n);
        drawing.addInstance(m, pointer, window.innerHeight / 5 / scope.scale);
      }
    } else {
      canvas.setStatus('drawing #' + n);
      switchToDrawing(m);
    }
    return;
  }

  switch (e.key) {
    case 'Backspace':
      if (drawing.delete(pointer)) {
        cleanUp();
        canvas.setStatus('delete');
      }
      break;
    case 'l':
      if (drawing.fixedDistance(pointer)) {
        canvas.setStatus('fixed distance');
      }
      break;
    case 'e':
      canvas.setStatus('equal length');
      drawing.equalDistance();
      break;
    case 'h':
      if (drawing.horizontalOrVertical(pointer)) {
        canvas.setStatus('HorV');
      }
      break;
    case '=':
      if (drawing.resizeInstanceAt(pointer, 1.05)) {
        // found an instance, made it bigger
      } else {
        doWithoutMovingPointer(() => {
          scope.scale = Math.min(scope.scale + 0.1, 10);
          canvas.setStatus('scale=' + scope.scale.toFixed(1));
        });
      }
      break;
    case '-':
      if (drawing.resizeInstanceAt(pointer, 0.95)) {
        // found an instance, made it smaller
      } else {
        doWithoutMovingPointer(() => {
          scope.scale = Math.max(scope.scale - 0.1, 0.1);
          canvas.setStatus('scale=' + scope.scale.toFixed(1));
        });
      }
      break;
    case 'q':
      drawing.rotateInstanceAt(pointer, (-5 * Math.PI) / 180);
      break;
    case 'w':
      drawing.rotateInstanceAt(pointer, (5 * Math.PI) / 180);
      break;
    case 'f':
      config.flicker = !config.flicker;
      break;
    case 'S':
      config.autoSolve = !config.autoSolve;
      canvas.setStatus(`auto-solve ${config.autoSolve ? 'on' : 'off'}`);
      break;
    case 's':
      if (drawing.fullSize(pointer)) {
        canvas.setStatus('full size');
      }
      break;
    case 'A':
      if (toggleAttacher(pointer)) {
        canvas.setStatus('toggle attacher');
      }
      break;
  }
});

window.addEventListener('keyup', (e) => {
  delete keysDown[e.key];

  if (e.key === 'Meta') {
    endLines();
  } else if (e.key === 'a') {
    if (drawingInProgress?.type === 'arc') {
      drawingInProgress = null;
    }
  } else if (e.key === ' ') {
    canvas.setStatus('');
  }
});

canvas.el.addEventListener('pointerdown', (e) => {
  canvas.el.setPointerCapture(e.pointerId);
  e.preventDefault();
  e.stopPropagation();

  pointer.down = true;

  if (keysDown['Shift']) {
    drawing.toggleSelections(pointer);
    return;
  } else if (keysDown['Meta']) {
    moreLines();
    return;
  } else if (keysDown['a']) {
    moreArc();
    return;
  }

  drag = null;

  const handle = drawing.handleAt(pointer);
  if (handle) {
    drag = { thing: handle, offset: { x: 0, y: 0 } };
    return;
  }

  drawing.clearSelection();
  const thing = drawing.thingAt(pointer);
  if (thing) {
    if (thing instanceof Instance) {
      drag = { thing, offset: pointDiff(pointer, thing) };
    } else {
      drawing.toggleSelected(thing);
    }
  }
});

canvas.el.addEventListener('pointermove', (e) => {
  const oldPos = { x: pointer.x, y: pointer.y };
  ({ x: pointer.x, y: pointer.y } = fromScreenPosition({
    x: (e as any).layerX,
    y: (e as any).layerY,
  }));

  if (pointer.down && !drawingInProgress && !drag && drawing.selection.size === 0) {
    // TODO: think about this more, it sometimes misbehaves
    const dx = pointer.x - oldPos.x;
    const dy = pointer.y - oldPos.y;
    doWithoutMovingPointer(() => {
      scope.center.x -= dx * scope.scale;
      scope.center.y -= dy * scope.scale;
    });
    return;
  }

  drawing.snap(pointer, drag ? drag.thing : null);

  if (pointer.down && drawing.selection.size > 0) {
    const delta = pointDiff(pointer, oldPos);
    drawing.moveSelection(delta.x, delta.y);
  }

  if (drag) {
    const newX = pointer.x - drag.offset.x;
    const newY = pointer.y - drag.offset.y;
    drag.thing.moveBy(newX - drag.thing.x, newY - drag.thing.y);
  }
});

canvas.el.addEventListener('pointerup', (e) => {
  canvas.el.releasePointerCapture(e.pointerId);
  pointer.down = false;

  if (drag?.thing instanceof Handle) {
    drawing.mergeAndAddImplicitConstraints(drag.thing);
  }

  drag = null;
});

// helpers

function moreLines() {
  const pos = { x: pointer.x, y: pointer.y };
  if (drawingInProgress?.type === 'line') {
    drawing.addLine(drawingInProgress.start, pos);
  }
  drawingInProgress = {
    type: 'line',
    start: pos,
  };
}

function endLines() {
  drawingInProgress = null;
}

function moreArc() {
  if (drawingInProgress?.type !== 'arc') {
    drawingInProgress = { type: 'arc', positions: [] };
  }
  drawingInProgress.positions.push({ x: pointer.x, y: pointer.y });
  if (drawingInProgress.positions.length === 3) {
    const [c, a, b] = drawingInProgress.positions;
    drawing.addArc(a, b, c);
    drawingInProgress = null;
  }
}

function doWithoutMovingPointer(fn: () => void) {
  const pointerScreenPos = toScreenPosition(pointer);
  fn();
  ({ x: pointer.x, y: pointer.y } = fromScreenPosition(pointerScreenPos));
}

function toggleAttacher(pointerPos: Position) {
  const h = drawing.handleAt(pointerPos);
  if (!h) {
    return false;
  }

  const idx = drawing.attachers.indexOf(h);
  if (idx >= 0) {
    drawing.attachers.splice(idx, 1);
    for (const m of drawings) {
      m.onAttacherRemoved(drawing, h);
    }
  } else {
    drawing.attachers.push(h);
    for (const m of drawings) {
      m.onAttacherAdded(drawing, h);
    }
  }
  return true;
}

function cleanUp() {
  const things = new Set<Thing>();
  const handles = new Set<Handle>();
  for (const drawing of drawings) {
    for (const thing of drawing.things) {
      things.add(thing);
      thing.forEachHandle((h) => handles.add(h));
    }
  }

  for (const drawing of drawings) {
    drawing.constraints.forEach((constraint) => {
      if (!constraint.isStillValid(things, handles)) {
        drawing.constraints.remove(constraint);
      }
    });
  }
}
