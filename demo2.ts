import Vec from './src/lib/vec';
import { Position } from './src/types';
import { Arc, Handles, Line, selection } from './things';
import Handle from './src/Handle';
import * as canvas from './canvas';
import * as constraints from './src/constraints';

const pointer: Position & { down: boolean } = { x: -1, y: -1, down: false };

const keysDown = {};

let drawingInProgress:
  | { type: 'line'; start: Position }
  | { type: 'arc'; positions: Position[] }
  | null = null;

canvas.init(document.getElementById('canvas') as HTMLCanvasElement);

let irses: (() => void)[][] = [];
let lastAnimationTime = 0;

function onFrame() {
  if (irses?.length > 0) {
    // don't solve anything
  } else if (keysDown[' ']) {
    canvas.setStatus('solving...');
    irses = constraints.solve({ recordIntermediateResults: true }) as (() => void)[][];
    // console.log(
    //   'irses',
    //   irses.map((irs) => irs.length),
    // );
  } else {
    constraints.solve({ onlyPropagateKnowns: true });
    irses = [];
  }

  const now = Date.now();
  if (irses?.length > 0 && lastAnimationTime + 60 < now) {
    // console.log(now);
    for (const irs of irses) {
      irs.shift()!();
    }
    irses = irses.filter((irs) => irs.length > 0);
    // console.log(
    //   'irses now',
    //   irses.map((irs) => irs.length),
    // );
    if (irses.length === 0) {
      canvas.setStatus('done solving');
    }
    lastAnimationTime = now;
  }

  render();
  requestAnimationFrame(onFrame);
}

onFrame();

// rendering

function render() {
  canvas.clear();
  Arc.all.forEach((a) => a.render());
  Line.all.forEach((l) => l.render());
  Handle.all.forEach(Handles.render);

  switch (drawingInProgress?.type) {
    case 'line':
      canvas.drawLine(drawingInProgress.start, pointer);
      break;
    case 'arc':
      if (drawingInProgress.positions.length === 1) {
        canvas.drawArc(drawingInProgress.positions[0], pointer, null);
      } else {
        canvas.drawArc(drawingInProgress.positions[0], drawingInProgress.positions[1], pointer);
      }
      break;
  }
}

// input handlers

window.addEventListener('keydown', (e) => {
  if (keysDown[e.key]) {
    return;
  }

  keysDown[e.key] = true;

  switch (e.key) {
    case 'Backspace':
      canvas.setStatus('delete');
      selection.forEach((thing) => thing.remove());
      break;
    case 'b':
      for (const h of Handle.all) {
        if (h !== Handles.dragHandle && h.canonicalInstance === Handles.dragHandle) {
          Handles.dragHandle.breakOff(h);
          Handles.dragHandle = h;
          break;
        }
      }
      break;
    case 'l':
      canvas.setStatus('length');
      for (const thing of selection) {
        if (thing instanceof Line) {
          constraints.constant(constraints.polarVector(thing.a, thing.b).distance);
        }
      }
      break;
    case 'c':
      canvas.setStatus('copy');
      copy();
      break;
    case 'v':
      canvas.setStatus('paste');
      paste();
      break;
    case 'h':
      canvas.setStatus('HorV');
      for (const line of Line.all) {
        if (selection.has(line)) {
          const { a, b } = line;
          const dx = Math.abs(a.x - b.x);
          const dy = Math.abs(a.y - b.y);
          if (dx <= dy) {
            constraints.relaxEquals(a.canonicalInstance.xVariable, b.canonicalInstance.xVariable);
            // console.log('vertical');
          } else {
            constraints.relaxEquals(a.canonicalInstance.yVariable, b.canonicalInstance.yVariable);
            // console.log('horizontal');
          }
        }
      }
      selection.clear();
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
  }
});

canvas.el.addEventListener('pointerdown', (e) => {
  canvas.el.setPointerCapture(e.pointerId);
  e.preventDefault();
  e.stopPropagation();

  pointer.down = true;

  if (keysDown['Shift']) {
    toggleSelections();
    return;
  } else if (keysDown['Meta']) {
    moreLines();
    return;
  } else if (keysDown['a']) {
    moreArc();
    return;
  }

  const handle = Handle.getNearestHandle(pointer);
  const thing = thingAtPointer();
  if (selection.size === 0) {
    Handles.dragHandle = handle;
    if (thing && !handle) {
      toggleSelected(thing);
    }
  } else {
    Handles.dragHandle = null;
    selection.clear();
    if (thing) {
      toggleSelected(thing);
    }
  }
});

canvas.el.addEventListener('pointermove', (e) => {
  const oldPos = { x: pointer.x, y: pointer.y };
  pointer.x = (e as any).layerX;
  pointer.y = (e as any).layerY;
  const delta = Vec.sub(pointer, oldPos);

  if (pointer.down && selection.size > 0) {
    const handles = new Set<Handle>();
    selection.forEach((thing) => thing.addCanonicalHandlesTo(handles));
    handles.forEach((h) => (h.position = Vec.add(h.position, delta)));
  }

  if (Handles.dragHandle) {
    Handles.dragHandle.position = pointer;
  }
  Handles.hoverHandle = Handle.getNearestHandle(pointer);
});

canvas.el.addEventListener('pointerup', (e) => {
  canvas.el.releasePointerCapture(e.pointerId);
  pointer.down = false;

  if (Handles.dragHandle) {
    Handles.mergeWithNearestAndAddImplicitConstraints(Handles.dragHandle);
    Handles.dragHandle = null;
  }

  // if (selection.size > 0) {
  //   const handles = new Set<Handle>();
  //   selection.forEach((thing) => thing.addCanonicalHandlesTo(handles));
  //   handles.forEach(Handles.mergeWithNearestAndAddImplicitConstraints);
  // }
});

// helpers

function toggleSelections() {
  Arc.all.forEach(toggleSelected);
  Line.all.forEach(toggleSelected);
}

function toggleSelected(thing: Arc | Line) {
  if (!thing.containsPos(pointer)) {
    // don't do anything
  } else if (selection.has(thing)) {
    selection.delete(thing);
  } else {
    selection.add(thing);
  }
}

function thingAtPointer() {
  for (const line of Line.all) {
    if (line.containsPos(pointer)) {
      return line;
    }
  }
  for (const arc of Arc.all) {
    if (arc.containsPos(pointer)) {
      return arc;
    }
  }
  return null;
}

function moreLines() {
  const pos = quantizedPointerPos();
  if (drawingInProgress?.type === 'line') {
    const line = new Line(drawingInProgress.start, pos);
    Handles.mergeWithNearestAndAddImplicitConstraints(line.a);
    Handles.mergeWithNearestAndAddImplicitConstraints(line.b);
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
  drawingInProgress.positions.push(quantizedPointerPos());
  if (drawingInProgress.positions.length === 3) {
    const [c, a, b] = drawingInProgress.positions;
    const arc = new Arc(a, b, c);
    Handles.mergeWithNearestAndAddImplicitConstraints(arc.a);
    Handles.mergeWithNearestAndAddImplicitConstraints(arc.b);
    Handles.mergeWithNearestAndAddImplicitConstraints(arc.c);
    drawingInProgress = null;
  }
}

function quantizedPointerPos() {
  const src = Handle.getNearestHandle(pointer) ?? pointer;
  return { x: src.x, y: src.y };
}

function copy() {
  // TODO
}

function paste() {
  // TODO
}
