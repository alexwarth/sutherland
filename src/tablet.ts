import config from './config';
import * as app from './app';
import * as NativeEvents from './NativeEvents';
import { drawLine, setStatus } from './canvas';
import { pointDiff, Position } from './helpers';
import { Handle, Instance, Thing } from './things';

// TODO:
// * pan
// * zoom
// * instance scale
// * instance rotate

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

function onPencilDown(pos: Position, pressure: number) {
  app.pen.moveToScreenPos(pos);
}

function onPencilMove(screenPos: Position, pressure: number) {
  // setStatus(`pencil moved to (${pos.x.toFixed()}, ${pos.y.toFixed()}) p=${pressure.toFixed(2)}`);

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
    onPencilClick(pos);
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

function onPencilClick(pos: Position) {
  // setStatus(`click at (${pos.x.toFixed()}, ${pos.y.toFixed()})`);

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

function onPencilUp(pos: Position) {
  // setStatus(`pencil up at (${pos.x.toFixed()}, ${pos.y.toFixed()})`);
  app.pen.clearPos();
  endDragEtc();
  app.endLines();
  app.endArc();
}

function onFingerDown(pos: Position, id: number) {
  for (const b of buttons.values()) {
    if (b.contains(pos)) {
      b.fingerId = id;
      onButtonClick(b);
      return;
    }
  }
  // setStatus(`finger ${id} down at (${pos.x.toFixed()}, ${pos.y.toFixed()})`);
}

function onButtonClick(b: Button) {
  switch (b.label) {
    case 'clear':
      app.drawing().clear();
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
    case 'del':
      app.del();
      break;
  }
}

function onFingerMove(pos: Position, id: number) {
  // setStatus(`finger ${id} move to (${pos.x.toFixed()}, ${pos.y.toFixed()})`);
}

function onFingerUp(pos: Position, id: number) {
  // setStatus(`finger ${id} up at (${pos.x.toFixed()}, ${pos.y.toFixed()})`);
  for (const b of buttons.values()) {
    if (b.fingerId === id) {
      b.fingerId = null;
    }
  }
}
