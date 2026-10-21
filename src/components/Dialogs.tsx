import { useEffect, useMemo, useState } from 'react';
import { useStore, getState, dismissWelcome } from '../state/store';
import { loadDoc, newProject, patchDoc } from '../state/actions';
import { exportSvg } from '../engine/render';
import { download, exportGif, exportPng, exportPngSequence, exportStaticSvg, exportWebm, safeName, saveProject, svgDataUrl } from '../io/files';
import { TOOLS } from './TopBar';
import { ANIMATORS } from '../model/props';
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

type Format = 'svg' | 'video' | 'gif' | 'png' | 'other';

const FORMATS: { id: Format; label: string }[] = [
  { id: 'svg', label: 'SVG' },
  { id: 'video', label: 'Video' },
  { id: 'gif', label: 'GIF' },
  { id: 'png', label: 'PNG sequence' },
  { id: 'other', label: 'Frame & project' },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const [format, setFormat] = useState<Format>('svg');
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [fps, setFps] = useState(30);
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svg = useMemo(() => exportSvg(doc, { animated: true }), [doc]);
  const kb = (new Blob([svg]).size / 1024).toFixed(1);
  const embed = doc.trigger === 'load'
    ? `<img src="${safeName(doc)}.svg" width="${doc.width}" height="${doc.height}" alt="${doc.name.replace(/"/g, '')}">`
    : `<object data="${safeName(doc)}.svg" type="image/svg+xml" width="${doc.width}" height="${doc.height}"></object>`;
  const busy = progress !== null;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setProgress(0);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || 'Export failed');
    }
    setProgress(null);
  };

  const settings = (
    <div className="export-settings">
      <label className="field-row"><span>Start</span>
        <select value={doc.trigger} onChange={(e) => patchDoc({ trigger: e.target.value as typeof doc.trigger })} disabled={format !== 'svg'}>
          <option value="load">On load</option>
          <option value="hover">On mouse over</option>
          <option value="click">On click</option>
        </select>
      </label>
      <label className="field-row"><span>Iterations</span>
        <div className="grid2">
          <select value={doc.loop ? 'inf' : 'count'} onChange={(e) => patchDoc({ loop: e.target.value === 'inf' })}>
            <option value="inf">Infinite</option>
            <option value="count">Count</option>
          </select>
          <input type="number" min={1} value={doc.iterations} disabled={doc.loop} onChange={(e) => patchDoc({ iterations: Math.max(1, Math.round(+e.target.value || 1)) }, 'iter')} />
        </div>
      </label>
      <label className="field-row"><span>Direction</span>
        <select value={doc.direction} onChange={(e) => patchDoc({ direction: e.target.value as typeof doc.direction })}>
          <option value="normal">Normal</option>
          <option value="reverse">Reverse</option>
          <option value="alternate">Alternate</option>
          <option value="alternate-reverse">Alternate reverse</option>
        </select>
      </label>
      <label className="field-row"><span>Speed</span>
        <div className="grid2">
          <input type="number" min={1} max={1000} step={5} value={doc.speed} onChange={(e) => patchDoc({ speed: Math.max(1, Math.round(+e.target.value || 100)) }, 'speed')} />
          <span className="muted">%</span>
        </div>
      </label>
      <label className="field-row"><span>Fill mode</span>
        <select value={doc.fillMode} onChange={(e) => patchDoc({ fillMode: e.target.value as typeof doc.fillMode })} disabled={format !== 'svg'}>
          <option value="freeze">Forwards</option>
          <option value="remove">Backwards</option>
        </select>
      </label>
    </div>
  );

  const rasterOpts = (
    <>
      <label className="field-row"><span>Frame rate</span>
        <select value={fps} onChange={(e) => setFps(+e.target.value)} disabled={busy}>
          {[10, 12, 15, 24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
        </select>
      </label>
      <label className="field-row"><span>Resolution</span>
        <select value={scale} onChange={(e) => setScale(+e.target.value)} disabled={busy}>
          {[0.25, 0.5, 1, 1.5, 2].map((k) => <option key={k} value={k}>{Math.round(doc.width * k)} × {Math.round(doc.height * k)} ({k * 100}%)</option>)}
        </select>
      </label>
    </>
  );

  return (
    <Modal title="Export" onClose={() => !busy && onClose()} wide>
      <div className="export-tabs">
        {FORMATS.map((f) => <button key={f.id} className={format === f.id ? 'active' : ''} onClick={() => !busy && setFormat(f.id)}>{f.label}</button>)}
      </div>
      <div className="preview-layout">
        <div className="preview-stage">
          <img key={nonce} src={svgDataUrl(svg)} alt="Animation preview" style={{ aspectRatio: `${doc.width} / ${doc.height}` }} />
        </div>
        <div className="preview-side">
          {format === 'svg' && (
            <>
              <p>A single <b>animated SVG</b> using native SMIL animation: no JavaScript, works in all modern browsers, in <code>&lt;img&gt;</code> tags and CSS backgrounds.</p>
              <div className="stat"><span>File size</span><b>{kb} KB</b></div>
              {settings}
              <div className="btn-col">
                <button className="btn primary" onClick={() => download(svg, `${safeName(doc)}.svg`, 'image/svg+xml')}>Download SVG</button>
                <button className="btn" onClick={async () => {
                  await navigator.clipboard.writeText(svg);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}>{copied ? 'Copied!' : 'Copy SVG code'}</button>
                <button className="btn" onClick={() => setNonce(nonce + 1)}>Refresh preview</button>
              </div>
              <div className="field-label">Embed in a web page</div>
              <pre className="code-block">{embed}</pre>
              {doc.trigger !== 'load' && <p className="muted small">Click / mouse-over starts need the SVG inline or in an <code>&lt;object&gt;</code>; inside <code>&lt;img&gt;</code> the animation can't receive events.</p>}
            </>
          )}
          {format === 'video' && (
            <>
              <p>Records a <b>WebM</b> video in your browser, in real time. Transparent backgrounds become white.</p>
              {settings}
              <label className="field-row"><span>Frame rate</span>
                <select value={fps} onChange={(e) => setFps(+e.target.value)} disabled={busy}>
                  {[24, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
                </select>
              </label>
              <div className="btn-col">
                <button className="btn primary" disabled={busy} onClick={() => run(() => exportWebm(getState().doc, setProgress, fps))}>
                  {busy ? `Recording… ${Math.round((progress ?? 0) * 100)}%` : 'Record & download'}
                </button>
              </div>
            </>
          )}
          {format === 'gif' && (
            <>
              <p>An animated <b>GIF</b> (up to 256 colors). Loops follow the iteration setting.</p>
              {settings}
              {rasterOpts}
              <label className="check-row"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background</label>
              <div className="btn-col">
                <button className="btn primary" disabled={busy} onClick={() => run(() => exportGif(getState().doc, { fps, scale, transparent }, setProgress))}>
                  {busy ? `Rendering… ${Math.round((progress ?? 0) * 100)}%` : 'Export GIF'}
                </button>
              </div>
            </>
          )}
          {format === 'png' && (
            <>
              <p>Every frame as a <b>PNG</b> image (with transparency), bundled in a ZIP file. Handy for video editors and game engines.</p>
              {settings}
              {rasterOpts}
              <div className="btn-col">
                <button className="btn primary" disabled={busy} onClick={() => run(() => exportPngSequence(getState().doc, { fps, scale }, setProgress))}>
                  {busy ? `Rendering… ${Math.round((progress ?? 0) * 100)}%` : 'Export PNG frames (.zip)'}
                </button>
              </div>
            </>
          )}
          {format === 'other' && (
            <>
              <p>Export a still of the frame at the playhead ({getState().time.toFixed(2)}s), or the editable project file.</p>
              <div className="btn-col">
                <button className="btn" onClick={() => exportPng(getState().doc, getState().time)}>PNG of current frame (2×)</button>
                <button className="btn" onClick={() => exportStaticSvg(getState().doc, getState().time)}>Static SVG of current frame</button>
                <button className="btn primary" onClick={() => saveProject(getState().doc)}>Project file (.animora.json)</button>
              </div>
            </>
          )}
          {busy && <div className="progress"><div style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>}
          {error && <p className="error">{error}</p>}
        </div>
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
  ['Ctrl+C / X / V', 'Copy / cut / paste (layers or keyframes)'],
  ['Ctrl+D', 'Duplicate (layers or keyframes)'],
  ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'],
  ['Ctrl+M', 'Merge into one path'],
  ['Ctrl+Shift+O', 'Center origin'],
  ['Ctrl+E', 'Export'],
  ['Ctrl+Shift+E', 'Download animated SVG'],
  ['Double-click group', 'Edit layers inside it'],
  ['Ctrl+click', 'Select a layer deep inside groups'],
  ['Arrows (+Shift)', 'Nudge 1px (10px)'],
  ['1 / Ctrl+0', 'Fit canvas into view'],
  ['Ctrl+wheel', 'Zoom'],
  ['Wheel, middle-drag, H', 'Pan the canvas'],
  ['Alt+S / Alt+G', 'Snapping / grid'],
  ['Alt+R / Alt+L', 'Rulers / guides'],
  ['Alt while dragging', 'Move without snapping'],
  ['Ctrl+S / Ctrl+O', 'Save / open project'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Shortcuts & help" onClose={onClose} wide>
      <div className="help-grid three">
        <div>
          <h4>Tools</h4>
          <table className="kbd-table"><tbody>
            {TOOLS.map((t) => <tr key={t.id}><td><kbd>{t.key}</kbd></td><td>{t.label}</td></tr>)}
          </tbody></table>
          <h4>Animators</h4>
          <table className="kbd-table"><tbody>
            {ANIMATORS.filter((a) => a.key).map((a) => <tr key={a.id}><td><kbd>Shift+{a.key}</kbd></td><td>{a.label}</td></tr>)}
          </tbody></table>
        </div>
        <div>
          <h4>Keys</h4>
          <table className="kbd-table"><tbody>
            {SHORTCUTS.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}
          </tbody></table>
        </div>
        <div>
          <h4>How animating works</h4>
          <ol className="help-steps">
            <li>Select an element, then click <b>Animate</b> in the timeline and pick an animator (Position, Scale, Rotate, Morph, Fill color…). A keyframe is added at the playhead.</li>
            <li>Move the playhead and change the value on the canvas or in Properties. A new keyframe appears automatically.</li>
            <li>Select keyframes (click, Shift-click or drag a box in the timeline) and set their <b>easing</b> with the curve button or in Properties.</li>
            <li>Drag keyframes to retime them; drag the bar between two keyframes to move both. Right-click for copy, paste, reverse.</li>
            <li>Drag the white end marker on the timeline ruler to change the animation length.</li>
          </ol>
          <h4>Recipes</h4>
          <ul className="help-steps">
            <li><b>Motion path:</b> select an element → Properties → <b>Set motion path</b>, then click a path (or create a default one). Animate its Offset; tick Auto orient to follow the curve.</li>
            <li><b>Draw a line:</b> on a path, Stroke → <b>Set as offset</b>, then animate Stroke offset to 0 — or simply use the Draw stroke animator.</li>
            <li><b>Mask:</b> put the mask shape on top, select it with the layers to mask, and click <b>Create mask</b> in the toolbar.</li>
            <li><b>Pivot:</b> drag the origin point (the crosshair) on the canvas to rotate and scale around another point.</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

export function WelcomeDialog({ onImport, onTemplates }: { onImport: () => void; onTemplates: () => void }) {
  const close = () => dismissWelcome();
  const options = [
    { icon: 'template', title: 'Start from a template', text: 'Loaders, motion paths, masks, morphs and more, ready to edit.', run: () => { close(); onTemplates(); } },
    { icon: 'upload', title: 'Import an SVG', text: 'Bring in a logo or illustration. Groups and layers are kept.', run: () => { newProject(); close(); onImport(); } },
    { icon: 'sparkles', title: 'Explore the demo', text: 'See bouncing, morphing and stroke drawing in action.', run: () => { loadDoc(demoDoc()); close(); } },
    { icon: 'plus', title: 'Start blank', text: 'An empty 800×500 canvas, ready for drawing.', run: () => { newProject(); close(); } },
  ];
  return (
    <Modal title="Welcome to Animora" onClose={close} wide>
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
        <li><span>2</span> Select it and click Animate</li>
        <li><span>3</span> Move the playhead and change things</li>
        <li><span>4</span> Export SVG, video or GIF</li>
      </ol>
    </Modal>
  );
}
