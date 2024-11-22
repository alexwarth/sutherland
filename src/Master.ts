import {
  EqualDistanceConstraint,
  FixedDistanceConstraint,
  HorizontalOrVerticalConstraint,
  PointOnArcConstraint,
  PointOnLineConstraint,
} from './constraints';
import ConstraintSet from './ConstraintSet';
import { pointDist, Position } from './helpers';
import { Arc, Handle, Instance, Line, Thing, Var } from './things';

export class Master {
  readonly things: Thing[] = [];
  readonly constraints = new ConstraintSet();
  readonly selection = new Set<Thing>();

  relax() {
    this.constraints.relax(this.getVars());
  }

  render(transform: (pos: Position) => Position) {
    this.things.forEach((t) => {
      t.render(this.selection, transform);
      t.forEachHandle((h) => h.render(this.selection, transform));
    });
  }

  addInstance(master: Master) {
    if (master !== this) {
      this.things.push(new Instance(master));
    }
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

  delete(pointerPos: Position) {
    const thingAtPointer = this.thingAt(pointerPos);
    const thingsToDelete: Set<Thing> =
      this.selection.size > 0
        ? this.selection
        : thingAtPointer
          ? new Set([thingAtPointer])
          : new Set();
    const handleMap = new Map<Handle, Handle | null>();
    for (const thing of thingsToDelete) {
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
  }

  fixedDistance() {
    for (const thing of this.selection) {
      if (thing instanceof Line) {
        this.constraints.add(new FixedDistanceConstraint(thing.a, thing.b));
      }
    }
    this.selection.clear();
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

  horizontalOrVertical() {
    for (const thing of this.selection) {
      if (thing instanceof Line) {
        this.constraints.add(new HorizontalOrVerticalConstraint(thing.a, thing.b));
      }
    }
    this.selection.clear();
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
    for (const h of this.getHandles(this.things)) {
      h.x += dx;
      h.y += dy;
    }
  }

  boundingBox(): { topLeft: Position; bottomRight: Position } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const handles = this.getHandles(this.things);
    for (const h of handles) {
      minX = Math.min(minX, h.x);
      maxX = Math.max(maxX, h.x);
      minY = Math.min(minY, h.y);
      maxY = Math.max(maxY, h.y);
    }
    return {
      topLeft: { x: minX, y: minY },
      bottomRight: { x: maxX, y: maxY },
    };
  }

  private getHandles(things: Iterable<Thing>) {
    const handles = new Set<Handle>();
    for (const thing of things) {
      thing.forEachHandle((h) => handles.add(h.primary));
    }
    return handles;
  }

  private getVars() {
    const vars = new Set<Var>();
    for (const thing of this.things) {
      thing.forEachVar((v) => vars.add(v));
    }
    return vars;
  }
}
