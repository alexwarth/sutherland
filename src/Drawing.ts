import { config } from './config';
import {
  EqualDistanceConstraint,
  FixedDistanceConstraint,
  SizeConstraint,
  HorizontalOrVerticalConstraint,
  PointInstanceConstraint,
  PointOnArcConstraint,
  PointOnLineConstraint,
  FixedPointConstraint,
  WeightConstraint,
} from './constraints';
import ConstraintSet from './ConstraintSet';
import {
  Position,
  boundingBox,
  pointDist,
  rotateAround,
  scaleAround,
} from './helpers';
import { Arc, Handle, Instance, Line, Thing, Var } from './things';
import * as canvas from './canvas';

export class Drawing {
  things: Thing[] = [];
  attachers: Handle[] = [];
  readonly constraints = new ConstraintSet();
  readonly selection = new Set<Thing>();

  clear() {
    this.things = [];
    this.attachers = [];
    this.constraints.clear();
    this.selection.clear();
  }

  isEmpty() {
    return this.things.length === 0;
  }

  relax() {
    return this.constraints.relax(this.getVars());
  }

  render(transform: (pos: Position) => Position, depth = 0) {
    this.things.forEach(t => {
      if (t instanceof Instance) {
        t.render(this.selection, transform, depth + 1);
      } else {
        t.render(this.selection, transform);
      }
    });
    if (depth === 0) {
      this.attachers.forEach(h =>
        h.render(this.selection, transform, config.masterSideAttacherColor)
      );
    }
  }

  addInstance(
    master: Drawing,
    { x, y }: Position,
    size: number,
    angle: number
  ) {
    if (master === this) {
      // TODO: detect cycles, too!
      return null;
    }

    const instance = new Instance(master, x, y, size, angle, this);
    this.things.push(instance);
    return instance;
  }

  resizeInstanceAt(pos: Position, scaleMultiplier: number) {
    const thing = this.thingAt(pos);
    if (!(thing instanceof Instance)) {
      return false;
    }

    thing.scale *= scaleMultiplier;
    for (const attacher of thing.attachers) {
      const { x, y } = scaleAround(attacher, thing, scaleMultiplier);
      attacher.x = x;
      attacher.y = y;
    }
    return true;
  }

  rotateInstanceAt(pos: Position, dAngle: number) {
    const thing = this.thingAt(pos);
    if (!(thing instanceof Instance)) {
      return false;
    }

    thing.angle += dAngle;
    for (const attacher of thing.attachers) {
      const { x, y } = rotateAround(attacher, thing, dAngle);
      attacher.x = x;
      attacher.y = y;
    }
    return true;
  }

  addLine(aPos: Position, bPos: Position, isGuide = false) {
    const line = new Line(aPos, bPos, isGuide);
    if (!isGuide) {
      this.mergeAndAddImplicitConstraints(line.a);
      this.mergeAndAddImplicitConstraints(line.b);
    }
    for (const thing of this.things) {
      thing.forEachHandle(h => {
        if (h !== line.a && h !== line.b && line.contains(h)) {
          this.constraints.add(new PointOnLineConstraint(h, line.a, line.b));
        }
      });
    }
    this.things.push(line);
    return line;
  }

  addArc(aPos: Position, bPos: Position, cPos: Position) {
    const arc = new Arc(aPos, bPos, cPos);
    this.mergeAndAddImplicitConstraints(arc.c);
    this.mergeAndAddImplicitConstraints(arc.a);
    this.mergeAndAddImplicitConstraints(arc.b);
    this.constraints.add(
      new EqualDistanceConstraint(arc.a, arc.c, arc.b, arc.c)
    );
    for (const thing of this.things) {
      thing.forEachHandle(h => {
        if (h !== arc.a && h !== arc.b && h !== arc.c && arc.contains(h)) {
          this.constraints.add(
            new PointOnArcConstraint(h, arc.a, arc.b, arc.c)
          );
        }
      });
    }
    this.things.push(arc);
    return arc;
  }

  mergeAndAddImplicitConstraints(handle: Handle) {
    const thingsToIgnore = new Set<Thing>();
    for (const thing of this.things) {
      thing.forEachHandle(h => {
        if (h !== handle && h.contains(handle)) {
          this.replaceHandle(h, handle);
          thingsToIgnore.add(thing);
        }
      });
    }

    for (const thing of this.things) {
      if (thingsToIgnore.has(thing) || !thing.contains(handle)) {
        // skip
      } else if (thing instanceof Line) {
        this.constraints.add(
          new PointOnLineConstraint(handle, thing.a, thing.b)
        );
        canvas.setStatus('(point on line)');
      } else if (thing instanceof Arc) {
        this.constraints.add(
          new PointOnArcConstraint(handle, thing.a, thing.b, thing.c)
        );
        canvas.setStatus('(point on arc)');
      }
    }
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    this.things.forEach(thing => thing.replaceHandle(oldHandle, newHandle));
    this.attachers = this.attachers.map(a => (a === oldHandle ? newHandle : a));
    this.constraints.replaceHandle(oldHandle, newHandle);
  }

