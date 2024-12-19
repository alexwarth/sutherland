import {
  origin,
  pointDist,
  pointDistToLineSegment,
  rotateAround,
  scaleAround,
  translate,
} from './helpers';
import { Handle, Instance, Thing, Var } from './things';

export abstract class Constraint {
  constructor(
    protected readonly things: Thing[],
    protected readonly handles: Handle[]
  ) {}

  abstract computeError(): number;
  abstract get signature(): string;

  // TODO: consider returning false in certain constraint type-specific conditions
  // e.g., point-on-line(p, a, b) where p == a or p == b
  isStillValid(things: Set<Thing>, handles: Set<Handle>) {
    return (
      this.things.every(t => things.has(t)) &&
      this.handles.every(h => handles.has(h))
    );
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    for (let idx = 0; idx < this.handles.length; idx++) {
      const handle = this.handles[idx];
      this.handles.forEach((h, idx) => {
        if (h === oldHandle) {
          this.handles[idx] = newHandle;
        }
      });
    }
  }
}

export class PointsEqualConstraint extends Constraint {
  constructor(p1: Handle, p2: Handle) {
    super([], [p1, p2]);
  }

  private get p1() {
    return this.handles[0];
  }

  private get p2() {
    return this.handles[1];
  }

  get signature() {
    return `PE(${this.p1.id},${this.p2.id})`;
  }

  computeError() {
    return pointDist(this.p1, this.p2);
  }
}

export class HorizontalOrVerticalConstraint extends Constraint {
  constructor(a: Handle, b: Handle) {
    super([], [a, b]);
  }

  private get a() {
    return this.handles[0];
  }

  private get b() {
    return this.handles[1];
  }

  get signature() {
    const id1 = Math.min(this.a.id, this.b.id);
    const id2 = Math.max(this.a.id, this.b.id);
    return `HorV(${id1},${id2})`;
  }

  computeError() {
    return Math.min(
      Math.abs(this.a.x - this.b.x),
      Math.abs(this.a.y - this.b.y)
    );
  }
}

export class FixedDistanceConstraint extends Constraint {
  private readonly distance: number;

  constructor(a: Handle, b: Handle) {
    super([], [a, b]);
    this.distance = pointDist(a, b);
  }

  private get a() {
    return this.handles[0];
  }

  private get b() {
    return this.handles[1];
  }

  get signature() {
    const id1 = Math.min(this.a.id, this.b.id);
    const id2 = Math.max(this.a.id, this.b.id);
    return `D(${id1},${id2})`;
  }

  computeError() {
    return this.distance - pointDist(this.a, this.b);
  }
}

export class EqualDistanceConstraint extends Constraint {
  constructor(a1: Handle, b1: Handle, a2: Handle, b2: Handle) {
    super([], [a1, b1, a2, b2]);
  }

  private get a1() {
    return this.handles[0];
  }

  private get b1() {
    return this.handles[1];
  }

  private get a2() {
    return this.handles[2];
  }

  private get b2() {
    return this.handles[3];
  }

  get signature() {
    return `E(${this.a1.id},${this.b1.id},${this.a2.id},${this.b2.id})`;
  }

  computeError() {
    return Math.abs(pointDist(this.a1, this.b1) - pointDist(this.a2, this.b2));
  }
}

export class PointOnLineConstraint extends Constraint {
  constructor(p: Handle, a: Handle, b: Handle) {
    super([], [p, a, b]);
  }

  private get p() {
    return this.handles[0];
  }

  private get a() {
    return this.handles[1];
  }

  private get b() {
    return this.handles[2];
  }

  get signature() {
    return `POL(${this.p.id},${this.a.id},${this.b.id})`;
  }

  computeError() {
    return pointDistToLineSegment(this.p, this.a, this.b);
  }
}

export class PointOnArcConstraint extends Constraint {
  constructor(p: Handle, a: Handle, b: Handle, c: Handle) {
    super([], [p, a, b, c]);
  }

  private get p() {
    return this.handles[0];
  }

  private get a() {
    return this.handles[1];
  }

  private get b() {
    return this.handles[2];
  }

  private get c() {
    return this.handles[3];
  }

  get signature() {
    return `POA(${this.p.id},${this.a.id},${this.b.id},${this.c.id})`;
  }

  computeError() {
    return pointDist(this.p, this.c) - pointDist(this.a, this.c);
  }
}

export class PointInstanceConstraint extends Constraint {
  constructor(
    instancePoint: Handle,
    readonly instance: Instance,
    masterPoint: Handle
  ) {
    super([instance], [instancePoint, masterPoint]);
  }

  get instancePoint() {
    return this.handles[0];
  }

  get masterPoint() {
    return this.handles[1];
  }

  get signature() {
    return `PI(${this.instance.id},${this.masterPoint.id})`;
  }

  computeError() {
    return pointDist(
      this.instancePoint,
      translate(
        scaleAround(
          rotateAround(this.masterPoint, origin, this.instance.angle),
          origin,
          this.instance.scale
        ),
        this.instance
      )
    );
  }
}

export class SizeConstraint extends Constraint {
  constructor(
    readonly instance: Instance,
    readonly scale = 1
  ) {
    super([instance], []);
  }

  get signature() {
    return `S(${this.instance.id})`;
  }

  computeError() {
    return this.instance.size - this.scale * this.instance.master.size;
  }
}
