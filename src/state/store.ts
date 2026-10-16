import { create } from 'zustand';
import type { Doc, KfRef, SvgEl, Tool } from '../model/types';
import { demoDoc, migrateDoc } from '../model/factory';

export const AUTOSAVE_KEY = 'animora.autosave.v1';
const THEME_KEY = 'animora.theme';
const WELCOME_KEY = 'animora.welcomed';

export type Theme = 'dark' | 'light';

export interface EditorState {
  doc: Doc;
  selection: string[];
  /** Group the user has "entered" (double-click); canvas clicks pick its children. */
  scope: string | null;
  tool: Tool;
  time: number;
  playing: boolean;
  /** When on, editing any property creates keyframes (SVGator's "animate mode"). */
  recordMode: boolean;
  selectedKfs: KfRef[];
  /** Open state of layer rows: shows a group's children and a layer's animated properties. */
  expanded: Record<string, boolean>;
  zoom: number;
  panX: number;
  panY: number;
  past: Doc[];
  future: Doc[];
  histKey: string | null;
  histAt: number;
  clipboard: SvgEl[];
  focusText: number;
  theme: Theme;
  inspectorTab: 'design' | 'animate';
  sidebarTab: 'layers' | 'shapes';
  menu: { x: number; y: number } | null;
  toast: { msg: string; id: number } | null;
  showWelcome: boolean;
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

function initialDoc(): Doc {
  try {
    const raw = read(AUTOSAVE_KEY);
    if (raw) return migrateDoc(JSON.parse(raw));
  } catch {
    /* ignore corrupt autosave */
  }
  return demoDoc();
}

export const useStore = create<EditorState>(() => ({
  doc: initialDoc(),
  selection: [],
  scope: null,
  tool: 'select',
  time: 0,
  playing: false,
  recordMode: true,
  selectedKfs: [],
  expanded: {},
  zoom: 1,
  panX: 0,
  panY: 0,
  past: [],
  future: [],
  histKey: null,
  histAt: 0,
  clipboard: [],
  focusText: 0,
  theme: read(THEME_KEY) === 'light' ? 'light' : 'dark',
  inspectorTab: 'design',
  sidebarTab: 'layers',
  menu: null,
  toast: null,
  showWelcome: !read(WELCOME_KEY),
}));

export const getState = () => useStore.getState();
export const setState = useStore.setState;

export function setTheme(theme: Theme) {
  setState({ theme });
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function dismissWelcome() {
  setState({ showWelcome: false });
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    /* ignore */
  }
}

let toastId = 0;
export function notify(msg: string) {
  const id = ++toastId;
  setState({ toast: { msg, id } });
  window.setTimeout(() => {
    if (getState().toast?.id === id) setState({ toast: null });
  }, 3500);
}