  delete(pointerPos: Position) {
    const deletedThings = this.thingsForOperation(pointerPos);
    if (deletedThings.size === 0) {
      return false;
    }

    this.things = this.things.filter(thing => !deletedThings.has(thing));
    this.selection.clear();
    return true;
  }

  fixedPoint(pointerPos: Position) {
    const h = this.handleAt(pointerPos, null);
    if (h) {
      this.constraints.add(new FixedPointConstraint(h, pointerPos));
      return true;
    } else {
      return false;
    }
  }

  weight(pointerPos: Position) {
    const h = this.handleAt(pointerPos, null);
    if (h) {
      this.constraints.add(new WeightConstraint(h));
      return true;
    } else {
      return false;
    }
  }

  fixedDistance(pointerPos: Position) {
    const things = this.thingsForOperation(pointerPos);
    if (things.size === 0) {
      return false;
    }
    let ans = false;
    for (const thing of things) {
      if (thing instanceof Line) {
        this.constraints.add(new FixedDistanceConstraint(thing.a, thing.b));
        ans = true;
      }
    }
    this.selection.clear();
    return ans;
  }

  equalDistance() {
    let ans = false;
    let prevLine: Line | null = null;
    for (const thing of this.selection) {
      if (!(thing instanceof Line)) {
        continue;
      }

      if (prevLine) {
        this.constraints.add(
          new EqualDistanceConstraint(prevLine.a, prevLine.b, thing.a, thing.b)
        );
        ans = true;
      }
      prevLine = thing;
    }
    this.selection.clear();
    return ans;
  }

  horizontalOrVertical(pointerPos: Position) {
    const things = this.thingsForOperation(pointerPos);
    if (things.size === 0) {
      return false;
    }
    let ans = false;
    for (const thing of things) {
      if (thing instanceof Line) {
        this.constraints.add(
          new HorizontalOrVerticalConstraint(thing.a, thing.b)
        );
        ans = true;
      }
    }
    this.selection.clear();
    return ans;
  }

  fullSize(pointerPos: Position) {
    let ans = false;
    const things = this.thingsForOperation(pointerPos);
    for (const thing of things) {
      if (thing instanceof Instance) {
        this.constraints.add(new SizeConstraint(thing));
        ans = true;
      }
    }
    return ans;
  }

  dismember(pointerPos: Position) {
    let ans = false;
    const things = this.thingsForOperation(pointerPos);
    for (const thing of things) {
      if (thing instanceof Instance) {
        this.inline(thing);
        ans = true;
      }
    }
    return ans;
  }

  inline(instance: Instance) {
    const { things, constraints } = instance.master;
    const handleMap = new Map<Handle, Handle>();
    const thingMap = new Map<Thing, Thing>();
    for (const thing of things) {
      if (thing instanceof Line) {
        const line = this.addLine(
          instance.transform(thing.a),
          instance.transform(thing.b),
          thing.isGuide
        );
        handleMap.set(thing.a, line.a);
        handleMap.set(thing.b, line.b);
      } else if (thing instanceof Arc) {
        const arc = this.addArc(
          instance.transform(thing.a),
          instance.transform(thing.b),
          instance.transform(thing.c)
        );
        handleMap.set(thing.a, arc.a);
        handleMap.set(thing.b, arc.b);
        handleMap.set(thing.c, arc.c);
      } else if (thing instanceof Instance) {
        const newInstance = this.addInstance(
          thing.master,
          instance.transform(thing), // move the center to the right place
          instance.scale * thing.size,
          instance.angle + thing.angle
        )!;
        thingMap.set(thing, newInstance);
      } else {
        throw new Error('unsupported thing type: ' + thing.constructor.name);
      }
    }

    constraints.forEach(c => {
      this.constraints.add(c.map(thingMap, handleMap));
    });

    this.things = this.things.filter(thing => thing !== instance);
  }

  snap(pos: Position, dragThing: (Thing & Position) | null) {
    const handle = this.handleAt(pos, dragThing);
    if (handle) {
      pos.x = handle.x;
      pos.y = handle.y;
      return;
    }

    const constraints = new ConstraintSet();
    const snappedPos = new Handle(pos);
    const vars = new Set<Var>();
    snappedPos.forEachVar(v => vars.add(v));

    for (const thing of this.things) {
      if (this.selection.has(thing) || !thing.contains(pos)) {
        // ignore
      } else if (thing instanceof Line) {
        constraints.add(
          new PointOnLineConstraint(snappedPos, thing.a, thing.b)
        );
      } else if (thing instanceof Arc) {
        constraints.add(
          new PointOnArcConstraint(snappedPos, thing.a, thing.b, thing.c)
        );
      }
    }

    while (constraints.relax(vars)) {
      // keep going
    }
    pos.x = snappedPos.x;
    pos.y = snappedPos.y;
  }

