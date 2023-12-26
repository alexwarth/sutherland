import * as constraints from './constraints';
import { Constraint, Pin } from './constraints';
import { generateId } from './helpers';
import { Position } from './types';
import Vec from './lib/vec';

export const HANDLE_RADIUS = 5;

export default class Handle {
  static readonly all = new Set<Handle>();

  static create(position: Position, getAbsorbed = true): Handle {
    const handle = new Handle(position);
    if (getAbsorbed) {
      handle.getAbsorbedByNearestHandle();
    }
    return handle;
  }

  static getNearestHandle(pos: Handle | Position, tooFarDist = HANDLE_RADIUS + 1) {
    let nearestHandle: Handle | null = null;
    let nearestDist = Infinity;
    for (const handle of Handle.all) {
      if (handle === pos || !handle.isCanonical) {
        continue;
      }
      const dist = Vec.dist(pos, handle);
      if (dist < HANDLE_RADIUS && dist < nearestDist) {
        nearestDist = dist;
        nearestHandle = handle;
      }
    }
    return nearestHandle;
  }


  public readonly id = generateId();

  public readonly xVariable = constraints.variable(0, {
    object: this,
    property: 'x',
  });
  public readonly yVariable = constraints.variable(0, {
    object: this,
    property: 'y',
  });

  private constructor({ x, y }: Position) {
    this.xVariable.value = x;
    this.yVariable.value = y;
    Handle.all.add(this);
  }

  remove() {
    this.canonicalInstance.breakOff(this);
    this.xVariable.remove();
    this.yVariable.remove();
    Handle.all.delete(this);
  }

  equals(that: Handle) {
    return (
      this.xVariable.equals(that.xVariable) &&
      this.yVariable.equals(that.yVariable)
    );
  }

  get x() {
    return this.xVariable.value;
  }

  get y() {
    return this.yVariable.value;
  }

  get position(): Position {
    return this;
  }

  set position(pos: Position) {
    ({ x: this.xVariable.value, y: this.yVariable.value } = pos);
  }

  absorb(that: Handle) {
    constraints.absorb(this, that);
  }

  getAbsorbedByNearestHandle() {
    Handle.getNearestHandle(this)?.absorb(this);
  }

  private _canonicalHandle: Handle = this;
  readonly absorbedHandles = new Set<Handle>();

  get isCanonical() {
    return this._canonicalHandle === this;
  }

  get canonicalInstance() {
    return this._canonicalHandle;
  }

  private set canonicalInstance(handle: Handle) {
    this._canonicalHandle = handle;
  }

  /** This method should only be called by the constraint system. */
  _absorb(that: Handle) {
    if (that === this) {
      return;
    }

    that.canonicalInstance.absorbedHandles.delete(that);
    for (const handle of that.absorbedHandles) {
      this._absorb(handle);
    }
    that.canonicalInstance = this;
    this.absorbedHandles.add(that);
  }

  /** This method should only be called by the constraint system. */
  _forgetAbsorbedHandles() {
    this.canonicalInstance = this;
    this.absorbedHandles.clear();
  }

  breakOff(handle: Handle) {
    if (this.absorbedHandles.has(handle)) {
      constraints.absorb(this, handle).remove();
    } else if (handle === this) {
      if (this.absorbedHandles.size > 0) {
        const absorbedHandles = [...this.absorbedHandles];
        const newCanonicalHandle = absorbedHandles.shift()!;
        constraints.absorb(this, newCanonicalHandle).remove();
        for (const absorbedHandle of absorbedHandles) {
          constraints.absorb(newCanonicalHandle, absorbedHandle);
        }
      }
    } else {
      throw new Error('tried to break off a handle that was not absorbed');
    }
    return handle;
  }

  get hasPin() {
    for (const constraint of Constraint.all) {
      if (
        constraint instanceof Pin &&
        constraint.handle.canonicalInstance === this.canonicalInstance
      ) {
        return true;
      }
    }
    return false;
  }

  togglePin(doPin = !this.hasPin): void {
    if (!this.isCanonical) {
      return this.canonicalInstance.togglePin(doPin);
    }

    for (const h of [this, ...this.absorbedHandles]) {
      if (doPin) {
        constraints.pin(h);
      } else {
        constraints.pin(h).remove();
      }
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    // TODO: write this
  }
}
