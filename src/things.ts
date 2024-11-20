import { drawArc, drawLine, flickeryWhite } from './canvas';
import { pointDist, pointDistToLineSegment, Position } from './helpers';
import Transform from './Transform';

export class Var {
  constructor(public value: number) {}
}

export interface Thing {
  contains(pos: Position, transform: Transform): boolean;
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

  contains(pos: Position, transform: Transform) {
    return pointDist(transform.applyTo(pos), transform.applyTo(this)) <= CLOSE_ENOUGH;
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

  contains(pos: Position, transform: Transform) {
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
    }
  }

  breakOff() {
    if (this.state instanceof PrimaryHandleState && this.state.children.size > 0) {
      const [firstChild] = [...this.state.children];
      firstChild.breakOff();
      for (const child of this.state.children) {
        if (child !== firstChild) {
          (firstChild.state as PrimaryHandleState).children.add(child);
        }
      }
      this.state.children.clear();
    } else if (this.state instanceof MergedHandleState) {
      (this.state.parent.state as PrimaryHandleState).children.delete(this);
      this.state = new PrimaryHandleState(this.x, this.y);
    }
  }

  contains(pos: Position, transform: Transform) {
    return this.state.contains(pos, transform);
  }

  render(selection: Set<Thing>, transform: Transform): void {}

  forEachHandle(fn: (h: Handle) => void) {
    fn(this);
  }

  forEachVar(fn: (v: Var) => void) {
    this.state.forEachVar(fn);
  }
}

export class Line implements Thing {
  readonly a: Handle;
  readonly b: Handle;

  constructor(aPos: Position, bPos: Position) {
    this.a = new Handle(aPos);
    this.b = new Handle(bPos);
  }

  contains(pos: Position, transform: Transform) {
    return (
      !this.a.contains(pos, transform) &&
      !this.b.contains(pos, transform) &&
      pointDistToLineSegment(
        transform.applyTo(pos),
        transform.applyTo(this.a),
        transform.applyTo(this.b),
      ) <= CLOSE_ENOUGH
    );
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

  contains(pos: Position, transform: Transform) {
    // TODO: only return `true` if p is between a and b (angle-wise)
    return (
      Math.abs(
        pointDist(transform.applyTo(pos), transform.applyTo(this.c)) -
          pointDist(transform.applyTo(this.a), transform.applyTo(this.c)),
      ) <= CLOSE_ENOUGH
    );
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
