import config, { updateConfig } from './config';
import scope from './scope';
import * as app from './app';
import * as status from './status';
import { el as canvasEl } from './canvas';
import { Handle, Instance, Thing } from './things';
import { pointDiff, Position } from './helpers';
import { maybeTimeTravelToWorldAt, topLevelWorld, thisWorld, bookmarkedWorld } from './state';
import { letterDrawings } from './font';
import * as relaxationViz from './relaxationViz';

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
  // passive: false lets us preventDefault() so the browser doesn't scroll/zoom the page
  canvasEl.addEventListener('wheel', onWheel, { passive: false });
  // Safari reports trackpad pinches via proprietary gesture events instead of ctrl+wheel
  canvasEl.addEventListener('gesturestart', onGestureStart as EventListener);
  canvasEl.addEventListener('gesturechange', onGestureChange as EventListener);
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

let typing = false;

function onKeyDown(e: KeyboardEvent) {
  if (typing) {
    handleTyped(e);
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
    case 'T':
      enterTypingMode();
      return;
    case 'r':
      relaxationViz.setMode(false);
      status.set(relaxationViz.toggleStatusLabel());
      return;
    case 'R':
      relaxationViz.setMode(true);
      status.set(relaxationViz.toggleStatusLabel());
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
  delete keysDown[e.key];

  switch (e.key) {
    case 'Meta':
      app.endLines();
      drawingInProgress = false;
      break;
    case 'a':
      app.endArc();
      drawingInProgress = false;
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

  if (keysDown['Alt']) {
    if (!app.pen.pos) {
      return;
    }
    const thing = app.drawing().thingAt(app.pen.pos);
    if (!(thing instanceof Instance)) {
      return;
    }
    const id = app.drawingId(thing.master);
    if (id) {
      app.switchToDrawing(id);
    }
    return;
  } else if (keysDown['Meta']) {
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

function onWheel(e: WheelEvent) {
  e.preventDefault();
  e.stopPropagation();

  if (app.drawing().isEmpty()) {
    return;
  }

  if (e.ctrlKey) {
    // trackpad pinch (browsers report it as a ctrl+wheel event)
    // -- works regardless of the state of the SHIFT key, so that the user can
    // alternate between rotating and scaling an instance w/o releasing SHIFT
    zoomBy(Math.exp(-e.deltaY * 0.01));
  } else if (e.shiftKey && app.rotateInstanceBy(e.deltaX * 0.01)) {
    // SHIFT + side-to-side two-finger pan over an instance rotates it
    // (fingers moving right = clockwise)
  } else {
    // two-finger pan (deltas are in screen pixels)
    app.panBy(-e.deltaX / scope.scale, e.deltaY / scope.scale);
  }
}

function zoomBy(m: number) {
  if (app.scaleInstanceBy(m)) {
    // the pointer is over an instance, so we changed its scale instead of the scope's
  } else {
    app.setScale(Math.min(Math.max(scope.scale * m, 0.1), 10));
  }
}

// Safari-only gesture events (see init)

interface GestureEvent extends Event {
  scale: number;
}

let lastGestureScale = 1;

function onGestureStart(e: GestureEvent) {
  e.preventDefault();
  lastGestureScale = e.scale;
}

function onGestureChange(e: GestureEvent) {
  e.preventDefault();
  if (!app.drawing().isEmpty()) {
    zoomBy(e.scale / lastGestureScale);
  }
  lastGestureScale = e.scale;
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

  app.pen.moveToScreenPos(e);
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

  if (drag?.thing instanceof Handle) {
    app.drawing().mergeAndAddImplicitConstraints(drag.thing);
  }

  drag = null;
}

// typing mode

let origTypingPos: Position | null = null;
let typed: [Instance | 'newline', Position][] = [];

function enterTypingMode() {
  if (!app.pen.pos) {
    // don't do it!
    return;
  }

  status.set('typing');
  typing = true;
  origTypingPos = { ...app.pen.pos };
  typed = [];
}

function handleTyped(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    // exit typing mode
    typing = false;
    origTypingPos = null;
    typed = [];
    return;
  }

  if (e.key === 'Backspace') {
    if (typed.length > 0) {
      const letter = typed[typed.length - 1][0];
      if (letter !== 'newline') {
        app.drawing().deleteThing(letter);
      }
      typed.pop();
    }
    return;
  }

  const pos = typed.length > 0 ? typed[typed.length - 1][1] : origTypingPos!;
  const letterWidth = config().fontScale * (4 + config().kerning * 2);
  const letterHeight = config().fontScale * 14;

  if (e.key === 'Enter') {
    typed.push(['newline', { x: origTypingPos!.x, y: pos.y - letterHeight }]);
    return;
  }

  if (e.key.length !== 1) {
    // ignore
    return;
  }

  const master = letterDrawings.get(e.key.toUpperCase());
  if (!master) {
    // ignore
    return;
  }

  // THIS IS HOW WE MAKE ALL THE TEXT
  // CHARACTERS AND NUMBERS (0123456789)

  const instance = app.drawing().addInstance(master, pos, master.size, 0)!;
  typed.push([instance, { x: pos.x + letterWidth, y: pos.y }]);
}

export const isInConfigScreen = () => false;