  handleAt(
    pos: Position,
    dragThing: (Thing & Position) | null = null
  ): Handle | null {
    let minDist = Infinity;
    let nearestHandle: Handle | null = null;
    for (const thing of this.things) {
      thing.forEachHandle(h => {
        if (h !== dragThing && h.contains(pos)) {
          const dist = pointDist(pos, h);
          if (dist < minDist) {
            nearestHandle = h;
            minDist = dist;
          }
        }
      });
    }
    return nearestHandle;
  }

  thingAt(pos: Position): Thing | null {
    let minDist = Infinity;
    let ans: Thing | null = null;
    for (const thing of this.things) {
      if (thing.contains(pos)) {
        const dist = thing.distanceTo(pos);
        if (dist < minDist) {
          ans = thing;
          minDist = dist;
        }
      }
    }
    return ans;
  }

  toggleSelections(pointerPos: Position) {
    for (const thing of this.things) {
      if (thing.contains(pointerPos)) {
        this.toggleSelected(thing);
      }
    }
  }

  toggleSelected(thing: Thing) {
    if (this.selection.has(thing)) {
      this.selection.delete(thing);
    } else {
      this.selection.add(thing);
    }
  }

  clearSelection() {
    this.selection.clear();
  }

  moveSelection(dx: number, dy: number) {
    for (const h of this.getHandles(this.selection)) {
      h.x += dx;
      h.y += dy;
    }
  }

  leave() {
    this.center();
    this.selection.clear();
  }

  center() {
    const { topLeft, bottomRight } = this.boundingBox();
    const dx = -(topLeft.x + bottomRight.x) / 2;
    const dy = -(topLeft.y + bottomRight.y) / 2;
    for (const h of this.getPositions()) {
      h.x += dx;
      h.y += dy;
    }
  }

  boundingBox(): { topLeft: Position; bottomRight: Position } {
    // TODO: include arcs...
    const ps = [...this.getPositions()];
    for (const thing of this.things) {
      if (thing instanceof Instance) {
        const bb = thing.boundingBox();
        ps.push(bb.topLeft);
        ps.push(bb.bottomRight);
      }
    }
    return boundingBox(ps);
  }

  get size() {
    let size2 = 0;
    for (const { x, y } of this.getPositions()) {
      size2 = Math.max(size2, Math.pow(x, 2) + Math.pow(y, 2));
    }
    return Math.sqrt(size2) * 2;
  }

  private thingsForOperation(pointerPos: Position): Set<Thing> {
    const thingAtPointer = this.thingAt(pointerPos);
    return this.selection.size > 0
      ? this.selection
      : thingAtPointer
        ? new Set([thingAtPointer])
        : new Set();
  }

  private getHandles(things: Iterable<Thing>) {
    const handles = new Set<Handle>();
    for (const thing of things) {
      thing.forEachHandle(h => handles.add(h));
    }
    return handles;
  }

  getHandle(handleIdx: number) {
    let handle: Handle;
    let idx = 0;
    for (const thing of this.things) {
      thing.forEachHandle(h => {
        if (idx++ === handleIdx) {
          handle = h;
        }
      });
    }
    return handle!;
  }

  private getPositions() {
    const ps: Set<Position> = this.getHandles(this.things);
    for (const thing of this.things) {
      if (thing instanceof Instance) {
        ps.add(thing);
      }
    }
    return ps;
  }

  private getVars() {
    const vars = new Set<Var>();
    for (const thing of this.things) {
      thing.forEachVar(v => vars.add(v));
    }
    return vars;
  }

  onAttacherAdded(m: Drawing, a: Handle) {
    // add point-instance constraint and instance-side attacher to every instance of m
    for (const thing of this.things) {
      if (thing instanceof Instance && thing.master === m) {
        thing.addAttacher(a, this);
      }
    }
  }

  onAttacherRemoved(m: Drawing, a: Handle) {
    // remove point-instance constraint and instance-side attacher from every instance of m
    this.constraints.forEach(constraint => {
      if (
        constraint instanceof PointInstanceConstraint &&
        constraint.masterPoint === a
      ) {
        const { instance, instancePoint } = constraint;
        instance.attachers = instance.attachers.filter(
          h => h !== instancePoint
        );
        this.constraints.remove(constraint);
      }
    });
  }
}
