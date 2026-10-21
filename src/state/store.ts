import { create } from 'zustand';
import type { Doc, Keyframe, KfRef, PropKey, SvgEl, Tool } from '../model/types';
import { demoDoc, migrateDoc } from '../model/factory';

export const AUTOSAVE_KEY = 'animora.autosave.v1';
const THEME_KEY = 'animora.theme';
const WELCOME_KEY = 'animora.welcomed';
const VIEW_KEY = 'animora.view.v1';

export type Theme = 'dark' | 'light';

/** Editor view preferences (persisted per browser, not part of the project). */
export interface ViewPrefs {
  snap: boolean;
  snapGuides: boolean;
  snapObjects: boolean;
  snapGrid: boolean;
  snapPixel: boolean;
  showGrid: boolean;
  gridSize: number;
  showRulers: boolean;
  showGuides: boolean;
  /** Timeline zoom, pixels per second. */
  pps: number;
}

const DEFAULT_VIEW: ViewPrefs = {
  snap: true,
  snapGuides: true,
  snapObjects: true,
  snapGrid: false,
  snapPixel: false,
  showGrid: false,
  gridSize: 20,
  showRulers: true,
  showGuides: true,
  pps: 125,
};

export interface KfClip {
  prop: PropKey;
  /** Times relative to the first copied keyframe. */
  keys: Omit<Keyframe, 'id'>[];
}

export interface EditorState {
  doc: Doc;
  selection: string[];
  /** Group the user has "entered" (double-click); canvas clicks pick its children. */
  scope: string | null;
  tool: Tool;
  time: number;
  playing: boolean;
  /** Preview loop in the editor. */
  loopPreview: boolean;
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
  kfClipboard: KfClip[];
  focusText: number;
  theme: Theme;
  leftTab: 'elements' | 'library' | 'templates';
  rightTab: 'properties' | 'comments';
  leftOpen: boolean;
  rightOpen: boolean;
  /** Element waiting for the user to click the path it should follow. */
  pickMotionFor: string | null;
  view: ViewPrefs;
  menu: { x: number; y: number; kind?: 'layer' | 'keyframe' } | null;
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

function initialView(): ViewPrefs {
  try {
    const raw = read(VIEW_KEY);
    if (raw) return { ...DEFAULT_VIEW, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_VIEW;
}

export const useStore = create<EditorState>(() => ({
  doc: initialDoc(),
  selection: [],
  scope: null,
  tool: 'select',
  time: 0,
  playing: false,
  loopPreview: true,
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
  kfClipboard: [],
  focusText: 0,
  theme: read(THEME_KEY) === 'light' ? 'light' : 'dark',
  leftTab: 'elements',
  rightTab: 'properties',
  leftOpen: true,
  rightOpen: true,
  pickMotionFor: null,
  view: initialView(),
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

export function setView(patch: Partial<ViewPrefs>) {
  const view = { ...getState().view, ...patch };
  setState({ view });
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
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
