import { pointDist, pointDistToLineSegment } from './helpers';
import { Handle } from './things';

export interface Constraint {
  readonly signature: string;
  computeError(): number;
}

export class PointsEqualConstraint implements Constraint {
  constructor(
    private readonly p1: Handle,
    private readonly p2: Handle,
  ) {}

  get signature() {
    return `PE(${this.p1.id},${this.p2.id})`;
  }

  computeError() {
    return pointDist(this.p1, this.p2);
  }
}

export class HorizontalOrVerticalConstraint implements Constraint {
  constructor(
    private readonly a: Handle,
    private readonly b: Handle,
  ) {}

  get signature() {
    const id1 = Math.min(this.a.id, this.b.id);
    const id2 = Math.max(this.a.id, this.b.id);
    return `HorV(${id1},${id2})`;
  }

  computeError() {
    return Math.min(Math.abs(this.a.x - this.b.x), Math.abs(this.a.y - this.b.y));
  }
}

export class FixedDistanceConstraint implements Constraint {
  private readonly distance: number;

  constructor(
    private readonly a: Handle,
    private readonly b: Handle,
  ) {
    this.distance = pointDist(a, b);
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

export class EqualDistanceConstraint implements Constraint {
  constructor(
    private readonly a1: Handle,
    private readonly b1: Handle,
    private readonly a2: Handle,
    private readonly b2: Handle,
  ) {}

  get signature() {
    return `E(${this.a1.id},${this.b1.id},${this.a2.id},${this.b2.id})`;
  }

  computeError() {
    return Math.abs(pointDist(this.a1, this.b1) - pointDist(this.a2, this.b2));
  }
}

export class PointOnLineConstraint implements Constraint {
  constructor(
    private readonly p: Handle,
    private readonly a: Handle,
    private readonly b: Handle,
  ) {}

  get signature() {
    return `POL(${this.p.id},${this.a.id},${this.b.id})`;
  }

  computeError() {
    return pointDistToLineSegment(this.p, this.a, this.b);
  }
}

export class PointOnArcConstraint implements Constraint {
  constructor(
    readonly p: Handle,
    readonly a: Handle,
    readonly b: Handle,
    readonly c: Handle,
  ) {}

  get signature() {
    return `POA(${this.p.id},${this.a.id},${this.b.id},${this.c.id})`;
  }

  computeError() {
    return pointDist(this.p, this.c) - pointDist(this.a, this.c);
  }
}
