import config, { updateConfig } from './config';
import scope from './scope';
import * as app from './app';
import * as status from './status';
import { el as canvasEl } from './canvas';
import { Handle, Thing } from './things';
import { pointDiff } from './helpers';
import { maybeTimeTravelToWorldAt, topLevelWorld, thisWorld, bookmarkedWorld } from './state';

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

let timeTravelling = false;
let oldAutoSolveSetting: boolean;

export function onFrame() {
  if (keysDown['t']) {
    if (!timeTravelling) {
      timeTravelling = true;
      topLevelWorld().updateRenderingInfo();
      document.getElementById('canvas')!.style.cursor = 'pointer';
      status.setPos('top');
      oldAutoSolveSetting = config().autoSolve;
      config().autoSolve = false;
    }
  } else if (timeTravelling) {
    timeTravelling = false;
    document.getElementById('canvas')!.style.cursor = 'none';
    status.setPos('bottom');
    config().autoSolve = oldAutoSolveSetting;
  }

  if (keysDown[' ']) {
    app.solve();
  }
}

export function render() {
  if (timeTravelling) {
    topLevelWorld().render();
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (keysDown[e.key]) {
    return;
  }

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
    case 'a':
      app.startArc();
      break;
    case 'Meta':
      app.startLines();
      break;
    case 'f':
      updateConfig({ flicker: !config().flicker });
      return;
    case 'd':
      config().debug = !config().debug;
      status.set(`debug ${config().debug ? 'on' : 'off'}`);
      return;
    case 'S':
      app.toggleAutoSolve();
      return;
    case 'p':
      app.paste();
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
    case '.':
      app.fixedPoint() || app.fixedDistance();
      break;
    case 'W':
      app.weight();
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
    case 'C':
      app.copy();
      break;
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (!keysDown[e.key]) {
    return;
  }

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
    case 'e':
      app.endEqualLength();
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

  if (keysDown['Meta']) {
    app.moreLines();
    drawingInProgress = true;
    return;
  } else if (keysDown['a']) {
    app.moreArc();
    drawingInProgress = true;
    return;
  } else if (keysDown['e']) {
    app.moreEqualLength();
    return;
  }

  drag = null;

  const handle = app.handle();
  if (handle) {
    drag = { thing: handle, offset: { x: 0, y: 0 } };
    return;
  }

  const thing = app.thing();
  if (thing) {
    drag = { thing, offset: pointDiff(app.pen.pos!, thing) };
  }
}

function onPointerMove(e: PointerEvent) {
  if (timeTravelling) {
    maybeTimeTravelToWorldAt(e);
    return;
  }

  if (!e.metaKey) {
    delete keysDown['Meta'];
  }

  if (e.pointerType === 'touch') {
    return;
  }

  const oldPos = app.pen.pos ? { x: app.pen.pos.x, y: app.pen.pos.y } : null;
  app.pen.moveToScreenPos(e);

  if (penDown && oldPos && !app.drawing().isEmpty() && !drawingInProgress && !drag) {
    app.panBy(app.pen.pos!.x - oldPos.x, app.pen.pos!.y - oldPos.y);
    return;
  }

  app.pen.snapPos(drag?.thing);

  if (drag) {
    const newX = app.pen.pos!.x - drag.offset.x;
    const newY = app.pen.pos!.y - drag.offset.y;
    drag.thing.moveBy(newX - drag.thing.x, newY - drag.thing.y);
  }
}

function onPointerUp(e: PointerEvent) {
  canvasEl.releasePointerCapture(e.pointerId);

  penDown = false;
  if (!keysDown['Meta'] && !keysDown['a']) {
    app.pen.clearPos();
  }

  if (drag?.thing instanceof Handle) {
    app.drawing().mergeAndAddImplicitConstraints(drag.thing);
  }

  drag = null;
}

export const isInConfigScreen = () => false;
