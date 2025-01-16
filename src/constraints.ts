import config from './config';
import { Handle, Instance, Thing } from './things';
import {
  Position,
  origin,
  pointDist,
  pointDistToLineSegment,
  rotateAround,
  scaleAround,
  translate,
} from './helpers';

export abstract class Constraint {
  constructor(
    protected readonly things: Thing[],
    protected readonly handles: Handle[],
  ) {}

  // override in subclasses like weight constraint
  preRelax(): void {}

  abstract map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>): Constraint;

  abstract computeError(): number;
  abstract get signature(): string;

  // TODO: consider returning false in certain constraint type-specific conditions
  // e.g., point-on-line(p, a, b) where p == a or p == b
  isStillValid(things: Set<Thing>, handles: Set<Handle>) {
    return this.things.every((t) => things.has(t)) && this.handles.every((h) => handles.has(h));
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

export class FixedPointConstraint extends Constraint {
  readonly pos: Position;

  constructor(p: Handle, { x, y }: Position) {
    super([], [p]);
    this.pos = { x, y };
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new FixedPointConstraint(handleMap.get(this.p)!, this.pos);
  }

  private get p() {
    return this.handles[0];
  }

  get signature() {
    return `FP(${this.p.id})`;
  }

  computeError() {
    return pointDist(this.p, this.pos) * 100;
  }
}

export class HorizontalOrVerticalConstraint extends Constraint {
  constructor(a: Handle, b: Handle) {
    super([], [a, b]);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new HorizontalOrVerticalConstraint(handleMap.get(this.a)!, handleMap.get(this.b)!);
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
    super([], [a, b]);
    this.distance = pointDist(a, b);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new FixedDistanceConstraint(handleMap.get(this.a)!, handleMap.get(this.b)!);
  }

  get a() {
    return this.handles[0];
  }

  get b() {
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

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new EqualDistanceConstraint(
      handleMap.get(this.a1)!,
      handleMap.get(this.b1)!,
      handleMap.get(this.a2)!,
      handleMap.get(this.b2)!,
    );
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

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new PointOnLineConstraint(
      handleMap.get(this.p)!,
      handleMap.get(this.a)!,
      handleMap.get(this.b)!,
    );
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

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new PointOnArcConstraint(
      handleMap.get(this.p)!,
      handleMap.get(this.a)!,
      handleMap.get(this.b)!,
      handleMap.get(this.c)!,
    );
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
    masterPoint: Handle,
  ) {
    super([instance], [instancePoint, masterPoint]);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new PointInstanceConstraint(
      handleMap.get(this.instancePoint)!,
      thingMap.get(this.instance) as Instance,
      this.masterPoint,
    );
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
          this.instance.scale,
        ),
        this.instance,
      ),
    );
  }
}

export class SizeConstraint extends Constraint {
  constructor(
    readonly instance: Instance,
    readonly scale = 1,
  ) {
    super([instance], []);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new SizeConstraint(thingMap.get(this.instance) as Instance, this.scale);
  }

  get signature() {
    return `S(${this.instance.id})`;
  }

  computeError() {
    return this.instance.size - this.scale * this.instance.master.size;
  }
}

export class WeightConstraint extends Constraint {
  private readonly distance: number;
  private y0: number;

  constructor(a: Handle) {
    super([], [a]);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new WeightConstraint(handleMap.get(this.a)!);
  }

  get a() {
    return this.handles[0];
  }

  get signature() {
    return `W(${this.a.id})`;
  }

  override preRelax() {
    this.y0 = this.a.y;
  }

  computeError() {
    const wantY = this.y0 - config().weight;
    return wantY - this.a.y;
  }
}
