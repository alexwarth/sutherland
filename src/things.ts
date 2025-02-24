import config from './config';
import scope from './scope';
import { drawArc, drawLine, drawPoint, drawText, flickeryWhite } from './canvas';
import { PointInstanceConstraint } from './constraints';
import { Drawing } from './Drawing';
import { List, Var, WorldlessVar } from './state';
import {
  Position,
  pointDist,
  pointDistToLineSegment,
  rotateAround,
  scaleAround,
  translate,
  origin,
  boundingBox,
} from './helpers';

type Transform = (pos: Position) => Position;

export interface Thing {
  get x(): number;
  get y(): number;
  contains(pos: Position): boolean;
  distanceTo(pos: Position): number;
  moveBy(dx: number, dy: number): void;
  render(transform: Transform, color?: string, depth?: number): void;
  forEachHandle(fn: (h: Handle) => void): void;
  replaceHandle(oldHandle: Handle, newHandle: Handle): void;
  forEachVar(fn: (v: Var<number>) => void): void;
}

export class Handle implements Thing {
  private static nextId = 0;

  readonly id = Handle.nextId++;

  private readonly _x: Var<number>;
  get x() {
    return this._x.value;
  }
  set x(newX: number) {
    this._x.value = newX;
  }

  private readonly _y: Var<number>;
  get y() {
    return this._y.value;
  }
  set y(newY: number) {
    this._y.value = newY;
  }

  constructor({ x, y }: Position, worldless = false) {
    this._x = new (worldless ? WorldlessVar : Var)(x);
    this._y = new (worldless ? WorldlessVar : Var)(y);
  }

  contains(pos: Position) {
    return pointDist(pos, this) <= config().closeEnough / scope.scale;
  }

  distanceTo(pos: Position) {
    return pointDist(this, pos);
  }

  moveBy(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
  }

  render(transform: Transform, color: string = config().instanceSideAttacherColor): void {
    if (config().debug) {
      drawText(transform(this), `(${this.x.toFixed(0)},${this.y.toFixed(0)})`);
    }
    drawPoint(this, color, transform);
  }

  forEachHandle(fn: (h: Handle) => void) {
    fn(this);
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    throw new Error('should never call replace() on Handle');
  }

  forEachVar(fn: (v: Var<number>) => void) {
    fn(this._x);
    fn(this._y);
  }

  toString() {
    return `handle(id=${this.id})`;
  }
}

export class Line implements Thing {
  private readonly _a: Var<Handle>;
  get a() {
    return this._a.value;
  }
  set a(a: Handle) {
    this._a.value = a;
  }

  private readonly _b: Var<Handle>;
  get b() {
    return this._b.value;
  }
  set b(b: Handle) {
    this._b.value = b;
  }

  constructor(
    aPos: Position,
    bPos: Position,
    readonly isGuide: boolean,
  ) {
    this._a = new Var(new Handle(aPos));
    this._b = new Var(new Handle(bPos));
  }

  get x() {
    return (this.a.x + this.b.x) / 2;
  }

  get y() {
    return (this.a.y + this.b.y) / 2;
  }

  contains(pos: Position) {
    return (
      !this.a.contains(pos) &&
      !this.b.contains(pos) &&
      this.distanceTo(pos) <= config().closeEnough / scope.scale
    );
  }

  distanceTo(pos: Position) {
    return pointDistToLineSegment(pos, this.a, this.b);
  }

  moveBy(dx: number, dy: number) {
    this.forEachHandle((h) => h.moveBy(dx, dy));
  }

  render(transform: Transform, color?: string) {
    if (this.isGuide && !config().showGuideLines) {
      return;
    }
    const style = this.isGuide ? config().guideLineColor : (color ?? flickeryWhite());
    drawLine(this.a, this.b, style, transform);
  }

  forEachHandle(fn: (h: Handle) => void): void {
    fn(this.a);
    fn(this.b);
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    if (this.a === oldHandle) {
      this.a = newHandle;
    }
    if (this.b === oldHandle) {
      this.b = newHandle;
    }
  }

  forEachVar(fn: (v: Var<number>) => void): void {
    this.forEachHandle((h) => h.forEachVar(fn));
  }
}

export class Arc implements Thing {
  private readonly _a: Var<Handle>;
  get a() {
    return this._a.value;
  }
  set a(a: Handle) {
    this._a.value = a;
  }

  private readonly _b: Var<Handle>;
  get b() {
    return this._b.value;
  }
  set b(b: Handle) {
    this._b.value = b;
  }

  private readonly _c: Var<Handle>;
  get c() {
    return this._c.value;
  }
  set c(c: Handle) {
    this._c.value = c;
  }

  private readonly _cummRotation: Var<number>; // TODO: update this while moving handles
  get cummRotation() {
    return this._cummRotation.value;
  }
  set cummRotation(cummRotation: number) {
    this._cummRotation.value = cummRotation;
  }

  constructor(aPos: Position, bPos: Position, cPos: Position, cummRotation: number) {
    this._a = new Var(new Handle(aPos));
    this._b = new Var(pointDist(aPos, bPos) === 0 ? this.a : new Handle(bPos));
    this._c = new Var(new Handle(cPos));
    this._cummRotation = new Var(cummRotation);
  }

  get x() {
    return this.c.x;
  }

  get y() {
    return this.c.y;
  }

  contains(pos: Position) {
    // TODO: only return `true` if p is between a and b (angle-wise)
    return this.distanceTo(pos) <= config().closeEnough / scope.scale;
  }

  distanceTo(pos: Position) {
    return Math.abs(pointDist(pos, this.c) - pointDist(this.a, this.c));
  }

