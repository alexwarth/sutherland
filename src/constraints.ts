import { pointDist, pointDistToLineSegment } from './helpers';
import { Handle } from './things';

export abstract class Constraint {
  constructor(protected readonly handles: Handle[]) {}

  abstract computeError(): number;
  abstract get signature(): string;

  replaceHandles(handleMap: Map<Handle, Handle | null>) {
    for (let idx = 0; idx < this.handles.length; idx++) {
      const handle = this.handles[idx];
      if (!handleMap.has(handle)) {
        continue;
      }

      const replacementHandle = handleMap.get(this.handles[idx]);
      if (replacementHandle == null) {
        return false;
      }
      this.handles[idx] = replacementHandle;
    }
    return true;
  }
}

export class PointsEqualConstraint extends Constraint {
  constructor(p1: Handle, p2: Handle) {
    super([p1, p2]);
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
    super([a, b]);
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
    return Math.min(Math.abs(this.a.x - this.b.x), Math.abs(this.a.y - this.b.y));
  }
}

export class FixedDistanceConstraint extends Constraint {
  private readonly distance: number;

  constructor(a: Handle, b: Handle) {
    super([a, b]);
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
    super([a1, b1, a2, b2]);
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
    super([p, a, b]);
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
    super([p, a, b, c]);
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
