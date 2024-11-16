import { generateId } from './helpers';

interface CanonicalVarState {
  isCanonical: true;
  value: number;
  mergedVars: Set<Var>;
}

interface MergedVarState {
  isCanonical: false;
  canonicalVar: Var;
}

export default class Var {
  readonly id = generateId();
  private state: CanonicalVarState | MergedVarState;

  constructor(value: number) {
    this.state = { isCanonical: true, value, mergedVars: new Set() };
  }

  mergeWith(that: Var) {
    if (!that.state.isCanonical) {
      this.mergeWith(that.state.canonicalVar);
      return;
    } else if (!this.state.isCanonical) {
      this.state.canonicalVar.mergeWith(that);
      return;
    } else if (this === that) {
      return;
    }

    for (const v of this.state.mergedVars) {
      v.breakOff().mergeWith(that);
    }

    that.state.mergedVars.add(this);
    this.state = { isCanonical: false, canonicalVar: that };
  }

  get value() {
    return this.state.isCanonical ? this.state.value : this.state.canonicalVar.value;
  }

  set value(newValue: number) {
    if (this.state.isCanonical) {
      this.state.value = newValue;
    } else {
      this.state.canonicalVar.value = newValue;
    }
  }

  get isCanonical() {
    return this.state.isCanonical;
  }

  get canonical(): Var {
    return this.state.isCanonical ? this : this.state.canonicalVar;
  }

  breakOff() {
    if (!this.state.isCanonical) {
      (this.state.canonicalVar.state as CanonicalVarState).mergedVars.delete(this);
      this.state = { isCanonical: true, value: this.value, mergedVars: new Set() };
    }
    return this;
  }

  remove() {
    if (!this.state.isCanonical) {
      this.breakOff();
      return;
    }

    const mergedVars = [...this.state.mergedVars];
    if (mergedVars.length === 0) {
      return;
    }

    const newCanonicalVar = mergedVars.shift()!;
    newCanonicalVar.breakOff();
    for (const v of mergedVars) {
      v.breakOff();
      v.mergeWith(newCanonicalVar);
    }
  }
}
