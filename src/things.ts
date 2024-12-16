import { drawArc, drawLine, flickeryWhite } from './canvas';
import { PointInstanceConstraint } from './constraints';
import {
  pointDist,
  pointDistToLineSegment,
  Position,
  rotateAround,
  scaleAround,
  translate,
  origin,
  boundingBox,
} from './helpers';
import { Drawing } from './Drawing';

const ATTACHER_COLOR = 'rgba(255,222,33,1.25)';

export class Var {
  constructor(public value: number) {}
}

type Transform = (pos: Position) => Position;

export interface Thing {
  contains(pos: Position): boolean;
  moveBy(dx: number, dy: number): void;
  render(selection: Set<Thing>, transform: Transform): void;
  forEachHandle(fn: (h: Handle) => void): void;
  replaceHandle(oldHandle: Handle, newHandle: Handle): void;
  forEachVar(fn: (v: Var) => void): void;
}

const HANDLE_RADIUS = 5;
const CLOSE_ENOUGH = HANDLE_RADIUS;

export class Handle implements Thing {
  private static nextId = 0;

  readonly id = Handle.nextId++;
  readonly xVar: Var;
  readonly yVar: Var;

  constructor({ x, y }: Position) {
    this.xVar = new Var(x);
    this.yVar = new Var(y);
  }

  get x() {
    return this.xVar.value;
  }

  set x(newX: number) {
    this.xVar.value = newX;
  }

  get y() {
    return this.yVar.value;
  }

  set y(newY: number) {
    this.yVar.value = newY;
  }

  contains(pos: Position) {
    return pointDist(pos, this) <= CLOSE_ENOUGH;
  }

  moveBy(dx: number, dy: number) {
    this.xVar.value += dx;
    this.yVar.value += dy;
  }

  render(selection: Set<Thing>, transform: Transform, isAttacher = false): void {
    if (isAttacher) {
      drawLine(this, this, ATTACHER_COLOR, transform);
    }
  }

  forEachHandle(fn: (h: Handle) => void) {
    fn(this);
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    throw new Error('should never call replace() on Handle');
  }

  forEachVar(fn: (v: Var) => void) {
    fn(this.xVar);
    fn(this.yVar);
  }

  toString() {
    return `handle(id=${this.id})`;
  }
}

export class Line implements Thing {
  a: Handle;
  b: Handle;

  constructor(aPos: Position, bPos: Position) {
    this.a = new Handle(aPos);
    this.b = new Handle(bPos);
  }

  contains(pos: Position) {
    return (
      !this.a.contains(pos) &&
      !this.b.contains(pos) &&
      pointDistToLineSegment(pos, this.a, this.b) <= CLOSE_ENOUGH
    );
  }

  moveBy(dx: number, dy: number) {
    this.forEachHandle((h) => h.moveBy(dx, dy));
  }

  render(selection: Set<Thing>, transform: Transform) {
    drawLine(this.a, this.b, flickeryWhite(selection.has(this) ? 'bold' : 'normal'), transform);
  }

  forEachHandle(fn: (h: Handle) => void): void {
    fn(this.a);
    fn(this.b);
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    if (this.a == oldHandle) {
      this.a = newHandle;
    }
    if (this.b == oldHandle) {
      this.b = newHandle;
    }
  }

  forEachVar(fn: (v: Var) => void): void {
    this.forEachHandle((h) => h.forEachVar(fn));
  }
}

export class Arc implements Thing {
  a: Handle;
  b: Handle;
  c: Handle;

  constructor(aPos: Position, bPos: Position, cPos: Position) {
    this.a = new Handle(aPos);
    this.b = new Handle(bPos);
    this.c = new Handle(cPos);
  }

  contains(pos: Position) {
    // TODO: only return `true` if p is between a and b (angle-wise)
    return Math.abs(pointDist(pos, this.c) - pointDist(this.a, this.c)) <= CLOSE_ENOUGH;
  }

  moveBy(dx: number, dy: number) {
    this.forEachHandle((h) => h.moveBy(dx, dy));
  }

  render(selection: Set<Thing>, transform: Transform) {
    drawArc(
      this.c,
      this.a,
      this.b,
      flickeryWhite(selection.has(this) ? 'bold' : 'normal'),
      transform,
    );
  }

