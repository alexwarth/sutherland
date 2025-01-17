import config from './config';
import scope from './scope';
import * as canvas from './canvas';
import { lettersDo } from './font';
import {
  EqualDistanceConstraint,
  FixedDistanceConstraint,
  FixedPointConstraint,
  HorizontalOrVerticalConstraint,
  PointInstanceConstraint,
  PointOnArcConstraint,
  PointOnLineConstraint,
  SizeConstraint,
  WeightConstraint,
} from './constraints';
import ConstraintSet from './ConstraintSet';
import { Position, boundingBox, pointDist, rotateAround, scaleAround } from './helpers';
import { Arc, Handle, Instance, Line, Thing, Var } from './things';

export class Drawing {
  things: Thing[] = [];
  attachers: Handle[] = [];
  readonly constraints = new ConstraintSet();

  clear() {
    this.things = [];
    this.attachers = [];
    this.constraints.clear();
  }

  isEmpty() {
    return this.things.length === 0;
  }

  relax() {
    return this.constraints.relax(this.getVars());
  }

  render(transform = scope.toScreenPosition, depth = 0) {
    if (depth > config().maxDepth) {
      return;
    }

    this.things.forEach((t) => {
      if (t instanceof Instance) {
        t.render(transform, depth + 1);
      } else {
        t.render(transform);
      }
    });
    if (depth === 0) {
      this.attachers.forEach((h) => h.render(transform, config().masterSideAttacherColor));
      this.constraints.forEach((c) => {
        if (c instanceof FixedDistanceConstraint) {
          let e = (c.computeError() * 100).toFixed();
          if (e === '-0') {
            e = '0';
          }
          this.drawText(
            e,
            config().distanceConstraintTextScale,
            transform({
              x: c.a.x + config().distanceConstraintLabelPct * (c.b.x - c.a.x),
              y: c.a.y + config().distanceConstraintLabelPct * (c.b.y - c.a.y),
            }),
          );
        }
      });
    }
  }

  contains(drawing: Drawing) {
    if (this === drawing) {
      return true;
    }
    for (const thing of this.things) {
      if (thing instanceof Instance && thing.master.contains(drawing)) {
        return true;
      }
    }
    return false;
  }

