import config from './config';
import scope from './scope';
import * as app from './app';
import { setStatus, el as canvasEl } from './canvas';
import { Handle, Instance, Thing } from './things';
import { pointDiff, Position } from './helpers';

const keysDown: { [key: string]: boolean } = {};
let penDown = false;
let drawingInProgress = false;
let drag: { thing: Thing; offset: { x: number; y: number } } | null = null;

export function init() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerup', onPointerUp);
}

export function onFrame() {
  if (keysDown[' ']) {
    app.solve();
  }
}

export function render() {
  // no op
}

function onKeyDown(e: KeyboardEvent) {
  keysDown[e.key] = true;

  if ('Digit0' <= e.code && e.code <= 'Digit9') {
    const id = e.code.slice(5);
    if (keysDown['Shift']) {
      app.instantiate(id);
    } else {
      app.switchToDrawing(id);
    }
    return;
  }

  switch (e.key) {
    case 'f':
      config.flicker = !config.flicker;
      return;
    case 'd':
      config.debug = !config.debug;
      setStatus(`debug ${config.debug ? 'on' : 'off'}`);
      return;
    case 'S':
      app.toggleAutoSolve();
      return;
  }

  if (app.drawing().isEmpty()) {
    // the operations below don't make sense for an empty drawing
    return;
  }

  switch (e.key) {
    case 'Backspace':
      app.del();
      break;
    case 'l':
      app.fixedDistance();
      break;
    case '.':
      app.fixedPoint();
      break;
    case 'W':
      app.weight();
      break;
    case 'e':
      app.equalLength();
      break;
    case 'h':
      app.horizontalOrVertical();
      break;
    case '=':
      if (app.scaleInstanceBy(1.05)) {
        // found an instance, made it bigger
      } else {
        app.setScale(Math.min(scope.scale + 0.1, 10));
      }
      break;
    case '-':
      if (app.scaleInstanceBy(0.95)) {
        // found an instance, made it smaller
      } else {
        app.setScale(Math.max(scope.scale - 0.1, 0.1));
      }
      break;
    case 'q':
      app.rotateInstanceBy((5 * Math.PI) / 180);
      break;
    case 'w':
      app.rotateInstanceBy((-5 * Math.PI) / 180);
      break;
    case 's':
      app.fullSize();
      break;
    case 'A':
      app.toggleAttacher();
      break;
    case 'c':
      app.reCenter();
      break;
    case 'D':
      app.dismember();
      break;
  }
}

function onKeyUp(e: KeyboardEvent) {
  delete keysDown[e.key];

  switch (e.key) {
    case 'Meta':
      app.endLines();
      drawingInProgress = false;
      if (!penDown) {
        app.pen.clearPos();
      }
      break;
    case 'a':
      app.endArc();
      drawingInProgress = false;
      if (!penDown) {
        app.pen.clearPos();
      }
      break;
  }
}

function onPointerDown(e: PointerEvent) {
  canvasEl.setPointerCapture(e.pointerId);
  e.preventDefault();
  e.stopPropagation();

  app.pen.moveToScreenPos(e);
  app.pen.snapPos();
  penDown = true;

  if (keysDown['Shift']) {
    app.toggleSelected();
    return;
  } else if (keysDown['Meta']) {
    app.moreLines();
    drawingInProgress = true;
    return;
  } else if (keysDown['a']) {
    app.moreArc();
    drawingInProgress = true;
    return;
  }

  drag = null;

  const handle = app.handle();
  if (handle) {
    drag = { thing: handle, offset: { x: 0, y: 0 } };
    return;
  }

  app.clearSelection();
  const thing = app.thing();
  if (thing instanceof Instance) {
    drag = { thing, offset: pointDiff(app.pen.pos!, thing) };
  } else if (thing) {
    app.toggleSelected(thing);
  }
}

function onPointerMove(e: PointerEvent) {
  if (!e.metaKey) {
    delete keysDown['Meta'];
  }

  if (e.pointerType === 'touch') {
    return;
  }

  const oldPos = app.pen.pos ? { x: app.pen.pos.x, y: app.pen.pos.y } : null;
  app.pen.moveToScreenPos(e);
  const pos = { x: app.pen.pos!.x, y: app.pen.pos!.y };

  if (
    penDown &&
    oldPos &&
    !app.drawing().isEmpty() &&
    !drawingInProgress &&
    !drag &&
    app.drawing().selection.size === 0
  ) {
    app.panBy(pos.x - oldPos.x, pos.y - oldPos.y);
    return;
  }

  app.pen.snapPos(drag?.thing);

  if (penDown && oldPos && app.drawing().selection.size > 0) {
    const delta = pointDiff(pos, oldPos);
    app.moveSelectionBy(delta.x, delta.y);
  }

  if (drag) {
    const newX = pos.x - drag.offset.x;
    const newY = pos.y - drag.offset.y;
    drag.thing.moveBy(newX - drag.thing.x, newY - drag.thing.y);
  }
}

function onPointerUp(e: PointerEvent) {
  canvasEl.releasePointerCapture(e.pointerId);

  penDown = false;
  if (!keysDown['Meta']) {
    app.pen.clearPos();
  }

  if (drag?.thing instanceof Handle) {
    app.drawing().mergeAndAddImplicitConstraints(drag.thing);
  }

  drag = null;
}
