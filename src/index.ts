import * as canvas from './canvas';
import { pointDiff, Position } from './helpers';
import { Master } from './Master';
import { Handle, Instance, Thing } from './things';
import Transform from './Transform';

canvas.init(document.getElementById('canvas') as HTMLCanvasElement);

const pointer: Position & { down: boolean } = { x: -1, y: -1, down: false };
const keysDown: { [key: string]: boolean } = {};
let drawingInProgress:
  | { type: 'line'; start: Position }
  | { type: 'arc'; positions: Position[] }
  | null = null;
let dragThing: (Thing & Position) | null = null;

const masters: Master[] = [];
for (let idx = 0; idx < 10; idx++) {
  masters.push(new Master());
}

let master = masters[1];

function switchToMaster(m: Master) {
  ({ x: pointer.x, y: pointer.y } = m.transform.applyInverseTo(master.transform.applyTo(pointer)));
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
  master.render();

  switch (drawingInProgress?.type) {
    case 'line':
      canvas.drawLine(drawingInProgress.start, pointer, canvas.flickeryWhite(), master.transform);
      break;
    case 'arc':
      if (drawingInProgress.positions.length > 1) {
        canvas.drawArc(
          drawingInProgress.positions[0],
          drawingInProgress.positions[1],
          pointer,
          canvas.flickeryWhite(),
          master.transform,
        );
      }
      break;
  }

  const crosshairsSize = 15;
  const tPointer = master.transform.applyTo(pointer);
  canvas.drawLine(
    { x: tPointer.x - crosshairsSize, y: tPointer.y },
    { x: tPointer.x + crosshairsSize, y: tPointer.y },
    canvas.flickeryWhite('bold'),
    Transform.identity,
  );
  canvas.drawLine(
    { x: tPointer.x, y: tPointer.y - crosshairsSize },
    { x: tPointer.x, y: tPointer.y + crosshairsSize },
    canvas.flickeryWhite('bold'),
    Transform.identity,
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
      master.addInstance(m);
    } else {
      switchToMaster(m);
    }
    return;
  }

  switch (e.key) {
    case 'Backspace':
      canvas.setStatus('delete');
      master.delete();
      break;
    case 'b':
      // TODO: if dragHandle != null and has merged w/ other handles, unmerge one of them
      break;
    case 'l':
      canvas.setStatus('fixed distance');
      master.fixedDistance();
      break;
    case 'e':
      canvas.setStatus('equal length');
      master.equalDistance();
      break;
    case 'c':
      // TODO: copy
      break;
    case 'v':
      // TODO: paste
      break;
    case 'h':
      canvas.setStatus('H or V');
      master.horizontalOrVertical();
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

  const handle = master.handleAt(pointer, dragThing);
  if (handle) {
    dragThing = handle;
    return;
  }

  master.clearSelection();
  const thing = master.thingAt(pointer);
  if (thing) {
    if (thing instanceof Instance) {
      dragThing = thing;
    } else {
      master.toggleSelected(thing);
    }
  }
});

canvas.el.addEventListener('pointermove', (e) => {
  const rawPos = { x: (e as any).layerX, y: (e as any).layerY };
  const newPos = master.transform.applyInverseTo(rawPos);
  const oldPos = { x: pointer.x, y: pointer.y };

  if (keysDown['Control']) {
    const xf = rawPos.x / window.innerWidth;
    const yf = rawPos.y / window.innerHeight;
    master.transform.setScale(xf * 2);
  }

  if (pointer.down && !drawingInProgress && !dragThing && master.selection.size === 0) {
    const dx = newPos.x - oldPos.x;
    const dy = newPos.y - oldPos.y;
    master.transform.translateBy(dx, dy);
    ({ x: pointer.x, y: pointer.y } = master.transform.applyInverseTo(rawPos));
    return;
  }

  pointer.x = newPos.x;
  pointer.y = newPos.y;

  master.snap(pointer, dragThing);

  if (pointer.down && master.selection.size > 0) {
    const delta = pointDiff(pointer, oldPos);
    master.moveSelection(delta.x, delta.y);
  }

  if (dragThing) {
    dragThing.x = pointer.x;
    dragThing.y = pointer.y;
  }
});

canvas.el.addEventListener('pointerup', (e) => {
  canvas.el.releasePointerCapture(e.pointerId);
  pointer.down = false;

  if (dragThing instanceof Handle) {
    master.mergeAndAddImplicitConstraints(dragThing);
    dragThing = null;
  }
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
    drawingInProgress = {
      type: 'arc',
      positions: [],
    };
  }
  drawingInProgress.positions.push({ x: pointer.x, y: pointer.y });
  if (drawingInProgress.positions.length === 3) {
    const [c, a, b] = drawingInProgress.positions;
    master.addArc(a, b, c);
    drawingInProgress = null;
  }
}
