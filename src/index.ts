import * as canvas from './canvas';
import { pointDiff, Position } from './helpers';
import { Master } from './Master';
import { Handle, Instance, Thing } from './things';

canvas.init(document.getElementById('canvas') as HTMLCanvasElement);

const pointer: Position & { down: boolean } = { x: -1, y: -1, down: false };
const keysDown: { [key: string]: boolean } = {};
let drawingInProgress:
  | { type: 'line'; start: Position }
  | { type: 'arc'; positions: Position[] }
  | null = null;
let drag: { thing: Thing & Position; offset: { x: number; y: number } } | null = null;

// scope

const scope = {
  center: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  size: 1,
};

function toScreenPosition({ x, y }: Position) {
  return { x: (x - scope.center.x) / scope.size, y: (y - scope.center.y) / scope.size };
}

function fromScreenPosition({ x, y }: Position) {
  return { x: x * scope.size + scope.center.x, y: y * scope.size + scope.center.y };
}

// masters

const masters: Master[] = [];
for (let idx = 0; idx < 10; idx++) {
  masters.push(new Master());
}

let master = masters[1];

function center() {}

function switchToMaster(m: Master) {
  const pointerScreenPos = toScreenPosition(pointer);
  master.leave();
  scope.center.x = -window.innerWidth / 2;
  scope.center.y = -window.innerHeight / 2;
  ({ x: pointer.x, y: pointer.y } = fromScreenPosition(pointerScreenPos));
  master = m;
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
  master.render(toScreenPosition);

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

// input handlers

window.addEventListener('keydown', (e) => {
  if (keysDown[e.key]) {
    return;
  }

  keysDown[e.key] = true;

  if ('Digit0' <= e.code && e.code <= 'Digit9') {
    const m = masters[parseInt(e.code.slice(5))];
    if (keysDown['Shift']) {
      master.addInstance(m, pointer);
    } else {
      switchToMaster(m);
    }
    return;
  }

  switch (e.key) {
    case 'Backspace':
      canvas.setStatus('delete');
      master.delete(pointer);
      break;
    case 'l':
      canvas.setStatus('fixed distance');
      master.fixedDistance();
      break;
    case 'e':
      canvas.setStatus('equal length');
      master.equalDistance();
      break;
    case 'h':
      canvas.setStatus('H or V');
      master.horizontalOrVertical();
      break;
    case '=':
      scope.size = Math.max(scope.size - 0.2, 0.2);
      canvas.setStatus('size=' + scope.size.toFixed(1));
      break;
    case '-':
      scope.size = Math.min(scope.size + 0.2, 10);
      canvas.setStatus('size=' + scope.size.toFixed(1));
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
    const dx = pointer.x - oldPos.x;
    const dy = pointer.y - oldPos.y;
    scope.center.x -= dx;
    scope.center.y -= dy;
    pointer.x -= dx; // make the same adjustment
    pointer.y -= dy; // ... to the pointer position
    return;
  }

  master.snap(pointer, drag ? drag.thing : null);

  if (pointer.down && master.selection.size > 0) {
    const delta = pointDiff(pointer, oldPos);
    master.moveSelection(delta.x, delta.y);
  }

  if (drag) {
    drag.thing.x = pointer.x - drag.offset.x;
    drag.thing.y = pointer.y - drag.offset.y;
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
