import * as canvas from './canvas';
import {
  EqualDistanceConstraint,
  FixedDistanceConstraint,
  HorizontalOrVerticalConstraint,
  PointOnArcConstraint,
  PointOnLineConstraint,
} from './constraints';
import ConstraintSet from './ConstraintSet';
import { pointDiff, pointDist, Position } from './helpers';
import { Arc, Handle, Line, Thing } from './things';
import Transform from './Transform';
import Var from './Var';

canvas.init(document.getElementById('canvas') as HTMLCanvasElement);

const things: Thing[] = [];
let hoverHandle: Handle | null;
let dragHandle: Handle | null;
const selection = new Set<Thing>();
const pointer: Position & { down: boolean } = { x: -1, y: -1, down: false };
const keysDown: { [key: string]: boolean } = {};
let drawingInProgress:
  | { type: 'line'; start: Position }
  | { type: 'arc'; positions: Position[] }
  | null = null;

const constraints = new ConstraintSet();
(window as any).constraints = constraints;

const transform = new Transform();
(window as any).transform = transform;

function onFrame() {
  if (keysDown[' ']) {
    canvas.setStatus('solve');
    constraints.relax(getVars());
  }

  render();
  requestAnimationFrame(onFrame);
}

onFrame();

// rendering

function render() {
  canvas.clear();
  things.forEach((t) => {
    t.render(selection, transform);
    t.handles.forEach((h) => h.render(selection, transform));
  });

  switch (drawingInProgress?.type) {
    case 'line':
      canvas.drawLine(drawingInProgress.start, pointer, canvas.flickeryWhite(), transform);
      break;
    case 'arc':
      if (drawingInProgress.positions.length > 1) {
        canvas.drawArc(
          drawingInProgress.positions[0],
          drawingInProgress.positions[1],
          pointer,
          canvas.flickeryWhite(),
          transform,
        );
      }
      break;
  }

  const crosshairsSize = 10;
  const tPointer = transform.applyTo(pointer);
  canvas.drawLine(
    { x: tPointer.x - crosshairsSize, y: tPointer.y },
    { x: tPointer.x + crosshairsSize, y: tPointer.y },
    canvas.flickeryWhite(),
    Transform.identity,
  );
  canvas.drawLine(
    { x: tPointer.x, y: tPointer.y - crosshairsSize },
    { x: tPointer.x, y: tPointer.y + crosshairsSize },
    canvas.flickeryWhite(),
    Transform.identity,
  );
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
      for (const thing of selection) {
        // TODO: remove handles, constraints, etc.
        // thing.remove();
        things.splice(things.indexOf(thing), 1);
      }
      selection.clear();
      break;
    case 'b':
      // TODO: if dragHandle != null and has merged w/ other handles, unmerge one of them
      break;
    case 'l':
      canvas.setStatus('fixed distance');
      for (const thing of selection) {
        if (thing instanceof Line) {
          constraints.add(new FixedDistanceConstraint(thing.a, thing.b));
        }
      }
      break;
    case 'e':
      canvas.setStatus('equal length');
      let prevLine: Line | null = null;
      for (const thing of selection) {
        if (!(thing instanceof Line)) {
          continue;
        }

        if (prevLine) {
          constraints.add(new EqualDistanceConstraint(prevLine.a, prevLine.b, thing.a, thing.b));
        }
        prevLine = thing;
      }
      break;
    case 'c':
      // TODO: copy
      break;
    case 'v':
      // TODO: paste
      break;
    case 'h':
      canvas.setStatus('HorV');
      for (const thing of selection) {
        if (thing instanceof Line) {
          constraints.add(new HorizontalOrVerticalConstraint(thing.a, thing.b));
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
    toggleSelections();
    return;
  } else if (keysDown['Meta']) {
    moreLines();
    return;
  } else if (keysDown['a']) {
    moreArc();
    return;
  }

  const thing = thingAtPointer();
  if (selection.size === 0) {
    dragHandle = hoverHandle;
    if (thing && !hoverHandle) {
      toggleSelected(thing);
    }
  } else {
    dragHandle = null;
    selection.clear();
    if (thing) {
      toggleSelected(thing);
    }
  }
});

canvas.el.addEventListener('pointermove', (e) => {
  const rawPos = { x: (e as any).layerX, y: (e as any).layerY };
  const newPos = transform.applyInverseTo(rawPos);
  const oldPos = { x: pointer.x, y: pointer.y };

  if (keysDown['Control']) {
    const xf = rawPos.x / window.innerWidth;
    const yf = rawPos.y / window.innerHeight;
    transform.setScale(xf * 2);
  }

  if (pointer.down && !drawingInProgress && !dragHandle && selection.size === 0) {
    const dx = newPos.x - oldPos.x;
    const dy = newPos.y - oldPos.y;
    transform.translateBy(dx, dy);
    ({ x: pointer.x, y: pointer.y } = transform.applyInverseTo(rawPos));
    return;
  }

  pointer.x = newPos.x;
  pointer.y = newPos.y;

  snapPointer();

  if (pointer.down && selection.size > 0) {
    const delta = pointDiff(pointer, oldPos);
    const movedVars = new Set<Var>();
    for (const thing of selection) {
      for (const handle of thing.handles) {
        if (!movedVars.has(handle.xVar.canonical)) {
          handle.x += delta.x;
          movedVars.add(handle.xVar.canonical);
        }
        if (!movedVars.has(handle.yVar.canonical)) {
          handle.y += delta.y;
          movedVars.add(handle.yVar.canonical);
        }
      }
    }
  }

  if (dragHandle) {
    dragHandle.x = pointer.x;
    dragHandle.y = pointer.y;
  }
  hoverHandle = handleAtPointer();
});

