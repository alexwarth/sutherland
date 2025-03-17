// import './console';
import * as display from './display';

display.init(document.getElementById('canvas') as HTMLCanvasElement,
  {showGui: true, openGui: true, showConsole: true, demo: true})

/*
import { thisWorld } from './state';
import * as canvas from './canvas';
import * as app from './app';
import * as tablet from './tablet';
import * as demos from './demos';
import * as mouseAndKeyboard from './mouseAndKeyboard';
import { isTablet } from './helpers';

canvas.init(document.getElementById('canvas') as HTMLCanvasElement);

const controller = isTablet() ? tablet : mouseAndKeyboard;
controller.init();

function onFrame() {
  // TODO: consider only calling this when config().undo is true
  const origWorld = thisWorld();
  origWorld.seal();

  controller.onFrame();
  app.onFrame();

  canvas.clear();
  controller.render();
  if (controller.isInConfigScreen()) {
    canvas.withGlobalAlpha(0.25, () => app.render());
  } else {
    app.render();
  }

  const newWorld = thisWorld();
  if (newWorld !== origWorld && !newWorld.hasWrites()) {
    origWorld.disown(newWorld);
    origWorld.goInto();
  }

  requestAnimationFrame(onFrame);
}

onFrame();

(window as any).app = app;
(window as any).demos = demos;
*/
