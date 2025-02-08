class World {
  private readonly values = new WeakMap<Var<any>, any>();
  // private readonly cache = new WeakMap<Var<any>, any>();

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

  do<T>(fn: () => T): T {
    const origWorld = thisWorld;
    thisWorld = origWorld;
    try {
      return fn();
    } finally {
      thisWorld = origWorld;
    }
  }
}

let thisWorld = new World();

export class Var<T> {
  constructor(public value: T) {}
}

// export class Var<T> {
//   constructor(value: T) {
//     this.value = value;
//   }

//   get value(): T {
//     return thisWorld.get(this);
//   }

//   set value(newValue: T) {
//     thisWorld.set(this, newValue);
//   }
// }

// export class List<T> {
//   private readonly firstNodeVar: Var<ListNode<T> | null> = new Var(null);

//   addFirst(value: T) {
//     this.firstNodeVar.value = new ListNode(value, this.firstNodeVar);
//   }

//   removeFirst(): T {
//     const n = this.firstNodeVar.value;
//     if (!n) {
//       throw new Error('called removeFirst() on empty list');
//     }
//     const value = n.value;
//     this.firstNodeVar.value = n.next.value;
//     return value;
//   }

//   removeAll(pred: (value: T) => boolean) {
//     let lastVar: Var<ListNode<T> | null> | null = null;
//     let curr = this.firstNodeVar;
//     this.firstNodeVar.value = null;
//     while (curr.value != null) {
//       const next = curr.value.next;
//       curr.value.next.value = null;
//       if (pred(curr.value.value)) {
//         if (lastVar) {
//           lastVar.value!.next.value = curr.value;
//         } else {
//           this.firstNodeVar.value = curr;
//         }
//         lastVar = curr;
//       }
//       curr = next;
//     }
//   }

//   isEmpty() {
//     return this.firstNodeVar.value == null;
//   }
// }

// class ListNode<T> {
//   constructor(
//     readonly value: T,
//     public next: Var<ListNode<T> | null>,
//   ) {}
// }