  forEachHandle(fn: (h: Handle) => void): void {
    fn(this.a);
    fn(this.b);
    fn(this.c);
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    if (this.a == oldHandle) {
      this.a = newHandle;
    }
    if (this.b == oldHandle) {
      this.b = newHandle;
    }
    if (this.c == oldHandle) {
      this.c = newHandle;
    }
  }

  forEachVar(fn: (v: Var) => void): void {
    this.forEachHandle((h) => h.forEachVar(fn));
  }
}

export class Instance implements Thing {
  private static nextId = 0;

  readonly transform = (p: Position) =>
    translate(scaleAround(rotateAround(p, origin, this.angle), origin, this.scale), this);

  readonly id = Instance.nextId++;
  readonly xVar: Var;
  readonly yVar: Var;
  readonly angleAndSizeVecX: Var;
  readonly angleAndSizeVecY: Var;
  attachers: Handle[] = [];

  constructor(
    readonly master: Drawing,
    x: number,
    y: number,
    size: number,
    parent: Drawing,
  ) {
    this.xVar = new Var(x);
    this.yVar = new Var(y);
    this.angleAndSizeVecX = new Var(size);
    this.angleAndSizeVecY = new Var(0);
    this.addAttachers(master, parent);
  }

  private addAttachers(master: Drawing, parent: Drawing) {
    for (const masterSideAttacher of master.attachers) {
      this.addAttacher(masterSideAttacher, parent);
    }
  }

  addAttacher(masterSideAttacher: Handle, parent: Drawing) {
    const attacher = new Handle(this.transform(masterSideAttacher));
    this.attachers.push(attacher);
    parent.constraints.add(new PointInstanceConstraint(attacher, this, masterSideAttacher));
  }

  get x() {
    return this.xVar.value;
  }

  set x(x: number) {
    this.xVar.value = x;
  }

  get y() {
    return this.yVar.value;
  }

  set y(y: number) {
    this.yVar.value = y;
  }

  get size() {
    return Math.sqrt(
      Math.pow(this.angleAndSizeVecX.value, 2) + Math.pow(this.angleAndSizeVecY.value, 2),
    );
  }

  set size(newSize: number) {
    const angle = this.angle;
    this.angleAndSizeVecX.value = newSize * Math.cos(angle);
    this.angleAndSizeVecY.value = newSize * Math.sin(angle);
  }

  get angle() {
    return Math.atan2(this.angleAndSizeVecY.value, this.angleAndSizeVecX.value);
  }

  set angle(newAngle: number) {
    const size = this.size;
    this.angleAndSizeVecX.value = size * Math.cos(newAngle);
    this.angleAndSizeVecY.value = size * Math.sin(newAngle);
  }

  get scale() {
    return this.size / this.master.size;
  }

  set scale(newScale: number) {
    this.size = newScale * this.master.size;
  }

  contains(pos: Position): boolean {
    const { topLeft, bottomRight } = this.master.boundingBox();
    const ps = [
      topLeft,
      bottomRight,
      { x: topLeft.x, y: bottomRight.y },
      { x: bottomRight.x, y: topLeft.y },
    ].map(this.transform);
    const { topLeft: min, bottomRight: max } = boundingBox(ps);
    return min.x <= pos.x && pos.x <= max.x && min.y <= pos.y && pos.y <= max.y;
  }

  moveBy(dx: number, dy: number) {
    this.x += dx;
    this.y += dy;
    this.forEachHandle((h) => h.moveBy(dx, dy));
  }

  render(selection: Set<Thing>, transform: Transform, depth = 0) {
    this.master.render((pos) => transform(this.transform(pos)), depth + 1);
    if (depth === 1) {
      this.attachers.forEach((attacher, idx) => {
        drawLine(
          transform(this.transform(this.master.attachers[idx])),
          transform(attacher),
          ATTACHER_COLOR,
        );
      });
    }
  }

  forEachHandle(fn: (h: Handle) => void): void {
    this.attachers.forEach(fn);
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    this.attachers = this.attachers.map((h) => (h === oldHandle ? newHandle : h));
  }

  forEachVar(fn: (v: Var) => void): void {
    fn(this.xVar);
    fn(this.yVar);
    fn(this.angleAndSizeVecX);
    fn(this.angleAndSizeVecY);
    this.forEachHandle((h) => h.forEachVar(fn));
  }
}
