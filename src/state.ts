class World {
  private readonly values = new Map<Var<any>, any>();

  constructor(readonly parent?: World) {}

  set<T>(v: Var<T>, newValue: T) {
    this.values.set(v, newValue);
  }

  get<T>(v: Var<T>): T {
    const value = this.values.get(v);
    return value !== undefined ? value : this.parent?.get(v);
  }

  sprout() {
    return new World(this);
  }
}

let thisWorld = new World();

export class Var<T> {
  constructor(value: T) {
    this.value = value;
  }

  get value(): T {
    return thisWorld.get(this);
  }

  set value(newValue: T) {
    thisWorld.set(this, newValue);
  }
}
