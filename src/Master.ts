import { config } from './config';
import {
  EqualDistanceConstraint,
  FixedDistanceConstraint,
  FullSizeConstraint,
  HorizontalOrVerticalConstraint,
  PointInstanceConstraint,
  PointOnArcConstraint,
  PointOnLineConstraint,
} from './constraints';
import ConstraintSet from './ConstraintSet';
import { boundingBox, pointDist, Position, rotateAround, scaleAround } from './helpers';
import { Arc, Handle, Instance, Line, Thing, Var } from './things';

export class Master {
  readonly things: Thing[] = [];
  readonly attachers: Handle[] = [];
  readonly constraints = new ConstraintSet();
  readonly selection = new Set<Thing>();

  isEmpty() {
    return this.things.length === 0;
  }

  relax() {
    this.constraints.relax(this.getVars());
  }

  render(transform: (pos: Position) => Position, depth = 0) {
    this.things.forEach((t) => {
      if (t instanceof Instance) {
        t.render(this.selection, transform, depth + 1);
      } else {
        t.render(this.selection, transform);
      }
      t.forEachHandle((h) => h.render(this.selection, transform));
    });
    if (depth === 0) {
      this.attachers.forEach((h) => h.render(this.selection, transform, true));
    }
  }

  addInstance(master: Master, { x, y }: Position, size: number) {
    if (master === this) {
      // TODO: detect cycles, too!
      return;
    }

    this.things.push(new Instance(master, x, y, size, this));
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
    this.fixInstances(thing);
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
    this.fixInstances(thing);
    return true;
  }

