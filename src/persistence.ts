import scope from './scope';
import * as app from './app';
import * as status from './status';
import { Constraint, deserializeConstraint, SerializedConstraint } from './constraints';
import { Deserializer, deserializeThing, Handle, SerializedThing, Serializer, Thing } from './things';
import { List } from './state';
import { Position } from './helpers';

// Saves / loads the state of all of the drawings (plus the current drawing and pan/zoom)
// to / from a single slot in local storage. The undo history (worlds) is not saved.

const storageKey = 'sketchpad-state';

interface SerializedState {
  version: 1;
  handles: Position[];
  drawings: { [id: string]: SerializedDrawing };
  currentDrawingId: string;
  scope: { scale: number; center: Position };
}

interface SerializedDrawing {
  things: SerializedThing[];
  attachers: number[];
  constraints: SerializedConstraint[];
}

export function save() {
  // the handle table is shared by all drawings b/c point-instance constraints
  // refer to (master-side attacher) handles that live in other drawings
  const handles: Handle[] = [];
  const handleIdxs = new Map<Handle, number>();
  const handleIdx = (h: Handle) => {
    let idx = handleIdxs.get(h);
    if (idx === undefined) {
      idx = handles.length;
      handles.push(h);
      handleIdxs.set(h, idx);
    }
    return idx;
  };

  const drawings: { [id: string]: SerializedDrawing } = {};
  for (const [id, drawing] of Object.entries(app.drawings)) {
    const things = drawing.things.toArray();
    const s: Serializer = {
      handleIdx,
      thingIdx(t) {
        const idx = things.indexOf(t);
        if (idx < 0) {
          throw new Error('reference to a thing that is not in the drawing');
        }
        return idx;
      },
      drawingId(d) {
        const id = app.drawingId(d);
        if (id == null) {
          throw new Error('reference to an unknown drawing');
        }
        return id;
      },
    };

    const constraints: SerializedConstraint[] = [];
    drawing.constraints.forEach((c) => {
      try {
        constraints.push(c.serialize(s));
      } catch (e) {
        // this shouldn't happen, but if it does, it's better to lose a stale constraint
        // than to be unable to save
        console.warn(`not saving ${c.signature} constraint in drawing #${id}`, e);
      }
    });

    drawings[id] = {
      things: things.map((t) => t.serialize(s)),
      attachers: drawing.attachers.toArray().map(handleIdx),
      constraints,
    };
  }

  const state: SerializedState = {
    version: 1,
    handles: handles.map(({ x, y }) => ({ x, y })),
    drawings,
    currentDrawingId: app.drawingId(app.drawing()) ?? '1',
    scope: { scale: scope.scale, center: { ...scope.center } },
  };

  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    status.set('saved');
  } catch (e) {
    console.error('save failed', e);
    status.set('save failed');
  }
}

// Loading writes to the existing drawings' vars, so (like any other change) it can be undone.
export function load() {
  let state: SerializedState;
  let loaded: { [id: string]: { things: Thing[]; attachers: Handle[]; constraints: Constraint[] } };
  try {
    const json = localStorage.getItem(storageKey);
    if (!json) {
      status.set('nothing to load');
      return;
    }
    state = JSON.parse(json);
    if (state.version !== 1) {
      throw new Error(`unsupported version ${state.version}`);
    }

    // deserialize everything before touching the drawings, so that a failure
    // doesn't leave us w/ a half-loaded state
    const handles = state.handles.map((p) => new Handle(p));
    const handle = (idx: number) => {
      const h = handles[idx];
      if (!h) {
        throw new Error(`bad handle index ${idx}`);
      }
      return h;
    };
    loaded = {};
    for (const [id, sd] of Object.entries(state.drawings)) {
      const things: Thing[] = [];
      const d: Deserializer = {
        handle,
        thing(idx) {
          const t = things[idx];
          if (!t) {
            throw new Error(`bad thing index ${idx}`);
          }
          return t;
        },
        drawing(id) {
          const drawing = app.drawing(id);
          if (!drawing) {
            throw new Error(`unknown drawing ${id}`);
          }
          return drawing;
        },
      };
      for (const t of sd.things) {
        things.push(deserializeThing(t, d));
      }
      loaded[id] = {
        things,
        attachers: sd.attachers.map(handle),
        constraints: sd.constraints.map((c) => deserializeConstraint(c, d)),
      };
    }
  } catch (e) {
    console.error('load failed', e);
    status.set('load failed');
    return;
  }

  for (const [id, drawing] of Object.entries(app.drawings)) {
    const ld = loaded[id];
    if (!ld) {
      drawing.clear();
      continue;
    }
    drawing.things = new List(...ld.things);
    drawing.attachers = new List(...ld.attachers);
    drawing.constraints.constraints = new List(...ld.constraints);
  }

  app.showLoadedState(state.currentDrawingId, state.scope.scale, state.scope.center);
  status.set('loaded');
}
