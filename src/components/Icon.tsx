const P: Record<string, string> = {
  select: 'M5 3l14 8-6 1.5L10 19z',
  node: 'M4 18C8 6 16 6 20 18 M4 18h.01 M20 18h.01 M12 9h.01',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11 M11 10V4.5a1.5 1.5 0 0 1 3 0V11 M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 14a1.5 1.5 0 0 1 2.5-1.7L8 15',
  rect: 'M4 5h16v14H4z',
  ellipse: 'M12 5a8 7 0 1 0 0 14a8 7 0 1 0 0-14z',
  line: 'M5 19L19 5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  polygon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z',
  pen: 'M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z M2 2l7.6 7.6 M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  text: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15.5 9.5h.01',
  group: 'M4 4h7v7H4z M13 13h7v7h-7z M13 4h7v7h-7z M4 13h7v7H4z',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 5h3.5v14H7z M13.5 5H17v14h-3.5z',
  first: 'M6 5v14 M18 5L9 12l9 7z',
  last: 'M18 5v14 M6 5l9 7-9 7z',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  caret: 'M9 6l6 6-6 6',
  diamond: 'M12 4l8 8-8 8-8-8z',
  close: 'M6 6l12 12 M18 6L6 18',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18 M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9 M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 7.8-1.2',
  zoom: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-5-5',
  undo: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3',
  file: 'M14 3H6v18h12V7z M14 3v4h4',
  open: 'M3 7V5h7l2 2h9v12H3z M3 10h18',
  save: 'M5 3h11l3 3v15H5z M8 3v5h8V3 M8 21v-7h8v7',
  import: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
  export: 'M12 15V3 M7 8l5-5 5 5 M4 17v4h16v-4',
  preview: 'M5 4l14 8-14 8z',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  up: 'M12 19V5 M5 12l7-7 7 7',
  down: 'M12 5v14 M19 12l-7 7-7-7',
  top: 'M5 4h14 M12 20V8 M6 14l6-6 6 6',
  bottom: 'M5 20h14 M12 4v12 M6 10l6 6 6-6',
  alignLeft: 'M4 3v18 M8 7h10v4H8z M8 13h6v4H8z',
  alignCenterH: 'M12 3v18 M6 7h12v4H6z M8 13h8v4H8z',
  alignRight: 'M20 3v18 M6 7h10v4H6z M10 13h6v4h-6z',
  alignTop: 'M3 4h18 M7 8v10h4V8z M13 8v6h4V8z',
  alignMiddle: 'M3 12h18 M7 6v12h4V6z M13 8v8h4V8z',
  alignBottom: 'M3 20h18 M7 6v10h4V6z M13 10v6h4v-6z',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  github: 'M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  morph: 'M4 5h6v6H4z M17 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M10 8h4a3 3 0 0 1 3 3v3',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  groupAdd: 'M3 7V4h3 M18 4h3v3 M21 17v3h-3 M6 20H3v-3 M8 8h5v5H8z M11 11h5v5h-5z',
  ungroup: 'M4 4h6v6H4z M14 14h6v6h-6z M14 4l6 6 M20 4l-6 6',
  merge: 'M8 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M16 10a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  distH: 'M4 4v16 M20 4v16 M10 8h4v8h-4z',
  distV: 'M4 4h16 M4 20h16 M8 10h8v4H8z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17.5l9 5 9-5',
  shapes: 'M7 3l4 7H3z M17 14a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 14h7v7H4z M14 4h7v7h-7z',
  plus: 'M12 5v14 M5 12h14',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 15v5h16v-5',
  enter: 'M10 17l5-5-5-5 M15 12H3 M14 4h6v16h-6',
  folder: 'M3 6h6l2 2h10v11H3z',
  more: 'M6 12h.01 M12 12h.01 M18 12h.01',
  wand: 'M15 4V2 M15 16v-2 M8 9h2 M20 9h2 M17.8 11.8L19 13 M15 9h.01 M17.8 6.2L19 5 M3 21l9-9 M12.2 6.2L11 5',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14 M12 17h.01',
};

const FILLED = new Set(['play', 'pause', 'diamond', 'first', 'last', 'preview']);

export function Icon({ name, size = 16 }: { name: keyof typeof P | string; size?: number }) {
  const d = P[name] ?? P.help;
  const filled = FILLED.has(name);
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 1 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