  addLine(aPos: Position, bPos: Position) {
    const line = new Line(aPos, bPos);
    this.mergeAndAddImplicitConstraints(line.a);
    this.mergeAndAddImplicitConstraints(line.b);
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
        h = h.primary;
        if (h !== line.a.primary && h !== line.b.primary && line.contains(h)) {
          this.constraints.add(new PointOnLineConstraint(h, line.a, line.b));
        }
      });
    }
    this.things.push(line);
  }

  addArc(aPos: Position, bPos: Position, cPos: Position) {
    const arc = new Arc(aPos, bPos, cPos);
    this.mergeAndAddImplicitConstraints(arc.c);
    this.mergeAndAddImplicitConstraints(arc.a);
    this.mergeAndAddImplicitConstraints(arc.b);
    this.constraints.add(new EqualDistanceConstraint(arc.a, arc.c, arc.b, arc.c));
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
        h = h.primary;
        if (h !== arc.a.primary && h !== arc.b.primary && h !== arc.c.primary && arc.contains(h)) {
          this.constraints.add(new PointOnArcConstraint(h.primary, arc.a, arc.b, arc.c));
        }
      });
    }
    this.things.push(arc);
  }

  mergeAndAddImplicitConstraints(handle: Handle) {
    const thingsToIgnore = new Set<Thing>();
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
        h = h.primary;
        if (h.contains(handle)) {
          handle.mergeWith(h);
          thingsToIgnore.add(thing);
        }
      });
    }

    for (const thing of this.things) {
      if (thingsToIgnore.has(thing) || !thing.contains(handle)) {
        // skip
      } else if (thing instanceof Line) {
        this.constraints.add(new PointOnLineConstraint(handle, thing.a, thing.b));
      } else if (thing instanceof Arc) {
        this.constraints.add(new PointOnArcConstraint(handle, thing.a, thing.b, thing.c));
      }
    }
  }

  toggleAttacher(pointerPos: Position) {
    const h = this.handleAt(pointerPos);
    if (!h) {
      return false;
    }

    let removed = false;
    let idx = 0;
    while (idx < this.attachers.length) {
      const a = this.attachers[idx];
      if (a.primary === h) {
        this.attachers.splice(idx, 1);
        removed = true;
      } else {
        idx++;
      }
    }

    if (!removed) {
      this.attachers.push(h);
    }
    return true;
  }

  delete(pointerPos: Position) {
    const things = this.thingsForOperation(pointerPos);
    if (things.size === 0) {
      return false;
    }
    const handleMap = new Map<Handle, Handle | null>();
    for (const thing of things) {
      thing.forEachHandle((h) => {
        if (!handleMap.has(h)) {
          const replacementHandle = h.breakOff();
          handleMap.set(h, replacementHandle);
        }
      });
      this.things.splice(this.things.indexOf(thing), 1);
    }
    this.constraints.replaceHandles(handleMap);
    this.selection.clear();
    return true;
  }

  fixedDistance(pointerPos: Position) {
    const things = this.thingsForOperation(pointerPos);
    if (things.size === 0) {
      return false;
    }
    for (const thing of things) {
      if (thing instanceof Line) {
        this.constraints.add(new FixedDistanceConstraint(thing.a, thing.b));
      }
    }
    this.selection.clear();
    return true;
  }

  equalDistance() {
    let prevLine: Line | null = null;
    for (const thing of this.selection) {
      if (!(thing instanceof Line)) {
        continue;
      }

      if (prevLine) {
        this.constraints.add(new EqualDistanceConstraint(prevLine.a, prevLine.b, thing.a, thing.b));
      }
      prevLine = thing;
    }
    this.selection.clear();
  }

  horizontalOrVertical(pointerPos: Position) {
    const things = this.thingsForOperation(pointerPos);
    if (things.size === 0) {
      return false;
    }
    for (const thing of things) {
      if (thing instanceof Line) {
        this.constraints.add(new HorizontalOrVerticalConstraint(thing.a, thing.b));
      }
    }
    this.selection.clear();
    return true;
  }

  fullSize(pointerPos: Position) {
    const things = this.thingsForOperation(pointerPos);
    for (const thing of things) {
      if (thing instanceof Instance) {
        this.constraints.add(new FullSizeConstraint(thing));
        return true;
      }
    }
    return false;
  }

  fixInstances(dragThing: Thing & Position) {
    if (!config.autoFixInstances) {
      return;
    }

    // TODO: this is a good place to use clusters (see Inkling solver) for efficiency!

    const constraints = new ConstraintSet();
    this.constraints.forEach((c) => {
      if (c instanceof PointInstanceConstraint) {
        constraints.add(c);
      }
    });

    const vars = new Set<Var>();
    for (const thing of this.things) {
      if (thing === dragThing && dragThing instanceof Instance) {
        // don't tweak its variables!
      } else {
        thing.forEachVar((v) => vars.add(v));
      }
    }

    while (constraints.relax(vars)) {
      // keep going
    }
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
    snappedPos.forEachVar((v) => vars.add(v));

    for (const thing of this.things) {
      if (this.selection.has(thing) || !thing.contains(pos)) {
        // ignore
      } else if (thing instanceof Line) {
        constraints.add(new PointOnLineConstraint(snappedPos, thing.a, thing.b));
      } else if (thing instanceof Arc) {
        constraints.add(new PointOnArcConstraint(snappedPos, thing.a, thing.b, thing.c));
      }
    }

    while (constraints.relax(vars)) {
      // keep going
    }
    pos.x = snappedPos.x;
    pos.y = snappedPos.y;
  }

  handleAt(pos: Position, dragThing: (Thing & Position) | null = null): Handle | null {
    let minDist = Infinity;
    let nearestHandle: Handle | null = null;
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
        h = h.primary;
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
    for (const thing of this.things) {
      if (thing.contains(pos)) {
        return thing;
      }
    }
    return null;
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
    return boundingBox(this.getPositions());
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
      thing.forEachHandle((h) => handles.add(h.primary));
    }
    return handles;
  }

  getHandle(handleIdx: number) {
    let handle: Handle;
    let idx = 0;
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
        if (h === h.primary && idx++ === handleIdx) {
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
      thing.forEachVar((v) => vars.add(v));
    }
    return vars;
  }
}
