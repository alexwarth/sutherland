import config from './config';
import { ctx, drawArc, drawLine, drawPoint, drawRing } from './canvas';
import { Deserializer, Handle, Instance, Serializer, Thing } from './things';
import {
  Position,
  origin,
  pointDist,
  pointDistToArc,
  pointDistToLineSegment,
  rotateAround,
  scaleAround,
  translate,
} from './helpers';
import { Var } from './state';

type Transform = (pos: Position) => Position;

// ---------- serialization ----------
// (handles are referred to by their index in a global handle table,
// and things are referred to by their index in their drawing's list of things)

interface SerializedFixedPointConstraint {
  type: 'fixed point';
  p: number;
  pos: Position;
}

interface SerializedHorizontalOrVerticalConstraint {
  type: 'horv';
  a: number;
  b: number;
}

interface SerializedFixedDistanceConstraint {
  type: 'fixed distance';
  a: number;
  b: number;
  distance: number;
}

interface SerializedEqualDistanceConstraint {
  type: 'equal distance';
  a1: number;
  b1: number;
  a2: number;
  b2: number;
}

interface SerializedPointOnLineConstraint {
  type: 'point on line';
  p: number;
  a: number;
  b: number;
}

interface SerializedPointOnArcConstraint {
  type: 'point on arc';
  p: number;
  a: number;
  b: number;
  c: number;
}

interface SerializedPointInstanceConstraint {
  type: 'point instance';
  instancePoint: number;
  instance: number;
  masterPoint: number;
}

interface SerializedSizeConstraint {
  type: 'size';
  instance: number;
  scale: number;
}

interface SerializedWeightConstraint {
  type: 'weight';
  a: number;
}

export type SerializedConstraint =
  | SerializedFixedPointConstraint
  | SerializedHorizontalOrVerticalConstraint
  | SerializedFixedDistanceConstraint
  | SerializedEqualDistanceConstraint
  | SerializedPointOnLineConstraint
  | SerializedPointOnArcConstraint
  | SerializedPointInstanceConstraint
  | SerializedSizeConstraint
  | SerializedWeightConstraint;

export function deserializeConstraint(c: SerializedConstraint, d: Deserializer): Constraint {
  switch (c.type) {
    case 'fixed point':
      return FixedPointConstraint.deserialize(c, d);
    case 'horv':
      return HorizontalOrVerticalConstraint.deserialize(c, d);
    case 'fixed distance':
      return FixedDistanceConstraint.deserialize(c, d);
    case 'equal distance':
      return EqualDistanceConstraint.deserialize(c, d);
    case 'point on line':
      return PointOnLineConstraint.deserialize(c, d);
    case 'point on arc':
      return PointOnArcConstraint.deserialize(c, d);
    case 'point instance':
      return PointInstanceConstraint.deserialize(c, d);
    case 'size':
      return SizeConstraint.deserialize(c, d);
    case 'weight':
      return WeightConstraint.deserialize(c, d);
    default:
      throw new Error(`don't know how to deserialize a ${(c as any).type} constraint!`);
  }
}

export abstract class Constraint {
  abstract get signature(): string;
  abstract get displayName(): string;
  abstract computeError(): number;
  abstract map(
    thingMap: Map<Thing, Thing>,
    handleMap: Map<Handle, Handle>,
    transform: (pos: Position) => Position,
  ): Constraint;
  abstract forEachVar(fn: (v: Var<any>) => void): void;
  abstract forEachThing(fn: (t: Thing) => void): void;
  abstract forEachHandle(fn: (t: Handle) => void): void;
  abstract replaceHandle(oldHandle: Handle, newHandle: Handle): void;
  abstract serialize(s: Serializer): SerializedConstraint;

  // override in subclasses like weight constraint
  preRelax(): void { }

  // highlights the parts of the drawing that are involved in this constraint
  // (subclasses add lines, arcs, etc. as appropriate)
  renderHighlight(transform: Transform, color: string) {
    this.forEachThing((t) => t.render(transform, color, 2));
    this.forEachHandle((h) => {
      drawPoint(h, color, transform);
      drawRing(h, color, transform);
    });
  }

