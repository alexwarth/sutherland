import { sealThisWorld } from './state';
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
  // TODO: this is not quite right -- if I add attachers to a rectangle and connect a bunch of instances,
  // rewinding will break b/c we'll get to a state where there are master-side attachers w/o corresponding
  // instance-side attachers. Need to make sure that every sealed world maintains invariants
  // (may need some sense of transaction / commit)
  // TODO: consider only calling this when config().undo is true
  sealThisWorld();

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