  addInstance(master: Drawing, { x, y }: Position, size: number, angle: number) {
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

  addLine(aPos: Position, bPos: Position, isGuide = false, snap = true) {
    const line = new Line(aPos, bPos, isGuide);
    if (!isGuide && snap) {
      this.mergeAndAddImplicitConstraints(line.a);
      this.mergeAndAddImplicitConstraints(line.b);
    }
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
        if (h !== line.a && h !== line.b && line.contains(h)) {
          this.constraints.add(new PointOnLineConstraint(h, line.a, line.b));
        }
      });
    }
    this.things.push(line);
    return line;
  }

  addArc(aPos: Position, bPos: Position, cPos: Position, snap = true) {
    const arc = new Arc(aPos, bPos, cPos);
    if (snap) {
      this.mergeAndAddImplicitConstraints(arc.c);
      this.mergeAndAddImplicitConstraints(arc.a);
      this.mergeAndAddImplicitConstraints(arc.b);
    }
    this.constraints.add(new EqualDistanceConstraint(arc.a, arc.c, arc.b, arc.c));
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
        if (h !== arc.a && h !== arc.b && h !== arc.c && arc.contains(h)) {
          this.constraints.add(new PointOnArcConstraint(h, arc.a, arc.b, arc.c));
        }
      });
    }
    this.things.push(arc);
    return arc;
  }

  mergeAndAddImplicitConstraints(handle: Handle) {
    const thingsToIgnore = new Set<Thing>();
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
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
        this.constraints.add(new PointOnLineConstraint(handle, thing.a, thing.b));
        if (config().showImplicitConstraints) {
          canvas.setStatus('(point on line)');
        }
      } else if (thing instanceof Arc) {
        this.constraints.add(new PointOnArcConstraint(handle, thing.a, thing.b, thing.c));
        if (config().showImplicitConstraints) {
          canvas.setStatus('(point on arc)');
        }
      }
    }
  }

  replaceHandle(oldHandle: Handle, newHandle: Handle) {
    this.things.forEach((thing) => thing.replaceHandle(oldHandle, newHandle));
    this.attachers = this.attachers.map((a) => (a === oldHandle ? newHandle : a));
    this.constraints.replaceHandle(oldHandle, newHandle);
  }

  delete(pointerPos: Position) {
    const deletedThing = this.thingAt(pointerPos);
    if (deletedThing) {
      this.things = this.things.filter((thing) => thing !== deletedThing);
      return true;
    } else {
      return false;
    }
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
    const thing = this.thingAt(pointerPos);
    if (thing instanceof Line) {
      this.constraints.add(new FixedDistanceConstraint(thing.a, thing.b));
      return true;
    } else {
      return false;
    }
  }

  horizontalOrVertical(pointerPos: Position) {
    const thing = this.thingAt(pointerPos);
    if (thing instanceof Line) {
      this.constraints.add(new HorizontalOrVerticalConstraint(thing.a, thing.b));
      return true;
    } else {
      return false;
    }
  }

  fullSize(pointerPos: Position) {
    const thing = this.thingAt(pointerPos);
    if (thing instanceof Instance) {
      this.constraints.add(new SizeConstraint(thing));
      return true;
    } else {
      return false;
    }
  }

  dismember(pointerPos: Position) {
    const thing = this.thingAt(pointerPos);
    if (thing instanceof Instance) {
      this.inline(thing);
      return true;
    } else {
      return false;
    }
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
          thing.isGuide,
        );
        handleMap.set(thing.a, line.a);
        handleMap.set(thing.b, line.b);
      } else if (thing instanceof Arc) {
        const arc = this.addArc(
          instance.transform(thing.a),
          instance.transform(thing.b),
          instance.transform(thing.c),
        );
        handleMap.set(thing.a, arc.a);
        handleMap.set(thing.b, arc.b);
        handleMap.set(thing.c, arc.c);
      } else if (thing instanceof Instance) {
        const newInstance = this.addInstance(
          thing.master,
          instance.transform(thing), // move the center to the right place
          instance.scale * thing.size,
          instance.angle + thing.angle,
        )!;
        thingMap.set(thing, newInstance);
      } else {
        throw new Error('unsupported thing type: ' + thing.constructor.name);
      }
    }

    constraints.forEach((c) => {
      this.constraints.add(c.map(thingMap, handleMap));
    });

    this.things = this.things.filter((thing) => thing !== instance);
  }

  snap(pos: Position, dragThing?: Thing) {
    const handle = this.handleAt(pos, dragThing);
    if (handle) {
      pos.x = handle.x;
      pos.y = handle.y;
      return 'H';
    }

    const constraints = new ConstraintSet();
    const snappedPos = new Handle(pos);
    const vars = new Set<Var>();
    snappedPos.forEachVar((v) => vars.add(v));

    const signature: string[] = [];
    for (const thing of this.things) {
      if (thing === dragThing || !thing.contains(pos)) {
        // ignore
      } else if (thing instanceof Line) {
        constraints.add(new PointOnLineConstraint(snappedPos, thing.a, thing.b));
        signature.push('L');
      } else if (thing instanceof Arc) {
        constraints.add(new PointOnArcConstraint(snappedPos, thing.a, thing.b, thing.c));
        signature.push('A');
      }
    }

    if (constraints.isEmpty()) {
      return null;
    }

    while (constraints.relax(vars)) {
      // keep going
    }
    pos.x = snappedPos.x;
    pos.y = snappedPos.y;
    return signature.join();
  }

  handleAt(pos: Position, dragThing: Thing | null = null): Handle | null {
    let minDist = Infinity;
    let nearestHandle: Handle | null = null;
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
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

  leave() {
    this.center();
    // TODO: move instances to correct for the master's re-centering?
    // if so, this should happen every time a master changes, really
    // (think about recursive instances, etc.)
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

  boundingBox(stopAt: Drawing = this): { topLeft: Position; bottomRight: Position } {
    // TODO: include arcs...
    const ps = [...this.getPositions()];
    for (const thing of this.things) {
      if (thing instanceof Instance && thing.master !== stopAt) {
        const bb = thing.boundingBox(stopAt);
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

  private getHandles(things: Iterable<Thing>) {
    const handles = new Set<Handle>();
    for (const thing of things) {
      thing.forEachHandle((h) => handles.add(h));
    }
    return handles;
  }

  getHandle(handleIdx: number) {
    let handle: Handle;
    let idx = 0;
    for (const thing of this.things) {
      thing.forEachHandle((h) => {
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
      thing.forEachVar((v) => vars.add(v));
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
    this.constraints.forEach((constraint) => {
      if (constraint instanceof PointInstanceConstraint && constraint.masterPoint === a) {
        const { instance, instancePoint } = constraint;
        instance.attachers = instance.attachers.filter((h) => h !== instancePoint);
        this.constraints.remove(constraint);
      }
    });
  }

  write(msg: string, scale = 1) {
    let lastInstance: Instance | null = null;
    lettersDo(msg, scale, (letter, x, ls) => {
      const instance = this.addInstance(letter, { x, y: scope.center.y }, letter.size * ls, 0)!;
      this.constraints.add(new SizeConstraint(instance, ls));
      if (lastInstance) {
        this.replaceHandle(instance.attachers[0], lastInstance.attachers[1]);
      }
      lastInstance = instance;
    });
  }

  drawText(text: string, scale: number, pos: Position) {
    lettersDo(text, scale, (letter, x0, ls) =>
      letter.render(
        ({ x, y }) => ({
          x: x * ls + x0 - scope.center.x + pos.x,
          y: -y * ls + pos.y,
        }),
        1,
      ),
    );
  }
}
