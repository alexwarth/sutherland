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
import { Var } from './state';

export abstract class Constraint {
  abstract get signature(): string;
  abstract computeError(): number;
  abstract map(
    thingMap: Map<Thing, Thing>,
    handleMap: Map<Handle, Handle>,
    transform: (pos: Position) => Position,
  ): Constraint;
  abstract forEachThing(fn: (t: Thing) => void): void;
  abstract forEachHandle(fn: (t: Handle) => void): void;
  abstract replaceHandle(oldHandle: Handle, newHandle: Handle): void;

  // override in subclasses like weight constraint
  preRelax(): void {}

  // TODO: consider returning false in certain constraint type-specific conditions
  // e.g., point-on-line(p, a, b) where p == a or p == b
  isStillValid(things: Set<Thing>, handles: Set<Handle>) {
    let valid = true;
    this.forEachThing((t) => {
      if (!things.has(t)) {
        valid = false;
      } else {
        this.forEachHandle((h) => {
          if (!handles.has(h)) {
            valid = false;
          }
        });
      }
    });
    return valid;
  }
}

export class FixedPointConstraint extends Constraint {
  private readonly _p: Var<Handle>;
  private get p() {
    return this._p.value;
  }
  private set p(newP: Handle) {
    this._p.value = newP;
  }

  readonly pos: Position;

  constructor(p: Handle, { x, y }: Position) {
    super();
    this._p = new Var(p);
    this.pos = { x, y }; // note: we hold onto a clone of the point!
  }

  override get signature() {
    return `FP(${this.p.id})`;
  }

  override computeError() {
    return pointDist(this.p, this.pos) * 100;
  }

  override map(
    thingMap: Map<Thing, Thing>,
    handleMap: Map<Handle, Handle>,
    transform: (pos: Position) => Position,
  ) {
    return new FixedPointConstraint(handleMap.get(this.p)!, transform(this.pos));
  }

  override forEachThing(fn: (t: Thing) => void): void {
    // no op
  }

  override forEachHandle(fn: (t: Handle) => void): void {
    fn(this.p);
  }

  override replaceHandle(oldHandle: Handle, newHandle: Handle) {
    if (this.p === oldHandle) {
      this.p = newHandle;
    }
  }
}

export class HorizontalOrVerticalConstraint extends Constraint {
  private readonly _a: Var<Handle>;
  private get a() {
    return this._a.value;
  }
  private set a(newA: Handle) {
    this._a.value = newA;
  }

  private readonly _b: Var<Handle>;
  private get b() {
    return this._b.value;
  }
  private set b(newB: Handle) {
    this._b.value = newB;
  }

  constructor(a: Handle, b: Handle) {
    super();
    this._a = new Var(a);
    this._b = new Var(b);
  }

  override get signature() {
    const id1 = Math.min(this.a.id, this.b.id);
    const id2 = Math.max(this.a.id, this.b.id);
    return `HorV(${id1},${id2})`;
  }

  override computeError() {
    return Math.min(Math.abs(this.a.x - this.b.x), Math.abs(this.a.y - this.b.y));
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new HorizontalOrVerticalConstraint(handleMap.get(this.a)!, handleMap.get(this.b)!);
  }

  override forEachThing(fn: (t: Thing) => void): void {
    // no op
  }

  override forEachHandle(fn: (t: Handle) => void): void {
    fn(this.a);
    fn(this.b);
  }

  override replaceHandle(oldHandle: Handle, newHandle: Handle): void {
    if (this.a === oldHandle) {
      this.a = newHandle;
    }
    if (this.b === oldHandle) {
      this.b = newHandle;
    }
  }
}

export class FixedDistanceConstraint extends Constraint {
  private readonly _a: Var<Handle>;
  get a() {
    return this._a.value;
  }
  private set a(newA: Handle) {
    this._a.value = newA;
  }

  private readonly _b: Var<Handle>;
  get b() {
    return this._b.value;
  }
  private set b(newB: Handle) {
    this._b.value = newB;
  }

  private readonly distance: number;

  constructor(a: Handle, b: Handle) {
    super();
    this._a = new Var(a);
    this._b = new Var(b);
    this.distance = pointDist(a, b);
  }

  override get signature() {
    const id1 = Math.min(this.a.id, this.b.id);
    const id2 = Math.max(this.a.id, this.b.id);
    return `D(${id1},${id2})`;
  }

  override computeError() {
    return this.distance - pointDist(this.a, this.b);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new FixedDistanceConstraint(handleMap.get(this.a)!, handleMap.get(this.b)!);
  }