  moveBy(dx: number, dy: number) {
    this.forEachHandle((h) => h.moveBy(dx, dy));
  }

  render(transform: Transform, color?: string, depth = 0) {
    drawArc(this.c, this.a, this.b, this.cummRotation, color ?? flickeryWhite(), transform);
    if (depth === 1 && config().showControlPoints) {
      drawPoint(this.a, config().controlPointColor, transform);
      drawPoint(this.b, config().controlPointColor, transform);
      drawPoint(this.c, config().controlPointColor, transform);
    }
  }

  forEachHandle(fn: (h: Handle) => void): void {
    fn(this.a);
    if (this.a !== this.b) {
      fn(this.b);
    }
    fn(this.c);
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    if (this.a === oldHandle) {
      this.a = newHandle;
    }
    if (this.b === oldHandle) {
      this.b = newHandle;
    }
    if (this.c === oldHandle) {
      this.c = newHandle;
    }
  }

  forEachVar(fn: (v: Var<number>) => void): void {
    this.forEachHandle((h) => h.forEachVar(fn));
  }
}

export class Instance implements Thing {
  private static nextId = 0;

  readonly transform = (p: Position) =>
    translate(scaleAround(rotateAround(p, origin, this.angle), origin, this.scale), this);

  readonly id = Instance.nextId++;

  private readonly _x: Var<number>;
  get x() {
    return this._x.value;
  }
  set x(x: number) {
    this._x.value = x;
  }

  private readonly _y: Var<number>;
  get y() {
    return this._y.value;
  }
  set y(y: number) {
    this._y.value = y;
  }

  private readonly _angleAndSizeVecX: Var<number>;
  private readonly _angleAndSizeVecY: Var<number>;

  private readonly _attachers: Var<List<Handle>>;
  get attachers() {
    return this._attachers.value;
  }
  set attachers(newAttachers: List<Handle>) {
    this._attachers.value = newAttachers;
  }

  constructor(
    readonly master: Drawing,
    x: number,
    y: number,
    size: number,
    angle: number,
    parent: Drawing,
  ) {
    this._x = new Var(x);
    this._y = new Var(y);
    this._angleAndSizeVecX = new Var(size * Math.cos(angle));
    this._angleAndSizeVecY = new Var(size * Math.sin(angle));
    this._attachers = new Var(
      master.attachers.map((masterSideAttacher) => this.createAttacher(masterSideAttacher, parent)),
    );
  }

  private createAttacher(masterSideAttacher: Handle, parent: Drawing) {
    const attacher = new Handle(this.transform(masterSideAttacher));
    parent.constraints.add(new PointInstanceConstraint(attacher, this, masterSideAttacher));
    return attacher;
  }

  addAttacher(masterSideAttacher: Handle, parent: Drawing) {
    this.attachers.unshift(this.createAttacher(masterSideAttacher, parent));
  }

  get size() {
    return Math.sqrt(
      Math.pow(this._angleAndSizeVecX.value, 2) + Math.pow(this._angleAndSizeVecY.value, 2),
    );
  }

  set size(newSize: number) {
    const angle = this.angle;
    this._angleAndSizeVecX.value = newSize * Math.cos(angle);
    this._angleAndSizeVecY.value = newSize * Math.sin(angle);
  }

  get angle() {
    return Math.atan2(this._angleAndSizeVecY.value, this._angleAndSizeVecX.value);
  }

  set angle(newAngle: number) {
    const size = this.size;
    this._angleAndSizeVecX.value = size * Math.cos(newAngle);
    this._angleAndSizeVecY.value = size * Math.sin(newAngle);
  }

  get scale() {
    return this.size / this.master.size;
  }

  set scale(newScale: number) {
    this.size = newScale * this.master.size;
  }

  contains(pos: Position): boolean {
    const { topLeft: ttl, bottomRight: tbr } = this.boundingBox();
    const ans = ttl.x <= pos.x && pos.x <= tbr.x && tbr.y <= pos.y && pos.y <= ttl.y;
    return ans;
  }

  boundingBox(stopAt = this.master) {
    const { topLeft, bottomRight } = this.master.boundingBox(stopAt);
    const ps = [
      topLeft,
      bottomRight,
      { x: topLeft.x, y: bottomRight.y },
      { x: bottomRight.x, y: topLeft.y },
    ].map(this.transform);
    return boundingBox(ps);
  }

  distanceTo(pos: Position) {
    return pointDist(pos, this);
  }

  moveBy(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
    this.forEachHandle((h) => h.moveBy(dx, dy));
  }

  render(transform: Transform, color?: string, depth = 0) {
    this.master.render((pos) => transform(this.transform(pos)), color, depth);
    if (depth === 1) {
      // draw instance-side attachers
      this.attachers.withDo(this.master.attachers, (attacher, mAttacher) => {
        const tAttacher = transform(attacher);
        drawLine(
          transform(this.transform(mAttacher)),
          tAttacher,
          config().instanceSideAttacherColor,
        );
        drawPoint(tAttacher, config().instanceSideAttacherColor);
      });
    }
  }

  forEachHandle(fn: (h: Handle) => void): void {
    this.attachers.forEach(fn);
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    this.attachers = this.attachers.map((h) => (h === oldHandle ? newHandle : h));
  }

  forEachVar(fn: (v: Var<number>) => void): void {
    fn(this._x);
    fn(this._y);
    fn(this._angleAndSizeVecX);
    fn(this._angleAndSizeVecY);
    this.forEachHandle((h) => h.forEachVar(fn));
  }
}
