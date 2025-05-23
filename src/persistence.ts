import { isValidAutomergeUrl, Repo } from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';

interface SerializedState {
  drawings: { [id: number]: SerializedDrawing };
}

// TODO: flesh out this type
interface SerializedDrawing {
  id: number;
}

const repo = new Repo({
  storage: new IndexedDBStorageAdapter('automerge-demo'),
  network: [new BrowserWebSocketClientAdapter('wss://sync.automerge.org')],
});

export async function init() {
  const docUrl = document.location.hash.substring(1);
  if (isValidAutomergeUrl(docUrl)) {
    console.log('loading existing doc');
    const handle = repo.find(docUrl);
    loadState((await handle.doc()) as SerializedState);
  }
}

export function saveState() {
  const state = getSerializedState();
  const handle = repo.create<SerializedState>(state);
  document.location.hash = handle.url;
}

function loadState(state: SerializedState) {
  console.log('TODO: load state', state);
}

function getSerializedState(): SerializedState {
  // TODO: write this for real
  return {
    drawings: {},
  };
}