  // TODO: consider returning false in certain constraint type-specific conditions
  // e.g., point-on-line(p, a, b) where p == a or p == b
  isStillValid(things: Set<Thing>, handles: Set<Handle>) {
    let valid = true;
    this.forEachThing((t) => {
      if (!things.has(t)) {
        valid = false;
      }
    });
    this.forEachHandle((h) => {
      if (!handles.has(h)) {
        valid = false;
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

  override serialize(s: Serializer): SerializedConstraint {
    return { type: 'fixed point', p: s.handleIdx(this.p), pos: { ...this.pos } };
  }

  static deserialize(c: SerializedFixedPointConstraint, d: Deserializer) {
    return new FixedPointConstraint(d.handle(c.p), c.pos);
  }

  override get signature() {
    return `FP(${this.p.id})`;
  }

  override get displayName() {
    return 'fixed point';
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

  override forEachVar(fn: (v: Var<any>) => void) {
    fn(this._p);
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

  override serialize(s: Serializer): SerializedConstraint {
    return { type: 'horv', a: s.handleIdx(this.a), b: s.handleIdx(this.b) };
  }

  static deserialize(c: SerializedHorizontalOrVerticalConstraint, d: Deserializer) {
    return new HorizontalOrVerticalConstraint(d.handle(c.a), d.handle(c.b));
  }

  override get signature() {
    const id1 = Math.min(this.a.id, this.b.id);
    const id2 = Math.max(this.a.id, this.b.id);
    return `HorV(${id1},${id2})`;
  }

  override get displayName() {
    return 'horizontal or vertical';
  }

  override renderHighlight(transform: Transform, color: string) {
    drawLine(this.a, this.b, color, transform);
    super.renderHighlight(transform, color);
  }

  override computeError() {
    return Math.min(Math.abs(this.a.x - this.b.x), Math.abs(this.a.y - this.b.y));
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new HorizontalOrVerticalConstraint(handleMap.get(this.a)!, handleMap.get(this.b)!);
  }

  override forEachVar(fn: (v: Var<any>) => void) {
    fn(this._a);
    fn(this._b);
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

  constructor(a: Handle, b: Handle, distance = pointDist(a, b)) {
    super();
    this._a = new Var(a);
    this._b = new Var(b);
    this.distance = distance;
  }

  override serialize(s: Serializer): SerializedConstraint {
    return {
      type: 'fixed distance',
      a: s.handleIdx(this.a),
      b: s.handleIdx(this.b),
      distance: this.distance,
    };
  }

  static deserialize(c: SerializedFixedDistanceConstraint, d: Deserializer) {
    return new FixedDistanceConstraint(d.handle(c.a), d.handle(c.b), c.distance);
  }

  override get signature() {
    const id1 = Math.min(this.a.id, this.b.id);
    const id2 = Math.max(this.a.id, this.b.id);
    return `D(${id1},${id2})`;
  }

  override get displayName() {
    return 'fixed distance';
  }

  override renderHighlight(transform: Transform, color: string) {
    drawLine(this.a, this.b, color, transform);
    super.renderHighlight(transform, color);
  }

  override computeError() {
    return this.distance - pointDist(this.a, this.b);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new FixedDistanceConstraint(handleMap.get(this.a)!, handleMap.get(this.b)!);
  }

  override forEachVar(fn: (v: Var<any>) => void) {
    fn(this._a);
    fn(this._b);
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

  override serialize(s: Serializer): SerializedConstraint {
    return {
      type: 'equal distance',
      a1: s.handleIdx(this.a1),
      b1: s.handleIdx(this.b1),
      a2: s.handleIdx(this.a2),
      b2: s.handleIdx(this.b2),
    };
  }

  static deserialize(c: SerializedEqualDistanceConstraint, d: Deserializer) {
    return new EqualDistanceConstraint(
      d.handle(c.a1),
      d.handle(c.b1),
      d.handle(c.a2),
      d.handle(c.b2),
    );
  }

  override get signature() {
    return `E(${this.a1.id},${this.b1.id},${this.a2.id},${this.b2.id})`;
  }

  override get displayName() {
    return 'equal length';
  }

  override renderHighlight(transform: Transform, color: string) {
    drawLine(this.a1, this.b1, color, transform);
    drawLine(this.a2, this.b2, color, transform);
    super.renderHighlight(transform, color);
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

  override forEachVar(fn: (v: Var<any>) => void) {
    fn(this._a1);
    fn(this._b1);
    fn(this._a2);
    fn(this._b2);
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

  override serialize(s: Serializer): SerializedConstraint {
    return {
      type: 'point on line',
      p: s.handleIdx(this.p),
      a: s.handleIdx(this.a),
      b: s.handleIdx(this.b),
    };
  }

  static deserialize(c: SerializedPointOnLineConstraint, d: Deserializer) {
    return new PointOnLineConstraint(d.handle(c.p), d.handle(c.a), d.handle(c.b));
  }

  override get signature() {
    return `POL(${this.p.id},${this.a.id},${this.b.id})`;
  }

  override get displayName() {
    return 'point on line';
  }

  override renderHighlight(transform: Transform, color: string) {
    drawLine(this.a, this.b, color, transform);
    super.renderHighlight(transform, color);
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

  override forEachVar(fn: (v: Var<any>) => void) {
    fn(this._p);
    fn(this._a);
    fn(this._b);
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

  override serialize(s: Serializer): SerializedConstraint {
    return {
      type: 'point on arc',
      p: s.handleIdx(this.p),
      a: s.handleIdx(this.a),
      b: s.handleIdx(this.b),
      c: s.handleIdx(this.c),
    };
  }

  static deserialize(c: SerializedPointOnArcConstraint, d: Deserializer) {
    return new PointOnArcConstraint(d.handle(c.p), d.handle(c.a), d.handle(c.b), d.handle(c.c));
  }

  override get signature() {
    return `POA(${this.p.id},${this.a.id},${this.b.id},${this.c.id})`;
  }

  override get displayName() {
    return 'point on arc';
  }

  override renderHighlight(transform: Transform, color: string) {
    drawArc(this.c, this.a, this.b, color, transform);
    super.renderHighlight(transform, color);
  }

  override computeError() {
    return pointDistToArc(this.p, this.c, this.a, this.b);
  }

  override map(thingMap: Map<Thing, Thing>, handleMap: Map<Handle, Handle>) {
    return new PointOnArcConstraint(
      handleMap.get(this.p)!,
      handleMap.get(this.a)!,
      handleMap.get(this.b)!,
      handleMap.get(this.c)!,
    );
  }

  override forEachVar(fn: (v: Var<any>) => void) {
    fn(this._p);
    fn(this._a);
    fn(this._b);
    fn(this._c);
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

  override serialize(s: Serializer): SerializedConstraint {
    return {
      type: 'point instance',
      instancePoint: s.handleIdx(this.instancePoint),
      instance: s.thingIdx(this.instance),
      masterPoint: s.handleIdx(this.masterPoint),
    };
  }

  static deserialize(c: SerializedPointInstanceConstraint, d: Deserializer) {
    return new PointInstanceConstraint(
      d.handle(c.instancePoint),
      d.thing(c.instance) as Instance,
      d.handle(c.masterPoint),
    );
  }

  override get signature() {
    return `PI(${this.instance.id},${this.masterPoint.id})`;
  }

  override get displayName() {
    return 'attacher';
  }

  override renderHighlight(transform: Transform, color: string) {
    this.instance.render(transform, color, 2);
    // the instance-side attacher is already drawn as a (yellow) point,
    // so we draw a ring around it to make the highlight visible
    drawRing(this.instancePoint, color, transform);
    // the master-side attacher doesn't live in this drawing, so we show it
    // on a small rendering of the master at the top right of the screen
    renderMasterInset(this.instance.master, this.masterPoint, color);
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

  override forEachVar(fn: (v: Var<any>) => void) {
    fn(this._instancePoint);
    fn(this._masterPoint);
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

function renderMasterInset(master: Instance['master'], masterPoint: Handle, color: string) {
  const boxSize = 200;
  const margin = 35;

  const { topLeft, bottomRight } = master.boundingBox();
  const width = bottomRight.x - topLeft.x;
  const height = topLeft.y - bottomRight.y;
  const scale = boxSize / Math.max(width, height, 1);
  const center = { x: (topLeft.x + bottomRight.x) / 2, y: (topLeft.y + bottomRight.y) / 2 };
  const boxCenter = { x: innerWidth - margin - boxSize / 2, y: margin + boxSize / 2 };
  const transform = ({ x, y }: Position) => ({
    x: boxCenter.x + (x - center.x) * scale,
    y: boxCenter.y - (y - center.y) * scale,
  });

  const pad = 15;
  const oldLineWidth = ctx.lineWidth;
  ctx.lineWidth = 1;
  // paint the background black so the inset doesn't visually overlap w/ the drawing
  ctx.fillStyle = 'black';
  ctx.fillRect(
    boxCenter.x - boxSize / 2 - pad,
    boxCenter.y - boxSize / 2 - pad,
    boxSize + 2 * pad,
    boxSize + 2 * pad,
  );
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(
    boxCenter.x - boxSize / 2 - pad,
    boxCenter.y - boxSize / 2 - pad,
    boxSize + 2 * pad,
    boxSize + 2 * pad,
  );
  ctx.lineWidth = oldLineWidth;

  master.render(transform);
  drawPoint(masterPoint, color, transform);
  drawRing(masterPoint, color, transform);
}

export class SizeConstraint extends Constraint {
  constructor(
    readonly instance: Instance,
    readonly scale = 1,
  ) {
    super();
  }

  override serialize(s: Serializer): SerializedConstraint {
    return { type: 'size', instance: s.thingIdx(this.instance), scale: this.scale };
  }

  static deserialize(c: SerializedSizeConstraint, d: Deserializer) {
    return new SizeConstraint(d.thing(c.instance) as Instance, c.scale);
  }

  override get signature() {
    return `S(${this.instance.id})`;
  }

  override get displayName() {
    return this.scale === 1 ? 'full size' : `size x${this.scale}`;
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

  override forEachVar(fn: (v: Var<any>) => void) {
    // no op
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

  override serialize(s: Serializer): SerializedConstraint {
    return { type: 'weight', a: s.handleIdx(this.a) };
  }

  static deserialize(c: SerializedWeightConstraint, d: Deserializer) {
    return new WeightConstraint(d.handle(c.a));
  }

  override get signature() {
    return `W(${this.a.id})`;
  }

  override get displayName() {
    return 'weight';
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

  override forEachVar(fn: (v: Var<any>) => void) {
    fn(this._a);
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
