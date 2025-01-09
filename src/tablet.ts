import config from './config';
import * as app from './app';
import * as NativeEvents from './NativeEvents';
import { drawLine, setStatus } from './canvas';
import { Position } from './helpers';

const buttons = new Map<
  string,
  {
    label: string;
    scale: number;
    y1: number;
    y2: number;
    fingerId: number | null;
  }
>();

export function init() {
  [
    { label: '1', scale: 0.5 },
    { label: '2', scale: 0.5 },
    { label: '3', scale: 0.5 },
    { label: '4', scale: 0.5 },
    { label: 'arc', scale: 0.5 },
    { label: 'eq', scale: 0.5 },
    { label: 'del', scale: 0.5 },
    { label: 'solve', scale: 0.4 },
  ].forEach((b) => {
    buttons.set(b.label, { ...b, y1: 0, y2: 0, fingerId: null });
  });
}

export function onFrame() {
  processEvents();
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
        // TODO: write this
        // app.pen.moveTo()
        // onPencilMove(e.position);
        // if (!state.pencilDown && e.pressure >= 3) {
        //   state.pencilDown = true;
        //   onPencilPressed();
        // } else if (e.pressure < 3) {
        //   state.pencilDown = false;
        // }
        // if (e.pressure >= 0.01) {
        //   state.pencilHovering = true;
        // } else if (state.pencilHovering && e.pressure < 0.01) {
        //   state.pencilHovering = false;
        //   onPencilUp();
        // }
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

function onPencilPressed() {
  // canvas.setStatus('pencil pressed');
  app.moreLines();
}

function onPencilUp() {
  app.endLines();
  app.endArc();
}

function onFingerDown(pos: Position, id: number) {
  setStatus(`finger ${id} down at (${pos.x.toFixed()}, ${pos.y.toFixed()})`);
}

function onFingerMove(pos: Position, id: number) {
  setStatus(`finger ${id} move to (${pos.x.toFixed()}, ${pos.y.toFixed()})`);
}

function onFingerUp(pos: Position, id: number) {
  setStatus(`finger ${id} up at (${pos.x.toFixed()}, ${pos.y.toFixed()})`);
}
