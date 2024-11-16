import { pointDistToLineSegment, generateId, pointDist, Position } from './helpers';
import Var from './Var';
import { drawArc, drawLine, flickeryWhite } from './canvas';
import Transform from './Transform';

export interface Thing {
  get handles(): Set<Handle>;
  contains(pos: Position): boolean;
  render(selection: Set<Thing>, t: Transform): void;
  remove(): void;
}

const HANDLE_RADIUS = 5;
const CLOSE_ENOUGH = HANDLE_RADIUS;

export class Handle implements Thing {
  readonly id = generateId();
  readonly xVar = new Var(0);
  readonly yVar = new Var(0);
  readonly handles = new Set([this]);

  constructor({ x, y }: Position) {
    this.x = x;
    this.y = y;
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

  mergeWith(that: Handle) {
    this.xVar.mergeWith(that.xVar);
    this.yVar.mergeWith(that.yVar);
  }

  get isCanonical() {
    return this.xVar.isCanonical && this.yVar.isCanonical;
  }

  equals(that: Handle) {
    return (
      this.xVar.canonical === that.xVar.canonical && this.yVar.canonical === that.yVar.canonical
    );
  }

  breakOff() {
    if (!this.isCanonical) {
      this.xVar.breakOff();
      this.yVar.breakOff();
    }
    return this;
  }

  contains(pos: Position) {
    return pointDist(pos, this) <= CLOSE_ENOUGH;
  }

  render(selection: Set<Thing>, t: Transform) {
    // no op
  }

  remove() {
    this.breakOff();
  }
}

export class Line implements Thing {
  readonly a: Handle;
  readonly b: Handle;
  readonly handles: Set<Handle>;

  constructor(aPos: Position, bPos: Position) {
    this.a = new Handle(aPos);
    this.b = new Handle(bPos);
    this.handles = new Set([this.a, this.b]);
  }

  contains(pos: Position) {
    return (
      !this.a.contains(pos) &&
      !this.b.contains(pos) &&
      pointDistToLineSegment(pos, this.a, this.b) <= CLOSE_ENOUGH
    );
  }

  render(selection: Set<Thing>, t: Transform) {
    drawLine(this.a, this.b, flickeryWhite(selection.has(this) ? 'bold' : 'normal'), t);
  }

  remove() {
    this.a.remove();
    this.b.remove();
  }
}

export class Arc {
  readonly a: Handle;
  readonly b: Handle;
  readonly c: Handle;
  readonly handles: Set<Handle>;

  constructor(aPos: Position, bPos: Position, cPos: Position) {
    this.a = new Handle(aPos);
    this.b = new Handle(bPos);
    this.c = new Handle(cPos);
    this.handles = new Set([this.a, this.b, this.c]);
  }

  remove() {
    this.a.remove();
    this.b.remove();
    this.c.remove();
  }

  contains(pos: Position) {
    // TODO: only return `true` if p is between a and b (angle-wise)
    return Math.abs(pointDist(pos, this.c) - pointDist(this.a, this.c)) <= CLOSE_ENOUGH;
  }

  render(selection: Set<Thing>, t: Transform) {
    drawArc(this.c, this.a, this.b, flickeryWhite(selection.has(this) ? 'bold' : 'normal'), t);
  }
}
