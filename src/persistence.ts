import { AutomergeUrl, isValidAutomergeUrl, Repo } from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import { drawing, drawings, switchToDrawing } from './app';
import { Drawing, SerializedDrawing } from './Drawing';

interface SketchpadDoc {
  versions: SerializedState[]; // in backwards order, i.e., latest is first
}

interface SerializedState {
  currentDrawingId: string;
  drawings: SerializedDrawing[];
}

const repo = new Repo({
  storage: new IndexedDBStorageAdapter('automerge-demo'),
  network: [new BrowserWebSocketClientAdapter('wss://sync.automerge.org')],
});

export async function init() {
  const docUrl = getDocUrl();
  if (docUrl) {
    console.log('loading existing doc');
    const handle = repo.find<SketchpadDoc>(docUrl);
    const doc = (await handle.doc())!;
    loadState(doc.versions[0]);
  }
}

export function saveState() {
  const state = getSerializedState();
  const docUrl = getDocUrl();
  if (docUrl) {
    const handle = repo.find<SketchpadDoc>(docUrl);
    handle.change((doc) => doc.versions.unshift(state));
  } else {
    const handle = repo.create<SketchpadDoc>({ versions: [state] });
    document.location.hash = handle.url;
  }
}

function loadState(state: SerializedState) {
  console.log('load state', state);
  for (const sd of state.drawings) {
    const d = Drawing.deserialize(sd);
    drawings[d.id] = d;
  }
  switchToDrawing(state.currentDrawingId);
}

function getSerializedState(): SerializedState {
  const serializedDrawings: SerializedDrawing[] = [];
  const currentDrawing = drawing();
  let currentDrawingId = '1';
  for (const d of Object.values(drawings)) {
    serializedDrawings.push(d.serialize());
    if (d === currentDrawing) {
      currentDrawingId = d.id;
    }
  }
  return { currentDrawingId, drawings: serializedDrawings };
}

function getDocUrl(): AutomergeUrl | null {
  const docUrl = document.location.hash.substring(1);
  return isValidAutomergeUrl(docUrl) ? docUrl : null;
}
