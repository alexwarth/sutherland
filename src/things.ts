import { config } from './config';
import { drawArc, drawLine, drawText, flickeryWhite } from './canvas';
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
import { Master } from './Master';

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
  forEachVar(fn: (v: Var) => void): void;
}

const HANDLE_RADIUS = 5;
const CLOSE_ENOUGH = HANDLE_RADIUS;

class PrimaryHandleState {
  readonly xVar: Var;
  readonly yVar: Var;
  readonly children: Set<Handle>;

  constructor(x: number, y: number) {
    this.xVar = new Var(x);
    this.yVar = new Var(y);
    this.children = new Set();
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

  forEachVar(fn: (v: Var) => void) {
    fn(this.xVar);
    fn(this.yVar);
  }
}

class MergedHandleState {
  constructor(public parent: Handle) {}

  get x() {
    return this.parent.x;
  }

  set x(newX: number) {
    this.parent.x = newX;
  }

  get y() {
    return this.parent.y;
  }

  set y(newY: number) {
    this.parent.y = newY;
  }

  contains(pos: Position) {
    return false;
  }

  forEachVar(fn: (v: Var) => void) {}
}

export class Handle implements Thing {
  private static nextId = 0;

  readonly id = Handle.nextId++;
  state: PrimaryHandleState | MergedHandleState;

  constructor({ x, y }: Position) {
    this.state = new PrimaryHandleState(x, y);
  }

  get x() {
    return this.state.x;
  }

  set x(newX: number) {
    this.state.x = newX;
  }

  get y() {
    return this.state.y;
  }

  set y(newY: number) {
    this.state.y = newY;
  }

  get primary() {
    return this.state instanceof PrimaryHandleState ? this : this.state.parent;
  }

  mergeWith(that: Handle) {
    if (!(this.state instanceof PrimaryHandleState)) {
      this.state.parent.mergeWith(that);
    } else if (!(that.state instanceof PrimaryHandleState)) {
      this.mergeWith(that.state.parent);
    } else if (this !== that) {
      for (const h of that.state.children) {
        (h.state as MergedHandleState).parent = this;
        this.state.children.add(h);
      }
      that.state = new MergedHandleState(this);
      this.state.children.add(that);
    }
  }

  breakOff(): Handle | null {
    if (this.state instanceof MergedHandleState) {
      (this.state.parent.state as PrimaryHandleState).children.delete(this);
      const oldParent = this.state.parent;
      this.state = new PrimaryHandleState(this.x, this.y);
      return oldParent;
    } else if (this.state.children.size > 0) {
      const [firstChild] = [...this.state.children];
      firstChild.state = new PrimaryHandleState(this.x, this.y);
      for (const child of this.state.children) {
        if (child !== firstChild) {
          firstChild.state.children.add(child);
          (child.state as MergedHandleState).parent = firstChild;
        }
      }
      this.state.children.clear();
      return firstChild;
    } else {
      return null;
    }
  }

  contains(pos: Position) {
    return this.state.contains(pos);
  }

  moveBy(dx: number, dy: number) {
    this.primary.x += dx;
    this.primary.y += dy;
  }

  render(selection: Set<Thing>, transform: Transform, isAttacher = false): void {
    // if (this.primary === this) {
    //   drawText(this, this.toString(), 'white', transform);
    // }
    if (isAttacher) {
      drawLine(this, this, ATTACHER_COLOR, transform);
    }
  }

  forEachHandle(fn: (h: Handle) => void) {
    fn(this);
  }

  forEachVar(fn: (v: Var) => void) {
    this.state.forEachVar(fn);
  }

  toString() {
    return this.state instanceof PrimaryHandleState
      ? `primary(id=${this.id}, children [${[...this.state.children].map((h) => h.id).join(', ')}])`
      : `merged(id=${this.id}, parent=${this.state.parent.id})`;
  }
}

export class Line implements Thing {
  readonly a: Handle;
  readonly b: Handle;

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

  forEachVar(fn: (v: Var) => void): void {
    this.forEachHandle((h) => h.forEachVar(fn));
  }
}

export class Arc implements Thing {
  readonly a: Handle;
  readonly b: Handle;
  readonly c: Handle;

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
  readonly attachers: Handle[] = [];

  constructor(
    readonly master: Master,
    x: number,
    y: number,
    size: number,
    parent: Master,
  ) {
    this.xVar = new Var(x);
    this.yVar = new Var(y);
    this.angleAndSizeVecX = new Var(size);
    this.angleAndSizeVecY = new Var(0);
    this.addAttachers(master, parent);
  }

  private addAttachers(master: Master, parent: Master) {
    for (const h of master.attachers) {
      if (h === h.primary) {
        const attacher = new Handle(this.transform(h));
        this.attachers.push(attacher);
        parent.constraints.add(new PointInstanceConstraint(attacher, this, h));
      }
    }
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
          transform(this.transform(this.master.attachers[idx].primary)),
          transform(attacher.primary),
          ATTACHER_COLOR,
        );
      });
    }
  }

  forEachHandle(fn: (h: Handle) => void): void {
    this.attachers.forEach(fn);
  }

  forEachVar(fn: (v: Var) => void): void {
    fn(this.xVar);
    fn(this.yVar);
    fn(this.angleAndSizeVecX);
    fn(this.angleAndSizeVecY);
    this.forEachHandle((h) => h.forEachVar(fn));
  }
}
