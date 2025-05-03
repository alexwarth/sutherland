import config, { restoreDefaultConfig, updateConfig } from './config';
import scope from './scope';
import * as app from './app';
import * as status from './status';
import * as wrapper from './wrapper';
import * as display from './display';
import * as NativeEvents from './NativeEvents';
import { drawLine, drawText as canvasDrawText } from './canvas';
import { showHideConsole } from './console';
import { pointDiff, pointDist, Position } from './helpers';
import { Handle, Thing } from './things';
import { maybeTimeTravelToWorldAt, topLevelWorld } from './state';

// TODO: why is there no haptic bump on snaps, etc. when I'm holding down a button??

// TODO: harden the notion of "capture" / "claiming" fingers,
// the pointer, which thing is bing dragged, rotated, scaled, etc.
// so that when things overlap, the thing that you are manipulating
// stays the same.

const SMALL_CAPS = 0.75;
const letterHeight = () => config().fontScale * 8;

function drawText(text: string, x: number, y: number, scale = 0.35) {
  canvasDrawText({
    x: x + config().tabletButtonWidth / 2,
    y: y + letterHeight() / 2,
  }, text, "rgba(255, 255, 0, 0.5)", undefined, 24)
}

class Button {
  topY = 0;
  leftX = 0;
  lastDownTime = 0;
  fingerId: number | null = null;

  constructor(
    readonly label: string,
    readonly highlightPred?: () => boolean,
  ) {}

  contains({ x, y }: Position) {
    return (
      this.leftX <= x &&
      x < this.leftX + config().tabletButtonWidth &&
      this.topY <= y &&
      y < this.topY + letterHeight()
    );
  }

  render() {
    const outline = (this.isDown || (this.highlightPred && this.highlightPred()))
      ? 'rgba(255, 255, 255, 1)'
      : 'rgba(0, 0, 0, 0.5)';

    drawLine({ x: this.leftX, y: this.topY }, { x: this.leftX + config().tabletButtonWidth, y: this.topY }, outline);
    drawLine({ x: this.leftX, y: this.topY + letterHeight() }, { x: this.leftX + config().tabletButtonWidth, y: this.topY + letterHeight() }, outline);
    drawLine({ x: this.leftX, y: this.topY }, { x: this.leftX, y: this.topY + letterHeight() }, outline);
    drawLine({ x: this.leftX + config().tabletButtonWidth, y: this.topY }, { x: this.leftX + config().tabletButtonWidth, y: this.topY + letterHeight() }, outline);


    drawText(this.label, this.leftX, this.topY);
    if (this.isDown || (this.highlightPred && this.highlightPred())) {
      drawText(this.label, this.leftX, this.topY);
      drawText(this.label, this.leftX, this.topY);
    }
  }

  get isDown() {
    return this.fingerId != null;
  }

  clearState() {
    this.fingerId = null;
  }
}

abstract class Screen {
  readonly buttons: Button[] = [];
  readonly fingerScreenPositions = new Map<number, Position>();

  abstract layOutButtons(): void;
  abstract onFrame(): void;
  abstract onButtonDown(b: Button): void;
  abstract onButtonUp(b: Button): void;

  render() {
    this.layOutButtons();
    this.renderButtons();
  }

  renderButtons() {
    const g = config().showGuideLines
    config().showGuideLines = true;
    for (const b of this.buttons) {
      b.render();
    }
    config().showGuideLines = g;
  }

  onPencilDown(screenPos: Position, pressure: number) {}
  onPencilMove(screenPos: Position, pressure: number) {}
  onPencilUp(screenPos: Position) {}

  onFingerDown(screenPos: Position, id: number) {
    for (const b of this.buttons) {
      if (b.contains(screenPos)) {
        b.fingerId = id;
        this.onButtonDown(b);
        b.lastDownTime = Date.now();
        return;
      }
    }

    this.fingerScreenPositions.set(id, screenPos);
  }

  onFingerMove(screenPos: Position, id: number) {
    this.fingerScreenPositions.set(id, screenPos);
  }

  onFingerUp(screenPos: Position, id: number) {
    for (const b of this.buttons) {
      if (b.fingerId === id) {
        this.onButtonUp(b);
        b.fingerId = null;
      }
    }

    this.fingerScreenPositions.delete(id);
  }

  processEvents() {
    for (const e of NativeEvents.getQueuedEvents()) {
      switch (e.type) {
        case 'pencil':
          if (e.phase === 'began') {
            this.onPencilDown(e.position, e.pressure);
          } else if (e.phase === 'moved') {
            this.onPencilMove(e.position, e.pressure);
          } else if (e.phase === 'ended') {
            this.onPencilUp(e.position);
          }
          break;
        case 'finger':
          if (e.phase === 'began') {
            this.onFingerDown(e.position, e.id);
          } else if (e.phase === 'moved') {
            this.onFingerMove(e.position, e.id);
          } else if (e.phase === 'ended') {
            this.onFingerUp(e.position, e.id);
          }
      }
    }
  }