canvas.el.addEventListener('pointerup', (e) => {
  canvas.el.releasePointerCapture(e.pointerId);
  pointer.down = false;

  if (dragHandle) {
    mergeAndAddImplicitConstraints(dragHandle);
    dragHandle = null;
  }
});

// helpers

function toggleSelections() {
  for (const thing of things) {
    toggleSelected(thing);
  }
}

function toggleSelected(thing: Thing) {
  if (!thing.contains(pointer, transform)) {
    // don't do anything
  } else if (selection.has(thing)) {
    selection.delete(thing);
  } else {
    selection.add(thing);
  }
}

function handleAtPointer() {
  let minDist = Infinity;
  let nearestHandle: Handle | null = null;
  for (const thing of things) {
    for (const handle of thing.handles) {
      if (
        (!dragHandle || !handle.equals(dragHandle)) &&
        handle.isCanonical &&
        handle.contains(pointer, transform)
      ) {
        const dist = pointDist(pointer, handle);
        if (dist < minDist) {
          nearestHandle = handle;
          minDist = dist;
        }
      }
    }
  }
  return nearestHandle;
}

function thingAtPointer() {
  for (const thing of things) {
    if (thing.contains(pointer, transform)) {
      return thing;
    }
  }
  return null;
}

function moreLines() {
  const pos = { x: pointer.x, y: pointer.y };
  if (drawingInProgress?.type === 'line') {
    const line = new Line(drawingInProgress.start, pos);
    mergeAndAddImplicitConstraints(line.a);
    mergeAndAddImplicitConstraints(line.b);
    for (const thing of things) {
      for (const h of thing.handles) {
        if (!h.equals(line.a) && !h.equals(line.b) && line.contains(h, transform)) {
          constraints.add(new PointOnLineConstraint(h, line.a, line.b));
        }
      }
    }
    things.push(line);
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
    const arc = new Arc(a, b, c);
    mergeAndAddImplicitConstraints(arc.c);
    mergeAndAddImplicitConstraints(arc.a);
    mergeAndAddImplicitConstraints(arc.b);
    constraints.add(new EqualDistanceConstraint(arc.a, arc.c, arc.b, arc.c));
    for (const thing of things) {
      for (const h of thing.handles) {
        if (
          !h.equals(arc.a) &&
          !h.equals(arc.b) &&
          !h.equals(arc.c) &&
          arc.contains(h, transform)
        ) {
          constraints.add(new PointOnArcConstraint(h, arc.a, arc.b, arc.c));
        }
      }
    }
    things.push(arc);
    drawingInProgress = null;
  }
}

function mergeAndAddImplicitConstraints(h: Handle) {
  const thingsToIgnore = new Set<Thing>();
  for (const thing of things) {
    for (const handle of thing.handles) {
      if (handle.isCanonical && handle.contains(h, transform)) {
        h.mergeWith(handle);
        thingsToIgnore.add(thing);
      }
    }
  }

  for (const thing of things) {
    if (thingsToIgnore.has(thing) || !thing.contains(h, transform)) {
      // skip
    } else if (thing instanceof Line) {
      constraints.add(new PointOnLineConstraint(h, thing.a, thing.b));
    } else if (thing instanceof Arc) {
      constraints.add(new PointOnArcConstraint(h, thing.a, thing.b, thing.c));
    }
  }
}

function snapPointer() {
  const handle = handleAtPointer();
  if (handle) {
    pointer.x = handle.x;
    pointer.y = handle.y;
    return;
  }

  const constraints = new ConstraintSet();
  const snappedPointerPos = new Handle(pointer);
  const vars = new Set([snappedPointerPos.xVar, snappedPointerPos.yVar]);

  for (const thing of things) {
    if (selection.has(thing) || !thing.contains(pointer, transform)) {
      // ignore
    } else if (thing instanceof Line) {
      constraints.add(new PointOnLineConstraint(snappedPointerPos, thing.a, thing.b));
    } else if (thing instanceof Arc) {
      constraints.add(new PointOnArcConstraint(snappedPointerPos, thing.a, thing.b, thing.c));
    }

    while (constraints.relax(vars)) {
      // keep going
    }
    pointer.x = snappedPointerPos.x;
    pointer.y = snappedPointerPos.y;
  }
}

function getVars() {
  const vars = new Set<Var>();
  for (const thing of things) {
    for (const h of thing.handles) {
      vars.add(h.xVar.canonical);
      vars.add(h.yVar.canonical);
    }
  }
  return vars;
}
