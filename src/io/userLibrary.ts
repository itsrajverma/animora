/**
 * The user's own Library items, kept in IndexedDB (uploads can be several MB):
 *  - uploads: SVG / image files
 *  - saved:   layers saved with "Save to library"
 */
import type { SvgEl } from '../model/types';
import { uid } from '../model/factory';

export interface LibItem {
  id: string;
  kind: 'upload' | 'saved';
  name: string;
  /** 'svg' → SVG text, 'image' → data URL, 'elements' → JSON array of layers. */
  format: 'svg' | 'image' | 'elements';
  data: string;
  /** Image URL used for the tile. */
  thumb: string;
  defs?: string;
  created: number;
}

const DB = 'animora';
const STORE = 'library';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const listeners = new Set<() => void>();
export const onLibraryChange = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const changed = () => listeners.forEach((f) => f());

export async function listItems(kind: LibItem['kind']): Promise<LibItem[]> {
  try {
    const all = await tx<LibItem[]>('readonly', (s) => s.getAll());
    return all.filter((i) => i.kind === kind).sort((a, b) => b.created - a.created);
  } catch {
    return [];
  }
}

export async function putItem(item: Omit<LibItem, 'id' | 'created'>) {
  await tx('readwrite', (s) => s.put({ ...item, id: uid(), created: Date.now() }));
  changed();
}

export async function deleteItem(id: string) {
  await tx('readwrite', (s) => s.delete(id));
  changed();
}

export const svgThumb = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

export function savedElementsItem(name: string, els: SvgEl[], markup: string, box: { x: number; y: number; w: number; h: number }, defs: string): Omit<LibItem, 'id' | 'created'> {
  const pad = 4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}">${defs ? `<defs>${defs}</defs>` : ''}${markup}</svg>`;
  return { kind: 'saved', name, format: 'elements', data: JSON.stringify(els), thumb: svgThumb(svg), defs };
}