  override forEachThing(fn: (t: Thing) => void): void {
    // no op
  }

  override forEachHandle(fn: (t: Handle) => void): void {
    fn(this.a);
    fn(this.b);
  }

  override replaceHandle(oldHandle: Handle, newHandle: Handle): void {
    if (this.a === oldHandle) {
      this.a = newHandle;
    }
    if (this.b === oldHandle) {
      this.b = newHandle;
    }
  }
}

export class EqualDistanceConstraint extends Constraint {
  private readonly _a1: Var<Handle>;
  private get a1() {
    return this._a1.value;
  }
  private set a1(newA1: Handle) {
    this._a1.value = newA1;
  }

  private readonly _b1: Var<Handle>;
  private get b1() {
    return this._b1.value;
  }
  private set b1(newB1: Handle) {
    this._b1.value = newB1;
  }

  private readonly _a2: Var<Handle>;
  private get a2() {
    return this._a2.value;
  }
  private set a2(newA2: Handle) {
    this._a2.value = newA2;
  }

  private readonly _b2: Var<Handle>;
  private get b2() {
    return this._b2.value;
  }
  private set b2(newB2: Handle) {
    this._b2.value = newB2;
  }

  constructor(a1: Handle, b1: Handle, a2: Handle, b2: Handle) {
    super();
    this._a1 = new Var(a1);
    this._b1 = new Var(b1);
    this._a2 = new Var(a2);
    this._b2 = new Var(b2);
  }

  override get signature() {
    return `E(${this.a1.id},${this.b1.id},${this.a2.id},${this.b2.id})`;
  }

  override computeError() {
    return Math.abs(pointDist(this.a1, this.b1) - pointDist(this.a2, this.b2));
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new EqualDistanceConstraint(
      handleMap.get(this.a1)!,
      handleMap.get(this.b1)!,
      handleMap.get(this.a2)!,
      handleMap.get(this.b2)!,
    );
  }

  forEachThing(fn: (t: Thing) => void): void {
    // no op
  }

  forEachHandle(fn: (t: Handle) => void): void {
    fn(this.a1);
    fn(this.b1);
    fn(this.a2);
    fn(this.b2);
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle): void {
    if (this.a1 === oldHandle) {
      this.a1 = newHandle;
    }
    if (this.b1 === oldHandle) {
      this.b1 = newHandle;
    }
    if (this.a2 === oldHandle) {
      this.a2 = newHandle;
    }
    if (this.b2 === oldHandle) {
      this.b2 = newHandle;
    }
  }
}

export class PointOnLineConstraint extends Constraint {
  private readonly _p: Var<Handle>;
  private get p() {
    return this._p.value;
  }
  private set p(newP: Handle) {
    this._p.value = newP;
  }

  private readonly _a: Var<Handle>;
  private get a() {
    return this._a.value;
  }
  private set a(newA: Handle) {
    this._a.value = newA;
  }

  private readonly _b: Var<Handle>;
  private get b() {
    return this._b.value;
  }
  private set b(newB: Handle) {
    this._b.value = newB;
  }

  constructor(p: Handle, a: Handle, b: Handle) {
    super();
    this._p = new Var(p);
    this._a = new Var(a);
    this._b = new Var(b);
  }

  override get signature() {
    return `POL(${this.p.id},${this.a.id},${this.b.id})`;
  }

  override computeError() {
    return pointDistToLineSegment(this.p, this.a, this.b);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new PointOnLineConstraint(
      handleMap.get(this.p)!,
      handleMap.get(this.a)!,
      handleMap.get(this.b)!,
    );
  }

  override forEachThing(fn: (t: Thing) => void): void {
    // no op
  }

  override forEachHandle(fn: (t: Handle) => void): void {
    fn(this.p);
    fn(this.a);
    fn(this.b);
  }

  override replaceHandle(oldHandle: Handle, newHandle: Handle): void {
    if (this.p === oldHandle) {
      this.p = newHandle;
    }
    if (this.a === oldHandle) {
      this.a = newHandle;
    }
    if (this.b === oldHandle) {
      this.b = newHandle;
    }
  }
}

export class PointOnArcConstraint extends Constraint {
  private readonly _p: Var<Handle>;
  private get p() {
    return this._p.value;
  }
  private set p(newP: Handle) {
    this._p.value = newP;
  }

  private readonly _a: Var<Handle>;
  private get a() {
    return this._a.value;
  }
  private set a(newA: Handle) {
    this._a.value = newA;
  }

