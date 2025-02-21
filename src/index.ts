import * as canvas from './canvas';
import * as app from './app';
import * as tablet from './tablet';
import * as demos from './demos';
import * as mouseAndKeyboard from './mouseAndKeyboard';

canvas.init(document.getElementById('canvas') as HTMLCanvasElement);

const controller = new URLSearchParams(window.location.search).get('tablet')
  ? tablet
  : mouseAndKeyboard;
controller.init();

function onFrame() {
  controller.onFrame();
  app.onFrame();

  canvas.clear();
  controller.render();
  if (controller.isInConfigScreen()) {
    canvas.withGlobalAlpha(0.25, () => app.render());
  } else {
    app.render();
  }

  requestAnimationFrame(onFrame);
}

onFrame();

(window as any).app = app;
(window as any).demos = demos;