  layOutButtonColumn(leftX: number, buttons: Button[]) {
    let idx = 0;
    for (const b of buttons) {
      b.leftX = leftX;
      b.topY = idx * letterHeight();
      idx++;
    }
  }

  clearButtonState() {
    this.buttons.forEach((b) => b.clearState());
  }
}

let screen: Screen;

function switchTo(s: Screen) {
  screen?.clearButtonState();
  screen = s;
}

export function init() {
  switchTo(mainScreen);
}

export function onFrame() {
  screen.processEvents();
  screen.onFrame();
}

export function render() {
  screen.render();
}

function makeDrawingButton(name: string) {
  return new Button(name, () => app.drawing() === app.drawings[name]);
}

function isDrawingButton(b: Button) {
  return '1' <= b.label && b.label <= '9';
}

const mainScreen = new (class MainScreen extends Screen {
  readonly lineButton = new Button('LINE');
  readonly moveButton = new Button('MOVE');
  readonly horvButton = new Button('HORV');
  readonly sizeButton = new Button('SIZE');
  readonly dismemberButton = new Button('DISM');
  readonly deleteButton = new Button('DEL');
  readonly solveButton = new Button('SOLVE', () => config().autoSolve);
  readonly arcButton = new Button('ARC');
  readonly eqButton = new Button('EQ');
  readonly fixButton = new Button('FIX');
  readonly weightButton = new Button('WEIGHT');
  readonly attacherButton = new Button('ATT');
  readonly clearButton = new Button('CLEAR');
  readonly timeButton = new Button('TIME');
  readonly configButton = new Button('config');
  readonly reloadButton = new Button('reload');
  readonly col1 = [
    makeDrawingButton('1'),
    makeDrawingButton('2'),
    makeDrawingButton('3'),
    this.lineButton,
    this.moveButton,
    this.horvButton,
    this.sizeButton,
    this.dismemberButton,
    this.deleteButton,
    this.solveButton,
  ];
  readonly col2 = [
    makeDrawingButton('4'),
    makeDrawingButton('5'),
    makeDrawingButton('6'),
    this.arcButton,
    this.eqButton,
    this.fixButton,
    this.weightButton,
    this.attacherButton,
    this.clearButton,
    this.timeButton,
  ];
  readonly col3 = [this.configButton, this.reloadButton];

  pencilClickInProgress = false;
  drag: { thing: Thing; offset: { x: number; y: number } } | null = null;
  lastSnap: string | null = null;

  constructor() {
    super();
    this.buttons.push(...this.col1, ...this.col2, ...this.col3);
  }

  override onFrame() {
    if (!this.timeButton.isDown && this.solveButton.isDown) {
      app.solve();
    }
  }

  override layOutButtons() {
    if (!config().lefty) {
      this.layOutButtonColumn(0, this.col1);
      this.layOutButtonColumn(config().tabletButtonWidth, this.col2);
      this.layOutButtonColumn(innerWidth - config().tabletButtonWidth, this.col3);
    } else {
      this.layOutButtonColumn(innerWidth - config().tabletButtonWidth, this.col1);
      this.layOutButtonColumn(innerWidth - 2 * config().tabletButtonWidth, this.col2);
      this.layOutButtonColumn(0, this.col3);
    }
  }

  override onPencilDown(screenPos: Position, pressure: number) {
    if (this.timeButton.isDown) {
      this.timeTravelTo(screenPos, pressure);
      return;
    }

    app.pen.moveToScreenPos(screenPos);
    const displayPos = scope.toDisplayPosition(app.pen.pos!);
    display.setPen(displayPos.x, displayPos.y);
    if (config().debug) console.log(`pen down ${app.pen.pos!.x|0}, ${app.pen.pos!.y|0}`);
    if (this.moveButton.isDown) {
      this.move();
    }
    this.prepareHaptics();
  }

  override onPencilMove(screenPos: Position, pressure: number) {
    if (this.timeButton.isDown) {
      this.timeTravelTo(screenPos, pressure);
      return;
    }

    app.pen.moveToScreenPos(screenPos);
    const displayPos = scope.toDisplayPosition(app.pen.pos!);
    display.setPen(displayPos.x, displayPos.y);
    const snapPos = this.snap();
    if (snapPos) {
      const displayPseudoPos = scope.toDisplayPosition(app.pen.pos!);
      display.setPseudoPen(displayPseudoPos.x, displayPseudoPos.y);
    } else {
      display.setPseudoPen(displayPos.x, displayPos.y);
    }
    const pos = { x: app.pen.pos!.x, y: app.pen.pos!.y };

    if (this.drag) {
      const newX = pos.x - this.drag.offset.x;
      const newY = pos.y - this.drag.offset.y;
      this.drag.thing.moveBy(newX - this.drag.thing.x, newY - this.drag.thing.y);
    }

    if (!this.pencilClickInProgress && pressure > 3) {
      this.pencilClickInProgress = true;
      this.onPencilClick();
    }
    if (this.pencilClickInProgress && pressure < 1) {
      this.endDragEtc();
    }
  }

  override onPencilUp(screenPos: Position) {
    if (this.timeButton.isDown) {
      return;
    }

    app.pen.clearPos();
    this.endDragEtc();
    app.endLines();
    app.endArc();
  }

  timeTravelTo(screenPos: Position, pressure = 0) {
    maybeTimeTravelToWorldAt(screenPos);
    config().onionSkinAlpha = (Math.min(pressure, 4) / 4) * 0.9;
  }

  // TODO: come up w/ a better name for this method
  endDragEtc() {
    this.pencilClickInProgress = false;
    if (this.drag?.thing instanceof Handle) {
      app.drawing().mergeAndAddImplicitConstraints(this.drag.thing);
    }
    this.drag = null;
  }

  onPencilClick() {
    if (this.eqButton.isDown) {
      app.moreEqualLength();
    }
  }

  private oldAutoSolveSetting: boolean;

  override onButtonDown(b: Button) {
    if (isDrawingButton(b)) {
      if (app.pen.pos) {
        app.instantiate(b.label);
        this.move();
      } else {
        app.switchToDrawing(b.label);
      }
      return;
    }

    switch (b) {
      case this.clearButton:
        app.drawing().clear();
        scope.reset();
        break;
      case this.lineButton:
        app.moreLines();
        break;
      case this.arcButton:
        app.moreArc();
        break;
      case this.moveButton:
        this.move();
        break;
      case this.horvButton:
        app.horizontalOrVertical();
        break;
      case this.fixButton:
        app.fixedPoint() || app.fixedDistance();
        break;
      case this.sizeButton:
        app.fullSize();
        break;
      case this.weightButton:
        app.weight();
        break;
      case this.dismemberButton:
        app.dismember();
        break;
      case this.attacherButton:
        app.toggleAttacher();
        break;
      case this.deleteButton:
        app.del();
        break;
      case this.solveButton:
        if (Date.now() - b.lastDownTime < 200) {
          app.toggleAutoSolve();
        }
        break;
      case this.timeButton:
        topLevelWorld().updateRenderingInfo();
        status.setPos('top');
        this.oldAutoSolveSetting = config().autoSolve;
        config().autoSolve = false;
        break;
      case this.reloadButton:
        location.reload();
        break;
      case this.configButton:
        switchTo(configScreen);
        break;
    }
  }

  onButtonUp(b: Button) {
    switch (b) {
      case this.eqButton:
        app.endEqualLength();
        break;
      case this.timeButton:
        status.setPos('bottom');
        config().autoSolve = this.oldAutoSolveSetting;
        break;
    }
  }

  onFingerDown(screenPos: Position, id: number) {
    super.onFingerDown(screenPos, id);
    if (this.timeButton.isDown && id !== this.timeButton.fingerId) {
      this.timeTravelTo(screenPos);
    }
  }

  onFingerUp(screenPos: Position, id: number) {
    if (this.timeButton.isDown && id !== this.timeButton.fingerId) {
      this.timeTravelTo(screenPos);
    }
    super.onFingerUp(screenPos, id);
  }

  override onFingerMove(screenPos: Position, id: number) {
    if (this.timeButton.isDown) {
      if (id !== this.timeButton.fingerId) {
        this.timeTravelTo(screenPos);
      }
      return;
    }

    if (app.drawing().isEmpty() || this.fingerScreenPositions.size > 2) {
      return;
    }

    const oldScreenPos = this.fingerScreenPositions.get(id);
    if (!oldScreenPos) {
      return;
    }

    super.onFingerMove(screenPos, id);

    const pos = scope.fromScreenPosition(screenPos);
    const oldPos = scope.fromScreenPosition(oldScreenPos);

    if (!app.pen.pos) {
      app.panBy(pos.x - oldPos.x, pos.y - oldPos.y);
    }

    if (this.fingerScreenPositions.size !== 2) {
      return;
    }

    let otherFingerScreenPos: Position | null = null;
    for (const [otherId, otherScreenPos] of this.fingerScreenPositions.entries()) {
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

    if (app.instance() && !this.drag) {
      this.move();
    }

    if (!app.scaleInstanceBy(m) && !app.pen.pos) {
      scope.scale *= m;
    }

    app.rotateInstanceBy(newAngle - oldAngle);
  }

  move() {
    const handle = app.handle();
    if (handle) {
      this.drag = { thing: handle, offset: { x: 0, y: 0 } };
      return;
    }

    const thing = app.thing();
    if (thing) {
      this.drag = { thing, offset: pointDiff(app.pen.pos!, thing) };
    }
  }

  snap() {
    const snap = app.pen.snapPos(this.drag?.thing);
    if (snap && snap !== this.lastSnap) {
      this.hapticBump();
    }
    this.lastSnap = snap;
    return snap;
  }

  prepareHaptics() {
    wrapper.send('prepareHaptics');
  }

  hapticBump() {
    wrapper.send('hapticImpact');
  }

  render() {
    super.render();
    if (this.timeButton.isDown) {
      topLevelWorld().render();
    }
  }
})();

const configScreen = new (class extends Screen {
  readonly leftyButton = new Button('lefty');
  readonly lineWidthButton = new Button('lwidth');
  readonly alphaButton = new Button('opacity');
  readonly flickerButton = new Button('flicker');
  readonly ctrlPtsButton = new Button('ctrl pts');
  readonly debugButton = new Button('debug');
  readonly consoleButton = new Button('console');
  readonly defaultsButton = new Button('defaults');
  readonly backButton = new Button('back');
  readonly col1 = [
    this.leftyButton,
    this.lineWidthButton,
    this.alphaButton,
    this.flickerButton,
    this.ctrlPtsButton,
    this.debugButton,
    this.consoleButton,
    this.defaultsButton,
  ];
  readonly col2 = [this.backButton];

  constructor() {
    super();
    this.buttons.push(...this.col1, ...this.col2);
  }

  render() {
    super.render();
    drawText(
      config().lefty ? 'on' : 'off',
      this.leftyButton.leftX + 2 * config().tabletButtonWidth,
      this.leftyButton.topY,
    );
    drawText(
      config().lineWidth.toFixed(2),
      this.lineWidthButton.leftX + 2 * config().tabletButtonWidth,
      this.lineWidthButton.topY,
      0.35 * SMALL_CAPS,
    );
    drawText(
      config().baseAlphaMultiplier.toFixed(2),
      this.alphaButton.leftX + 2 * config().tabletButtonWidth,
      this.alphaButton.topY,
      0.35 * SMALL_CAPS,
    );
    drawText(
      config().flicker ? 'on' : 'off',
      this.flickerButton.leftX + 2 * config().tabletButtonWidth,
      this.flickerButton.topY,
    );
    drawText(
      config().showControlPoints ? 'on' : 'off',
      this.ctrlPtsButton.leftX + 2 * config().tabletButtonWidth,
      this.ctrlPtsButton.topY,
    );
    drawText(
      config().debug ? 'on' : 'off',
      this.debugButton.leftX + 2 * config().tabletButtonWidth,
      this.debugButton.topY,
    );
    drawText(
      config().console ? 'on' : 'off',
      this.consoleButton.leftX + 2 * config().tabletButtonWidth,
      this.consoleButton.topY,
    );
  }

  layOutButtons() {
    this.layOutButtonColumn(innerWidth / 2 - config().tabletButtonWidth / 2, this.col1);
    if (!config().lefty) {
      this.layOutButtonColumn(innerWidth - config().tabletButtonWidth, this.col2);
    } else {
      this.layOutButtonColumn(0, this.col2);
    }
  }

  onFrame() {
    // no op
  }

  onButtonDown(b: Button) {
    switch (b) {
      case this.defaultsButton:
        restoreDefaultConfig();
        status.set('restored defaults!');
        break;
      case this.leftyButton:
        updateConfig({ lefty: !config().lefty });
        break;
      case this.flickerButton:
        updateConfig({ flicker: !config().flicker });
        break;
      case this.ctrlPtsButton:
        updateConfig({ showControlPoints: !config().showControlPoints });
        break;
      case this.debugButton:
        updateConfig({ debug: !config().debug });
        break;
      case this.consoleButton:
        updateConfig({ console: !config().console });
        showHideConsole();
        break;
      case this.backButton:
        switchTo(mainScreen);
        break;
    }
  }

  onButtonUp(b: Button) {
    // no op
  }

  override onFingerMove(screenPos: Position, id: number): void {
    super.onFingerMove(screenPos, id);
    if (id === this.lineWidthButton.fingerId) {
      const lineWidth = Math.max(
        1,
        Math.min(config().lineWidth + ((screenPos.x - innerWidth / 2) / innerWidth) * 2, 10),
      );
      updateConfig({ lineWidth });
    } else if (id === this.alphaButton.fingerId) {
      const baseAlphaMultiplier = Math.max(
        0.5,
        Math.min(config().baseAlphaMultiplier + (screenPos.x - innerWidth / 2) / innerWidth, 2.5),
      );
      updateConfig({ baseAlphaMultiplier });
    }
  }
})();

export const isInConfigScreen = () => screen === configScreen;
