import config from './config';
import scope from './scope';
import * as app from './app';
import * as NativeEvents from './NativeEvents';
import { pointDiff, pointDist, Position } from './helpers';
import { Handle, Instance, Line, Thing } from './things';
import { setStatus } from './canvas';
import { EqualDistanceConstraint } from './constraints';

// TODO: stop using selection to move non-instances
// (every Thing should move the same way)

class Button {
  leftX = 0;
  topY = 0;
  height: number;
  scale = 0.35;
  fingerId: number | null = null;

  constructor(readonly label: string) {
    this.height = config.fontScale * 8;
  }

  contains({ x, y }: Position) {
    return (
      this.leftX <= x &&
      x < this.leftX + config.tablet.buttonWidth &&
      this.topY <= y &&
      y < this.topY + this.height
    );
  }

  render() {
    app.drawing().drawText(this.label, this.scale, {
      x: this.leftX + config.tablet.buttonWidth / 2,
      y: this.topY + this.height / 2 + this.scale * config.fontScale * 3,
    });
  }

  get isDown() {
    return this.fingerId != null;
  }
}

const moveButton = new Button('MOVE');
const solveButton = new Button('SOLVE');
const col1 = [
  new Button('1'),
  new Button('2'),
  new Button('3'),
  new Button('LINE'),
  moveButton,
  new Button('HORV'),
  new Button('SIZE'),
  new Button('DISM'),
  new Button('DEL'),
  solveButton,
];
const col2 = [
  new Button('4'),
  new Button('5'),
  new Button('6'),
  new Button('ARC'),
  new Button('EQ'),
  new Button('FIX'),
  new Button('weight'),
  new Button('ATT'),
  new Button('CLEAR'),
  new Button('AUTO'),
];
const col3 = [new Button('reload')];
const allButtons = [...col1, ...col2, ...col3];

export function init() {
  // no op
}

export function onFrame() {
  processEvents();
  if (solveButton.isDown) {
    app.solve();
  }
}

export function render() {
  layOutButtonColumn(0, col1);
  layOutButtonColumn(config.tablet.buttonWidth, col2);
  layOutButtonColumn(innerWidth - config.tablet.buttonWidth, col3);
  for (const b of allButtons) {
    b.render();
  }
}

function layOutButtonColumn(leftX: number, buttons: Button[]) {
  let idx = 0;
  for (const b of buttons) {
    b.leftX = leftX;
    b.topY = idx * b.height;
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
let line: Line | null = null; // for EQ

function onPencilDown(screenPos: Position, pressure: number) {
  app.pen.moveToScreenPos(screenPos);
  if (moveButton.isDown) {
    move();
  }
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
  // no op (now done w/ MOVE button)
}

function onPencilUp(screenPos: Position) {
  app.pen.clearPos();
  endDragEtc();
  app.endLines();
  app.endArc();
}

const fingerScreenPositions = new Map<number, Position>();

function onFingerDown(screenPos: Position, id: number) {
  for (const b of allButtons) {
    if (b.contains(screenPos)) {
      b.fingerId = id;
      onButtonClick(b);
      return;
    }
  }

  fingerScreenPositions.set(id, screenPos);
}

function onButtonClick(b: Button) {
  const label = b.label.toLowerCase();
  if ('1' <= label && label <= '9') {
    if (app.pen.pos) {
      app.instantiate(b.label);
      move();
    } else {
      app.switchToDrawing(b.label);
    }
    return;
  }

  switch (label) {
    case 'clear':
      app.drawing().clear();
      scope.reset();
      break;
    case 'line':
      app.moreLines();
      break;
    case 'arc':
      app.moreArc();
      break;
    case 'move':
      move();
      break;
    case 'eq':
      if (!line) {
        line = app.line();
        setStatus('selected line');
        break;
      }
      const otherLine = app.line();
      if (otherLine) {
        app
          .drawing()
          .constraints.add(new EqualDistanceConstraint(line.a, line.b, otherLine.a, otherLine.b));
        setStatus('equal length');
      }
      break;
    case 'horv':
      app.horizontalOrVertical();
      break;
    case 'fix':
      app.fixedPoint() || app.fixedDistance();
      break;
    case 'size':
      app.fullSize();
      break;
    case 'weight':
      app.weight();
      break;
    case 'dism':
      app.dismember();
      break;
    case 'att':
      app.toggleAttacher();
      break;
    case 'del':
      app.del();
      break;
    case 'auto':
      app.toggleAutoSolve();
      break;
    case 'reload':
      location.reload();
      break;
  }
}

function move() {
  const handle = app.handle();
  if (handle) {
    drag = { thing: handle, offset: { x: 0, y: 0 } };
    return;
  }

  const thing = app.thing();
  if (thing instanceof Instance) {
    drag = { thing, offset: pointDiff(app.pen.pos!, thing) };
  } else if (thing) {
    app.toggleSelected(thing);
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
  for (const b of allButtons) {
    if (b.fingerId === id) {
      b.fingerId = null;
    }
  }

  fingerScreenPositions.delete(id);
}