  private readonly _b: Var<Handle>;
  private get b() {
    return this._b.value;
  }
  private set b(newB: Handle) {
    this._b.value = newB;
  }

  private readonly _c: Var<Handle>;
  private get c() {
    return this._c.value;
  }
  private set c(newC: Handle) {
    this._c.value = newC;
  }

  constructor(p: Handle, a: Handle, b: Handle, c: Handle) {
    super();
    this._p = new Var(p);
    this._a = new Var(a);
    this._b = new Var(b);
    this._c = new Var(c);
  }

  override get signature() {
    return `POA(${this.p.id},${this.a.id},${this.b.id},${this.c.id})`;
  }

  override computeError() {
    return pointDist(this.p, this.c) - pointDist(this.a, this.c);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new PointOnArcConstraint(
      handleMap.get(this.p)!,
      handleMap.get(this.a)!,
      handleMap.get(this.b)!,
      handleMap.get(this.c)!,
    );
  }

  override forEachThing(fn: (t: Thing) => void): void {
    // no op
  }

  override forEachHandle(fn: (t: Handle) => void): void {
    fn(this.p);
    fn(this.a);
    fn(this.b);
    fn(this.c);
  }

  override replaceHandle(oldHandle: Handle, newHandle: Handle): void {
    if (this.p === oldHandle) {
      this.p = newHandle;
    }
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
}

export class PointInstanceConstraint extends Constraint {
  private readonly _instancePoint: Var<Handle>;
  get instancePoint() {
    return this._instancePoint.value;
  }
  private set instancePoint(newInstancePoint: Handle) {
    this._instancePoint.value = newInstancePoint;
  }

  private readonly _masterPoint: Var<Handle>;
  get masterPoint() {
    return this._masterPoint.value;
  }
  private set masterPoint(newMasterPoint: Handle) {
    this._masterPoint.value = newMasterPoint;
  }

  constructor(
    instancePoint: Handle,
    readonly instance: Instance,
    masterPoint: Handle,
  ) {
    super();
    this._instancePoint = new Var(instancePoint);
    this._masterPoint = new Var(masterPoint);
  }

  override get signature() {
    return `PI(${this.instance.id},${this.masterPoint.id})`;
  }

  override computeError() {
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

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new PointInstanceConstraint(
      handleMap.get(this.instancePoint)!,
      thingMap.get(this.instance) as Instance,
      this.masterPoint,
    );
  }

  override forEachThing(fn: (t: Thing) => void): void {
    fn(this.instance);
  }

  override forEachHandle(fn: (t: Handle) => void): void {
    fn(this.instancePoint);
    fn(this.masterPoint);
  }

  override replaceHandle(oldHandle: Handle, newHandle: Handle): void {
    if (this.instancePoint === oldHandle) {
      this.instancePoint = newHandle;
    }
    if (this.masterPoint === oldHandle) {
      this.masterPoint = newHandle;
    }
  }
}

export class SizeConstraint extends Constraint {
  constructor(
    readonly instance: Instance,
    readonly scale = 1,
  ) {
    super();
  }

  override get signature() {
    return `S(${this.instance.id})`;
  }

  override computeError() {
    return this.instance.size - this.scale * this.instance.master.size;
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new SizeConstraint(thingMap.get(this.instance) as Instance, this.scale);
  }

  override forEachThing(fn: (t: Thing) => void): void {
    fn(this.instance);
  }

  override forEachHandle(fn: (t: Handle) => void): void {
    // no op
  }

  override replaceHandle(oldHandle: Handle, newHandle: Handle): void {
    // no op
  }
}

export class WeightConstraint extends Constraint {
  private readonly _a: Var<Handle>;
  private get a() {
    return this._a.value;
  }
  private set a(newA: Handle) {
    this._a.value = newA;
  }

  constructor(a: Handle) {
    super();
    this._a = new Var(a);
  }

  override get signature() {
    return `W(${this.a.id})`;
  }

  private y0: number;

  override preRelax() {
    this.y0 = this.a.y;
  }

  override computeError() {
    const wantY = this.y0 - config().weight;
    return wantY - this.a.y;
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new WeightConstraint(handleMap.get(this.a)!);
  }

  override forEachThing(fn: (t: Thing) => void): void {
    // no op
  }

  override forEachHandle(fn: (t: Handle) => void): void {
    fn(this.a);
  }

  override replaceHandle(oldHandle: Handle, newHandle: Handle): void {
    if (this.a === oldHandle) {
      this.a = newHandle;
    }
  }
}
