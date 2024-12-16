import * as canvas from './canvas';
import { config } from './config';
import { PointInstanceConstraint } from './constraints';
import { pointDiff, Position, origin, scaleAround, translate } from './helpers';
import { Master } from './Master';
import { Handle, Instance, Thing } from './things';

// TODO:
// - a simplification: stop worrying about being able to unmerge handles
// - add special handling for when an attacher is removed from the master:
//   all of the corresponding points in its instances need to be removed automatically,
//   as well as constraints on those points
// - decide whether to continuously keep the attachers in the right place (see Master.fixInstances())
//   or to only do it on "solve"
//   * if the former,
//     - solve in clusters (like in my Inkling solver) to make dragging more lightweight CPU-wise
//     - make sure that moving, rotating, and scaling instances doesn't break the relationships
//       between the attachers and the points they correspond to in the master
//   * if the latter, prob. need to show connection between attacher and the point it is attached to

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

// masters

const masters: Master[] = [];
for (let idx = 0; idx < 10; idx++) {
  masters.push(new Master());
}

let master = masters[1];

function switchToMaster(m: Master) {
  doWithoutMovingPointer(() => {
    master.leave();
    scope.reset();
    master = m;
    (window as any).master = m;
  });
}

function onFrame() {
  if (keysDown[' ']) {
    canvas.setStatus('solve');
    master.relax();
  }

  render();

  requestAnimationFrame(onFrame);
}

onFrame();

// rendering

function render() {
  canvas.clear();
  if (!drawingInProgress && master.isEmpty()) {
    ink();
  } else {
    master.render(toScreenPosition);
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
    const m = masters[n];
    if (keysDown['Shift']) {
      if (!m.isEmpty()) {
        canvas.setStatus('instantiate #' + n);
        master.addInstance(m, pointer, window.innerHeight / 5 / scope.scale);
      }
    } else {
      canvas.setStatus('drawing #' + n);
      switchToMaster(m);
    }
    return;
  }

  switch (e.key) {
    case 'Backspace':
      if (master.delete(pointer)) {
        cleanUp();
        canvas.setStatus('delete');
      }
      break;
    case 'l':
      if (master.fixedDistance(pointer)) {
        canvas.setStatus('fixed distance');
      }
      break;
    case 'e':
      canvas.setStatus('equal length');
      master.equalDistance();
      break;
    case 'h':
      if (master.horizontalOrVertical(pointer)) {
        canvas.setStatus('HorV');
      }
      break;
    case '=':
      if (master.resizeInstanceAt(pointer, 1.05)) {
        // found an instance, made it bigger
      } else {
        doWithoutMovingPointer(() => {
          scope.scale = Math.min(scope.scale + 0.1, 10);
          canvas.setStatus('scale=' + scope.scale.toFixed(1));
        });
      }
      break;
    case '-':
      if (master.resizeInstanceAt(pointer, 0.95)) {
        // found an instance, made it smaller
      } else {
        doWithoutMovingPointer(() => {
          scope.scale = Math.max(scope.scale - 0.1, 0.1);
          canvas.setStatus('scale=' + scope.scale.toFixed(1));
        });
      }
      break;
    case 'q':
      master.rotateInstanceAt(pointer, (-5 * Math.PI) / 180);
      break;
    case 'w':
      master.rotateInstanceAt(pointer, (5 * Math.PI) / 180);
      break;
    case 'f':
      config.flicker = !config.flicker;
      break;
    case 'R':
      config.autoFixInstances = !config.autoFixInstances;
      canvas.setStatus(`relaxation abuse ${config.autoFixInstances ? 'on' : 'off'}`);
      break;
    case 's':
      if (master.fullSize(pointer)) {
        canvas.setStatus('full size');
      }
      break;
    case 'A':
      if (master.toggleAttacher(pointer)) {
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
    master.toggleSelections(pointer);
    return;
  } else if (keysDown['Meta']) {
    moreLines();
    return;
  } else if (keysDown['a']) {
    moreArc();
    return;
  }

  drag = null;

  const handle = master.handleAt(pointer);
  if (handle) {
    drag = { thing: handle, offset: { x: 0, y: 0 } };
    return;
  }

  master.clearSelection();
  const thing = master.thingAt(pointer);
  if (thing) {
    if (thing instanceof Instance) {
      drag = { thing, offset: pointDiff(pointer, thing) };
    } else {
      master.toggleSelected(thing);
    }
  }
});

canvas.el.addEventListener('pointermove', (e) => {
  const oldPos = { x: pointer.x, y: pointer.y };
  ({ x: pointer.x, y: pointer.y } = fromScreenPosition({
    x: (e as any).layerX,
    y: (e as any).layerY,
  }));

  if (pointer.down && !drawingInProgress && !drag && master.selection.size === 0) {
    // TODO: think about this more, it sometimes misbehaves
    const dx = pointer.x - oldPos.x;
    const dy = pointer.y - oldPos.y;
    doWithoutMovingPointer(() => {
      scope.center.x -= dx * scope.scale;
      scope.center.y -= dy * scope.scale;
    });
    return;
  }

  master.snap(pointer, drag ? drag.thing : null);

  if (pointer.down && master.selection.size > 0) {
    const delta = pointDiff(pointer, oldPos);
    master.moveSelection(delta.x, delta.y);
  }

  if (drag) {
    const newX = pointer.x - drag.offset.x;
    const newY = pointer.y - drag.offset.y;
    drag.thing.moveBy(newX - drag.thing.x, newY - drag.thing.y);
    master.fixInstances(drag.thing);
  }
});

canvas.el.addEventListener('pointerup', (e) => {
  canvas.el.releasePointerCapture(e.pointerId);
  pointer.down = false;

  if (drag?.thing instanceof Handle) {
    master.mergeAndAddImplicitConstraints(drag.thing);
  }

  drag = null;
});

// helpers

function moreLines() {
  const pos = { x: pointer.x, y: pointer.y };
  if (drawingInProgress?.type === 'line') {
    master.addLine(drawingInProgress.start, pos);
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
    master.addArc(a, b, c);
    drawingInProgress = null;
  }
}

function doWithoutMovingPointer(fn: () => void) {
  const pointerScreenPos = toScreenPosition(pointer);
  fn();
  ({ x: pointer.x, y: pointer.y } = fromScreenPosition(pointerScreenPos));
}

function cleanUp() {
  const things = new Set<Thing>();
  const handles = new Set<Handle>();
  for (const master of masters) {
    for (const thing of master.things) {
      things.add(thing);
      thing.forEachHandle((h) => handles.add(h));
    }
  }
  for (const master of masters) {
    master.constraints.forEach((constraint) => {
      if (constraint.isStillValid(things, handles)) {
        return;
      }

      master.constraints.remove(constraint);
      if (constraint instanceof PointInstanceConstraint) {
        // remove attachers in instance that no longer correspond to attachers in its master
        const instance = constraint.instance;
        instance.attachers = instance.attachers.filter((handle) => handles.has(handle));
      }
    });
  }
}
