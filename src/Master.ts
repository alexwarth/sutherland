import {
  EqualDistanceConstraint,
  FixedDistanceConstraint,
  HorizontalOrVerticalConstraint,
  PointOnArcConstraint,
  PointOnLineConstraint,
} from './constraints';
import ConstraintSet from './ConstraintSet';
import { pointDist, Position } from './helpers';
import { Arc, Handle, Line, Thing, Var } from './things';
import Transform from './Transform';

export class Master {
  readonly things: Thing[] = [];
  readonly constraints = new ConstraintSet();
  readonly transform = new Transform();

  // UI state
  selection = new Set<Thing>();

  relax() {
    this.constraints.relax(this.getVars());
  }

  render(transform = this.transform) {
    this.things.forEach((t) => {
      t.render(this.selection, transform);
    });
  }

  addLine(aPos: Position, bPos: Position) {
    const line = new Line(aPos, bPos);
    this.mergeAndAddImplicitConstraints(line.a);
    this.mergeAndAddImplicitConstraints(line.b);
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
        if (h !== line.a.primary && h !== line.b.primary && line.contains(h, this.transform)) {
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
        if (
          h !== arc.a.primary &&
          h !== arc.b.primary &&
          h !== arc.c.primary &&
          arc.contains(h, this.transform)
        ) {
          this.constraints.add(new PointOnArcConstraint(h.primary, arc.a, arc.b, arc.c));
        }
      });
    }
    this.things.push(arc);
  }

  mergeAndAddImplicitConstraints(h: Handle) {
    const thingsToIgnore = new Set<Thing>();
    for (const thing of this.things) {
      thing.forEachHandle((handle) => {
        if (handle.contains(h, this.transform)) {
          h.mergeWith(handle);
          thingsToIgnore.add(thing);
        }
      });
    }

    for (const thing of this.things) {
      if (thingsToIgnore.has(thing) || !thing.contains(h, this.transform)) {
        // skip
      } else if (thing instanceof Line) {
        this.constraints.add(new PointOnLineConstraint(h, thing.a, thing.b));
      } else if (thing instanceof Arc) {
        this.constraints.add(new PointOnArcConstraint(h, thing.a, thing.b, thing.c));
      }
    }
  }

  delete() {
    for (const thing of this.selection) {
      // TODO: remove handles, constraints, etc.
      // thing.remove();
      this.things.splice(this.things.indexOf(thing), 1);
    }
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

  snap(pos: Position, dragHandle: Handle | null) {
    const handle = this.handleAt(pos, dragHandle);
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
      if (this.selection.has(thing) || !thing.contains(pos, this.transform)) {
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

  handleAt(pos: Position, dragHandle: Handle | null): Handle | null {
    let minDist = Infinity;
    let nearestHandle: Handle | null = null;
    for (const thing of this.things) {
      thing.forEachHandle((handle) => {
        if (handle !== dragHandle && handle.contains(pos, this.transform)) {
          const dist = pointDist(pos, handle);
          if (dist < minDist) {
            nearestHandle = handle;
            minDist = dist;
          }
        }
      });
    }
    return nearestHandle;
  }

  thingAt(pos: Position): Thing | null {
    for (const thing of this.things) {
      if (thing.contains(pos, this.transform)) {
        return thing;
      }
    }
    return null;
  }

  toggleSelections(pointerPos: Position) {
    for (const thing of this.things) {
      if (thing.contains(pointerPos, this.transform)) {
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
    const movedHandles = new Set<Handle>();
    for (const thing of this.selection) {
      thing.forEachHandle((h) => {
        if (!movedHandles.has(h)) {
          h.x += dx;
          h.y += dy;
          movedHandles.add(h);
        }
      });
    }
  }

  private getVars() {
    const vars = new Set<Var>();
    for (const thing of this.things) {
      thing.forEachVar((v) => vars.add(v));
    }
    return vars;
  }
}
