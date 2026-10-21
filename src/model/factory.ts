import type { Doc, ElementType, Keyframe, PropKey, SvgEl, Value } from './types';
import { ellipsePath, rectPath, starPath } from '../engine/path';

export const uid = () => Math.random().toString(36).slice(2, 10);

const TYPE_NAMES: Record<ElementType, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  path: 'Path',
  text: 'Text',
  image: 'Image',
  raw: 'Graphic',
  group: 'Group',
};

let counter = 1;
export const nextName = (base: string) => `${base} ${counter++}`;

export function createElement(type: ElementType, init: Partial<SvgEl> = {}, props: SvgEl['props'] = {}): SvgEl {
  return {
    id: uid(),
    type,
    name: init.name ?? nextName(TYPE_NAMES[type]),
    visible: true,
    locked: false,
    ax: 0,
    ay: 0,
    tracks: {},
    ...init,
    props: { ...props },
  };
}

export function newDoc(): Doc {
  return {
    version: 1,
    name: 'Untitled animation',
    width: 800,
    height: 500,
    background: '#ffffff',
    duration: 3,
    loop: true,
    iterations: 1,
    direction: 'normal',
    trigger: 'load',
    fillMode: 'freeze',
    speed: 100,
    elements: [],
    defs: '',
    guides: { x: [], y: [] },
    comments: [],
  };
}

/** Deep copy with fresh ids (for duplicate / paste). */
export function cloneElement(el: SvgEl): SvgEl {
  const c: SvgEl = JSON.parse(JSON.stringify(el));
  const reid = (e: SvgEl) => {
    e.id = uid();
    for (const tr of Object.values(e.tracks)) for (const k of tr!) k.id = uid();
    e.children?.forEach(reid);
  };
  reid(c);
  return c;
}

export function migrateDoc(raw: unknown): Doc {
  const d = raw as Partial<Doc>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.elements)) throw new Error('Not an Animora project file');
  const base = newDoc();
  return {
    ...base,
    ...d,
    version: 1,
    defs: d.defs ?? '',
    guides: { x: d.guides?.x ?? [], y: d.guides?.y ?? [] },
    comments: Array.isArray(d.comments) ? d.comments : [],
    elements: d.elements.map(migrateEl),
  };
}

function migrateEl(e: SvgEl): SvgEl {
  const out: SvgEl = { ...createElement(e.type), ...e, props: e.props ?? {}, tracks: e.tracks ?? {} };
  if (e.type === 'group') out.children = (e.children ?? []).map(migrateEl);
  return out;
}

// ---------------------------------------------------------------------------
// Demo project shown on first launch.

export type K = [number, Value, string?];
export const track = (keys: K[]): Keyframe[] => keys.map(([time, value, easing]) => ({ id: uid(), time, value, easing: easing ?? 'easeInOut' }));

export function withTracks(el: SvgEl, t: Partial<Record<PropKey, K[]>>): SvgEl {
  for (const [p, keys] of Object.entries(t)) el.tracks[p as PropKey] = track(keys!);
  return el;
}

export function demoDoc(): Doc {
  const doc = newDoc();
  doc.name = 'Welcome to Animora';
  doc.duration = 4;
  doc.background = '#f4f5fb';

  const wave = withTracks(
    createElement('path', { name: 'Wave line', lineCap: 'round', lineJoin: 'round' }, {
      x: 400, y: 440, d: 'M-340 0 C-280 -40 -220 -40 -170 0 C-120 40 -60 40 0 0 C60 -40 120 -40 170 0 C220 40 280 40 340 0',
      fill: 'none', stroke: '#ff5d73', strokeWidth: 8,
    }),
    { trim: [[0, 0, 'easeInOutCubic'], [1.6, 100, 'linear'], [3.4, 100, 'easeInOutCubic'], [4, 0]] },
  );

  const beats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  const shadow = createElement('ellipse', { name: 'Ball shadow' }, { x: 150, y: 392, width: 90, height: 14, fill: '#1b1d2a', opacity: 0.15 });
  shadow.tracks.scaleX = track(beats.map((t, i) => [t, i % 2 ? 1 : 0.45, i % 2 ? 'easeOutQuad' : 'easeInQuad'] as K));

  const ball = createElement('ellipse', { name: 'Bouncing ball' }, { x: 150, width: 80, height: 80, fill: '#5b6cff' });
  ball.tracks.y = track(beats.map((t, i) => [t, i % 2 ? 345 : 150, i % 2 ? 'easeOutQuad' : 'easeInQuad'] as K));

  const star = withTracks(
    createElement('path', { name: 'Spinning star', lineJoin: 'round' }, {
      x: 390, y: 240, d: starPath(170, 170, 5, 0.45), fill: '#ffc93c', stroke: '#f29f05', strokeWidth: 4,
    }),
    {
      rotation: [[0, 0, 'linear'], [4, 360]],
      scaleX: [[0, 1], [1, 1.2], [2, 1], [3, 1.2], [4, 1]],
      scaleY: [[0, 1], [1, 1.2], [2, 1], [3, 1.2], [4, 1]],
    },
  );

  const title = withTracks(
    createElement('text', { name: 'Title', text: 'Animora', fontWeight: '800', fontFamily: 'Inter, Arial, sans-serif' }, {
      x: 625, fontSize: 64, fill: '#1b1d2a',
    }),
    {
      opacity: [[0.3, 0, 'easeOutCubic'], [1.2, 1]],
      y: [[0.3, 210, 'easeOutBack'], [1.2, 170]],
    },
  );

  const subtitle = withTracks(
    createElement('text', { name: 'Subtitle', text: 'open-source SVG animator', fontWeight: '500' }, {
      x: 625, y: 222, fontSize: 22, fill: '#5d6178',
    }),
    { opacity: [[0.8, 0, 'easeOut'], [1.6, 1]] },
  );

  const morph = withTracks(
    createElement('path', { name: 'Morphing shape' }, { x: 625, y: 330, fill: '#2ec4b6' }),
    {
      d: [[0.4, rectPath(90, 90, 12)], [1.6, ellipsePath(100, 100)], [2.8, starPath(120, 120, 6, 0.6)], [4, rectPath(90, 90, 12)]],
      fill: [[0.4, '#2ec4b6'], [1.6, '#8b5cf6'], [2.8, '#ff8c42'], [4, '#2ec4b6']],
      rotation: [[0.4, 0], [4, 180]],
    },
  );

  doc.elements = [wave, shadow, ball, star, title, subtitle, morph];
  return doc;
}
