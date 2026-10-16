import type { SvgEl } from './types';

/** Where an element lives in the layer tree. */
export interface Loc<T extends SvgEl = SvgEl> {
  list: T[];
  index: number;
  parent: T | null;
  depth: number;
}

export function locate<T extends SvgEl>(root: T[], id: string): Loc<T> | null {
  const rec = (list: T[], parent: T | null, depth: number): Loc<T> | null => {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.id === id) return { list, index: i, parent, depth };
      if (e.children) {
        const r = rec(e.children as T[], e, depth + 1);
        if (r) return r;
      }
    }
    return null;
  };
  return rec(root, null, 0);
}

export function findById<T extends SvgEl>(root: T[], id: string): T | undefined {
  const l = locate(root, id);
  return l ? l.list[l.index] : undefined;
}

/** Depth-first walk; return false from `fn` to skip an element's children. */
export function walk<T extends SvgEl>(root: T[], fn: (el: T, parent: T | null, depth: number) => void | false) {
  const rec = (list: T[], parent: T | null, depth: number) => {
    for (const e of list) {
      if (fn(e, parent, depth) === false) continue;
      if (e.children) rec(e.children as T[], e, depth + 1);
    }
  };
  rec(root, null, 0);
}

export function flatten<T extends SvgEl>(root: T[]): T[] {
  const out: T[] = [];
  walk(root, (e) => {
    out.push(e);
  });
  return out;
}

/** Ancestors of `id`, outermost first (not including the element itself). */
export function ancestors<T extends SvgEl>(root: T[], id: string): T[] {
  const path: T[] = [];
  const rec = (list: T[]): boolean => {
    for (const e of list) {
      if (e.id === id) return true;
      if (e.children) {
        path.push(e);
        if (rec(e.children as T[])) return true;
        path.pop();
      }
    }
    return false;
  };
  return rec(root) ? path : [];
}

export function containsId(el: SvgEl, id: string): boolean {
  if (el.id === id) return true;
  return !!el.children?.some((c) => containsId(c, id));
}

export const parentId = (root: SvgEl[], id: string) => locate(root, id)?.parent?.id ?? null;
