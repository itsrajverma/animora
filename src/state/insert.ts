/** Adding artwork to the project: SVG text, images and saved layers. */
import type { SvgEl } from '../model/types';
import { cloneElement, createElement } from '../model/factory';
import { importSvgText, imageSize, wrapImport } from '../io/importSvg';
import { addElement, addElements, expand } from './actions';
import { getState, setState } from './store';

/** Import SVG text as one layer (group). `place` centers it on the artboard and scales it to fit. */
export function insertSvg(text: string, name: string, place: 'center' | 'original' = 'center') {
  const res = importSvgText(text);
  if (!res.elements.length) throw new Error('No drawable elements found in this SVG.');
  const { doc } = getState();
  const els = wrapImport(res.elements, name);
  if (place === 'center' && els.length === 1) {
    const el = els[0];
    const k = Math.min(1, (Math.min(doc.width, doc.height) * 0.5) / Math.max(1, res.width, res.height));
    el.props = { ...el.props, x: doc.width / 2, y: doc.height / 2, scaleX: Math.round(k * 1000) / 1000, scaleY: Math.round(k * 1000) / 1000 };
  }
  setState({ scope: null });
  addElements(els, res.defs);
  expand(els.filter((e) => e.type === 'group').map((e) => e.id));
  return { els, res };
}

export async function insertImage(url: string, name: string) {
  const { w, h } = await imageSize(url);
  const { doc } = getState();
  const k = Math.min(1, (doc.width * 0.8) / w, (doc.height * 0.8) / h);
  setState({ scope: null });
  addElement(createElement('image', { name, href: url }, { x: doc.width / 2, y: doc.height / 2, width: Math.round(w * k), height: Math.round(h * k) }));
}

/** Paste saved layers (from the user library) with fresh ids. */
export function insertSaved(els: SvgEl[], defs = '') {
  const copies = els.map((e) => cloneElement(e));
  setState({ scope: null });
  addElements(copies, defs && !getState().doc.defs.includes(defs) ? defs : '');
}
