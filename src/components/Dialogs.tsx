import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { exportSvg } from '../engine/render';
import { download, exportWebm, safeName, svgDataUrl } from '../io/files';
import { TOOLS } from './ToolDock';
import { dismissWelcome } from '../state/store';
import { loadDoc, newProject } from '../state/actions';
import { demoDoc } from '../model/factory';
import { Icon } from './Icon';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function PreviewDialog({ onClose, onVideo }: { onClose: () => void; onVideo: () => void }) {
  const doc = useStore((s) => s.doc);
  const svg = useMemo(() => exportSvg(doc, { animated: true }), [doc]);
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const kb = (new Blob([svg]).size / 1024).toFixed(1);
  const embed = `<img src="${safeName(doc)}.svg" width="${doc.width}" height="${doc.height}" alt="${doc.name.replace(/"/g, '')}">`;
  return (
    <Modal title="Preview & export" onClose={onClose} wide>
      <div className="preview-layout">
        <div className="preview-stage">
          <img key={nonce} src={svgDataUrl(svg)} alt="Animation preview" style={{ aspectRatio: `${doc.width} / ${doc.height}` }} />
        </div>
        <div className="preview-side">
          <p>
            This is the exported file running on its own — a single <b>animated SVG</b> using native SMIL animation. No JavaScript,
            works in all modern browsers, in <code>&lt;img&gt;</code> tags and as CSS backgrounds.
          </p>
          <div className="stat"><span>File size</span><b>{kb} KB</b></div>
          <div className="stat"><span>Size</span><b>{doc.width} × {doc.height}</b></div>
          <div className="stat"><span>Duration</span><b>{doc.duration}s {doc.loop ? '· loops' : '· plays once'}</b></div>
          <div className="btn-col">
            <button className="btn primary" onClick={() => download(svg, `${safeName(doc)}.svg`, 'image/svg+xml')}>Download animated SVG</button>
            <button className="btn" onClick={async () => {
              await navigator.clipboard.writeText(svg);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}>{copied ? 'Copied!' : 'Copy SVG code'}</button>
            <button className="btn" onClick={() => setNonce(nonce + 1)}>Replay</button>
            <button className="btn" onClick={() => { onClose(); onVideo(); }}>Export video (WebM)…</button>
          </div>
          <div className="field-label">Embed in a web page</div>
          <pre className="code-block">{embed}</pre>
        </div>
      </div>
    </Modal>
  );
}

export function VideoDialog({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const [fps, setFps] = useState(30);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    setProgress(0);
    try {
      await exportWebm(doc, setProgress, fps);
      setProgress(null);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  };
  return (
    <Modal title="Export video" onClose={() => progress === null && onClose()}>
      <p>Records the animation into a <b>WebM</b> video in your browser (takes about {doc.duration}s). Transparent backgrounds become white.</p>
      <label className="field-row">
        <span>Frame rate</span>
        <select value={fps} onChange={(e) => setFps(+e.target.value)} disabled={progress !== null}>
          <option value={24}>24 fps</option>
          <option value={30}>30 fps</option>
          <option value={60}>60 fps</option>
        </select>
      </label>
      {progress !== null && (
        <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="btn-row end">
        <button className="btn" onClick={onClose} disabled={progress !== null}>Cancel</button>
        <button className="btn primary" onClick={run} disabled={progress !== null}>{progress !== null ? `Recording… ${Math.round(progress * 100)}%` : 'Record & download'}</button>
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['Home / End', 'Jump to start / end'],
  [', / .', 'Previous / next frame'],
  ['Delete', 'Delete selected layers or keyframes'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['Ctrl+C / X / V', 'Copy / cut / paste'],
  ['Ctrl+D', 'Duplicate'],
  ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'],
  ['Ctrl+E', 'Merge into one shape'],
  ['Double-click group', 'Edit layers inside it'],
  ['Ctrl+click', 'Select a layer deep inside groups'],
  ['Right-click', 'Layer menu'],
  ['Ctrl+A', 'Select all'],
  ['Arrows (+Shift)', 'Nudge 1px (10px)'],
  ['Ctrl+wheel / Ctrl+0', 'Zoom / fit to screen'],
  ['Wheel, middle-drag, H', 'Pan the canvas'],
  ['Shift while dragging', 'Constrain (axis, ratio, 15°)'],
  ['Alt while resizing', 'Resize from center'],
  ['Double-click shape', 'Edit path nodes'],
  ['Ctrl+S / Ctrl+O', 'Save / open project'],
  ['Ctrl+Shift+E', 'Export animated SVG'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Shortcuts & tips" onClose={onClose}>
      <div className="help-grid">
        <div>
          <h4>Tools</h4>
          <table className="kbd-table"><tbody>
            {TOOLS.map((t) => <tr key={t.id}><td><kbd>{t.key}</kbd></td><td>{t.label}</td></tr>)}
          </tbody></table>
        </div>
        <div>
          <h4>Keys</h4>
          <table className="kbd-table"><tbody>
            {SHORTCUTS.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}
          </tbody></table>
        </div>
      </div>
      <h4>Animating</h4>
      <p>
        With <b>Animate mode</b> on, every change you make at the playhead becomes a keyframe. Properties that already have keyframes
        always get keyframed, even with animate mode off. Click a keyframe diamond to jump to it and set its easing; drag diamonds to retime.
        To morph shapes, convert a shape to a path, move the playhead and edit its nodes or choose “Morph into”.
      </p>
    </Modal>
  );
}

export function WelcomeDialog({ onImport }: { onImport: () => void }) {
  const close = () => dismissWelcome();
  const options = [
    { icon: 'upload', title: 'Import an SVG', text: 'Bring in a logo or illustration. Groups and layers are kept.', run: () => { newProject(); close(); onImport(); } },
    { icon: 'sparkles', title: 'Explore the demo', text: 'See bouncing, morphing and stroke drawing in action.', run: () => { loadDoc(demoDoc()); close(); } },
    { icon: 'plus', title: 'Start blank', text: 'An empty 800×500 artboard, ready for drawing.', run: () => { newProject(); close(); } },
  ];
  return (
    <Modal title="Welcome to Animora" onClose={close}>
      <p className="welcome-lead">
        Create SVG animations in your browser — free and open source. <b>No account needed</b>; your work is saved on this device.
      </p>
      <div className="welcome-grid">
        {options.map((o) => (
          <button key={o.title} className="welcome-option" onClick={o.run}>
            <span className="wo-icon"><Icon name={o.icon} size={22} /></span>
            <b>{o.title}</b>
            <span>{o.text}</span>
          </button>
        ))}
      </div>
      <ol className="welcome-steps">
        <li><span>1</span> Add artwork</li>
        <li><span>2</span> Group &amp; arrange layers</li>
        <li><span>3</span> Move the playhead and change things</li>
        <li><span>4</span> Export animated SVG or video</li>
      </ol>
    </Modal>
  );
}
