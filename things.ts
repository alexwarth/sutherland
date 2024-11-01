import Vec from './src/lib/vec';
import { Position } from './src/types';
import { drawArc, drawCircle, drawLine, fillCircle, flickeryWhite } from './canvas';
import { distToPoint } from './src/lib/geometry';
import Handle from './src/Handle';
import * as constraints from './src/constraints';

// TODO: figure out what to do about canonical handles when copying

const HANDLE_RADIUS = 5;
const CLOSE_ENOUGH = HANDLE_RADIUS * 2;

export class Handles {
  static hoverHandle: Handle | null = null;
  static dragHandle: Handle | null = null;

  static render(h: Handle) {
    if (h.canonicalInstance !== h || (h !== Handles.hoverHandle && h !== Handles.dragHandle)) {
      return;
    }

    fillCircle(h, HANDLE_RADIUS);
    if (h === Handles.dragHandle) {
      drawCircle(h, HANDLE_RADIUS * 2, flickeryWhite('light'));
    }
  }

  static mergeWithNearestAndAddImplicitConstraints(h: Handle) {
    h.getAbsorbedByNearestHandle();
    for (const line of Line.all) {
      if (line.containsPos(h)) {
        // add point-on-line constraint
        constraints.equals(
          constraints.polarVector(line.a, h).angle,
          constraints.polarVector(h, line.b).angle,
        );
      }
    }
    for (const arc of Arc.all) {
      if (arc.containsPos(h)) {
        // add point-on-arc constraint
        constraints.equals(
          constraints.polarVector(arc.c, arc.a).distance,
          constraints.polarVector(arc.c, h).distance,
        );
      }
    }
  }
}

export const selection = new Set<Arc | Line>();

export interface Thing {
  render(cursorPos: Position): void;
  containsPos(pos: Position): boolean;
  addCanonicalHandlesTo(handles: Set<Handle>): void;
}

export class Line implements Thing {
  static readonly all = new Set<Line>();

  readonly a: Handle;
  readonly b: Handle;

  constructor(aPos: Position, bPos: Position) {
    this.a = Handle.create(aPos);
    this.b = Handle.create(bPos);
    Line.all.add(this);

    for (const h of Handle.all) {
      if (this.containsPos(h)) {
        // add point-on-line constraint
        constraints.equals(
          constraints.polarVector(this.a, h).angle,
          constraints.polarVector(h, this.b).angle,
        );
      }
    }
  }

  remove() {
    selection.delete(this);
    Line.all.delete(this);
    // this.a.remove();
    // this.b.remove();
  }

  addCanonicalHandlesTo(handles: Set<Handle>): void {
    handles.add(this.a.canonicalInstance);
    handles.add(this.b.canonicalInstance);
  }

  render() {
    drawLine(
      this.a.canonicalInstance,
      this.b.canonicalInstance,
      flickeryWhite(selection.has(this) ? 'bold' : 'normal'),
    );
  }

  containsPos(pos: Position) {
    return (
      distToPoint({ a: this.a.canonicalInstance, b: this.b.canonicalInstance }, pos) <=
        CLOSE_ENOUGH && // point is on the line...
      Vec.dist(pos, this.a.canonicalInstance) > CLOSE_ENOUGH && // ... but not near
      Vec.dist(pos, this.b.canonicalInstance) > CLOSE_ENOUGH // ... the ends
    );
  }

  makeCopy() {
    return new Line(Handle.create(this.a, false), Handle.create(this.b, false));
  }
}

export class Arc {
  static readonly all = new Set<Arc>();

  readonly a: Handle;
  readonly b: Handle;
  readonly c: Handle;

  constructor(aPos: Position, bPos: Position, cPos: Position) {
    this.a = Handle.create(aPos);
    this.b = Handle.create(bPos);
    this.c = Handle.create(cPos);
    Arc.all.add(this);
  }

  remove() {
    selection.delete(this);
    Arc.all.delete(this);
    this.a.remove();
    this.b.remove();
    this.c.remove();
  }

  addCanonicalHandlesTo(handles: Set<Handle>): void {
    handles.add(this.a.canonicalInstance);
    handles.add(this.b.canonicalInstance);
    handles.add(this.c.canonicalInstance);
  }

  render() {
    drawArc(
      this.c,
      this.a.canonicalInstance,
      this.b.canonicalInstance,
      flickeryWhite(selection.has(this) ? 'bold' : 'normal'),
    );
  }

  containsPos(pos: Position) {
    // TODO: only return `true` if p is between a and b (angle-wise)
    return (
      Math.abs(
        Vec.dist(pos, this.c.canonicalInstance) -
          Vec.dist(this.a.canonicalInstance, this.c.canonicalInstance),
      ) <= CLOSE_ENOUGH
    );
  }

  makeCopy() {
    return new Arc(
      Handle.create(this.a, false),
      Handle.create(this.b, false),
      Handle.create(this.c, false),
    );
  }
}
