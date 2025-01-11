import config from './config';
import scope from './scope';
import * as app from './app';
import * as NativeEvents from './NativeEvents';
import { drawLine } from './canvas';
import { pointDiff, pointDist, Position } from './helpers';
import { Handle, Instance, Thing } from './things';

// TODO: rethink selections, add an eq button
// TODO: add UI for attachers here

class Button {
  y1 = 0;
  y2 = 0;
  fingerId: number | null = null;

  constructor(
    readonly label: string,
    readonly scale: number,
  ) {}

  contains({ x, y }: Position) {
    return x < config.tablet.buttonWidth && this.y1 <= y && y < this.y2;
  }

  get isDown() {
    return this.fingerId != null;
  }
}

const buttons = new Map<string, Button>();

export function init() {
  [
    new Button('clear', 0.4),
    new Button('1', 0.5),
    new Button('2', 0.5),
    new Button('3', 0.5),
    new Button('4', 0.5),
    new Button('line', 0.4),
    new Button('arc', 0.5),
    new Button('horv', 0.5),
    new Button('dist', 0.5),
    new Button('del', 0.5),
    new Button('solve', 0.4),
  ].forEach((b) => buttons.set(b.label, b));
}

export function onFrame() {
  processEvents();
  if (buttons.get('solve')?.fingerId) {
    app.solve();
  }
}

export function render() {
  if (config.tablet.showButtonLines) {
    drawLine(
      { x: config.tablet.buttonWidth, y: 0 },
      { x: config.tablet.buttonWidth, y: innerHeight },
    );
  }

  const numButtons = buttons.size;
  let idx = 0;
  for (const b of buttons.values()) {
    b.y1 = (idx * innerHeight) / numButtons;
    b.y2 = b.y1 + innerHeight / numButtons;
    if (config.tablet.showButtonLines) {
      drawLine({ x: 0, y: b.y2 }, { x: config.tablet.buttonWidth, y: b.y2 });
    }
    app.drawing().drawText(b.label, b.scale, {
      x: config.tablet.buttonWidth / 2,
      y: (b.y1 + b.y2) / 2 + b.scale * config.fontScale * 3,
    });
    idx++;
  }
}

function processEvents() {
  for (const e of NativeEvents.getQueuedEvents()) {
    switch (e.type) {
      case 'pencil':
        if (e.phase === 'began') {
          onPencilDown(e.position, e.pressure);
        } else if (e.phase === 'moved') {
          onPencilMove(e.position, e.pressure);
        } else if (e.phase === 'ended') {
          onPencilUp(e.position);
        }
        break;
      case 'finger':
        if (e.phase === 'began') {
          onFingerDown(e.position, e.id);
        } else if (e.phase === 'moved') {
          onFingerMove(e.position, e.id);
        } else if (e.phase === 'ended') {
          onFingerUp(e.position, e.id);
        }
    }
  }
}

let pencilClickInProgress = false;
let drag: { thing: Thing & Position; offset: { x: number; y: number } } | null = null;

function onPencilDown(screenPos: Position, pressure: number) {
  app.pen.moveToScreenPos(screenPos);
}

function onPencilMove(screenPos: Position, pressure: number) {
  const oldPos = app.pen.pos ? { x: app.pen.pos.x, y: app.pen.pos.y } : null;
  app.pen.moveToScreenPos(screenPos);
  app.pen.snapPos(drag?.thing);
  const pos = { x: app.pen.pos!.x, y: app.pen.pos!.y };

  if (oldPos && app.drawing().selection.size > 0) {
    const delta = pointDiff(pos, oldPos);
    app.moveSelectionBy(delta.x, delta.y);
  }

  if (drag) {
    const newX = pos.x - drag.offset.x;
    const newY = pos.y - drag.offset.y;
    drag.thing.moveBy(newX - drag.thing.x, newY - drag.thing.y);
  }

  if (!pencilClickInProgress && pressure > 3) {
    pencilClickInProgress = true;
    onPencilClick();
  }
  if (pencilClickInProgress && pressure < 1) {
    endDragEtc();
  }
}

// TODO: come up w/ a better name for this method
function endDragEtc() {
  pencilClickInProgress = false;
  if (drag?.thing instanceof Handle) {
    app.drawing().mergeAndAddImplicitConstraints(drag.thing);
  }
  drag = null;
  app.clearSelection();
}

function onPencilClick() {
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

function onPencilUp(screenPos: Position) {
  app.pen.clearPos();
  endDragEtc();
  app.endLines();
  app.endArc();
}

const fingerScreenPositions = new Map<number, Position>();

function onFingerDown(screenPos: Position, id: number) {
  for (const b of buttons.values()) {
    if (b.contains(screenPos)) {
      b.fingerId = id;
      onButtonClick(b);
      return;
    }
  }

  fingerScreenPositions.set(id, screenPos);
}

function onButtonClick(b: Button) {
  switch (b.label) {
    case 'clear':
      app.drawing().clear();
      scope.reset();
      break;
    case '1':
    case '2':
    case '3':
    case '4':
      if (app.pen.pos) {
        app.instantiate(b.label);
      } else {
        app.switchToDrawing(b.label);
      }
      break;
    case 'line':
      app.moreLines();
      break;
    case 'arc':
      app.moreArc();
      break;
    case 'horv':
      app.horizontalOrVertical();
      break;
    case 'dist':
      app.fixedDistance();
      break;
    case 'del':
      app.del();
      break;
  }
}

function onFingerMove(screenPos: Position, id: number) {
  if (app.drawing().isEmpty() || fingerScreenPositions.size > 2) {
    return;
  }

  const oldScreenPos = fingerScreenPositions.get(id);
  if (!oldScreenPos) {
    return;
  }

  fingerScreenPositions.set(id, screenPos);

  const pos = scope.fromScreenPosition(screenPos);
  const oldPos = scope.fromScreenPosition(oldScreenPos);

  if (!app.pen.pos) {
    app.panBy(pos.x - oldPos.x, pos.y - oldPos.y);
  }

  if (fingerScreenPositions.size !== 2) {
    return;
  }

  let otherFingerScreenPos: Position | null = null;
  for (const [otherId, otherScreenPos] of fingerScreenPositions.entries()) {
    if (otherId !== id) {
      otherFingerScreenPos = otherScreenPos;
      break;
    }
  }
  if (!otherFingerScreenPos) {
    throw new Error('bruh?!');
  }

  const otherFingerPos = scope.fromScreenPosition(otherFingerScreenPos);

  const oldDist = pointDist(otherFingerPos, oldPos);
  const newDist = pointDist(otherFingerPos, pos);
  const m = newDist / oldDist;

  const oldAngle = Math.atan2(oldPos.y - otherFingerPos.y, oldPos.x - otherFingerPos.x);
  const newAngle = Math.atan2(pos.y - otherFingerPos.y, pos.x - otherFingerPos.x);

  if (!app.scaleInstanceBy(m) && !app.pen.pos) {
    scope.scale *= m;
  }

  app.rotateInstanceBy(newAngle - oldAngle);
}

function onFingerUp(screenPos: Position, id: number) {
  for (const b of buttons.values()) {
    if (b.fingerId === id) {
      b.fingerId = null;
    }
  }

  fingerScreenPositions.delete(id);
}
