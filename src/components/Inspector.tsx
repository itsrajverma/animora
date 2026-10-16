import { useEffect, useRef } from 'react';
import { useStore, getState, setState } from '../state/store';
import {
  PRESETS, applyPreset, convertToPath, expand, findEl, findKeyframe, keyframeAt, morphTo, patchDoc, patchElement,
  setKeyframeEasing, setKeyframeTimes, setTime, setTool, setValue, toggleKeyframe,
} from '../state/actions';
import { alignSelection, distributeSelection, enterGroup, groupSelection, mergeSelection, ungroupSelection } from '../state/structure';
import { PROP_META, PROPS_BY_TYPE, supports } from '../model/props';
import type { PropKey, SvgEl } from '../model/types';
import { flatten } from '../model/tree';
import { valueAt } from '../engine/interpolate';
import { ColorField, NumberField } from './Fields';
import { EasingEditor } from './EasingEditor';
import { Icon } from './Icon';
import { TYPE_ICON } from './Sidebar';

const FONTS = [
  'Inter, Arial, sans-serif', 'Arial, Helvetica, sans-serif', 'Georgia, serif', "'Times New Roman', serif",
  "'Courier New', monospace", 'Verdana, sans-serif', "'Trebuchet MS', sans-serif", 'Impact, sans-serif', 'system-ui, sans-serif',
];

const TYPE_LABEL: Record<SvgEl['type'], string> = {
  rect: 'Rectangle', ellipse: 'Ellipse', path: 'Path', text: 'Text', image: 'Image', raw: 'Imported graphic', group: 'Group',
};

export function Inspector() {
  const tab = useStore((s) => s.inspectorTab);
  const selectedKfs = useStore((s) => s.selectedKfs);
  useEffect(() => {
    if (selectedKfs.length) setState({ inspectorTab: 'animate' });
  }, [selectedKfs.length]);
  return (
    <aside className="inspector">
      <div className="tabs">
        <button className={tab === 'design' ? 'active' : ''} onClick={() => setState({ inspectorTab: 'design' })}><Icon name="shapes" /> Design</button>
        <button className={tab === 'animate' ? 'active' : ''} onClick={() => setState({ inspectorTab: 'animate' })}><Icon name="wand" /> Animate</button>
      </div>
      <div className="inspector-body">{tab === 'design' ? <DesignTab /> : <AnimateTab />}</div>
    </aside>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="section">
      <header>
        <h3>{title}</h3>
        {right}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

function useSelected() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  return selection.map((id) => findEl(doc, id)).filter(Boolean) as SvgEl[];
}

function KeyButton({ el, prop }: { el: SvgEl; prop: PropKey }) {
  const time = useStore((s) => s.time);
  const animated = !!el.tracks[prop]?.length;
  const here = animated && !!keyframeAt(el, prop, time);
  return (
    <button
      className={`kf-btn ${animated ? 'animated' : ''} ${here ? 'here' : ''}`}
      title={here ? 'Remove keyframe at playhead' : animated ? 'Add keyframe at playhead' : 'Animate this property (adds a keyframe)'}
      onClick={() => toggleKeyframe(el.id, prop)}
    >
      <Icon name="diamond" size={11} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Design tab

function DesignTab() {
  const els = useSelected();
  const time = useStore((s) => s.time);
  if (!els.length) return <DocumentProps />;
  return <ElementProps el={els[0]} els={els} time={time} />;
}

function DocumentProps() {
  const doc = useStore((s) => s.doc);
  return (
    <>
      <Section title="Artboard">
        <label className="field-row">
          <span>Name</span>
          <input value={doc.name} onChange={(e) => patchDoc({ name: e.target.value }, 'docname')} />
        </label>
        <div className="grid2">
          <NumberField label="W" value={doc.width} min={1} onChange={(v, k) => patchDoc({ width: Math.round(v) }, k)} title="Artboard width" />
          <NumberField label="H" value={doc.height} min={1} onChange={(v, k) => patchDoc({ height: Math.round(v) }, k)} title="Artboard height" />
        </div>
        <div className="presets-row">
          {[['Web', 800, 500], ['Square', 1080, 1080], ['HD', 1920, 1080], ['Story', 1080, 1920], ['Icon', 512, 512]].map(([n, w, h]) => (
            <button key={String(n)} className={`chip ${doc.width === w && doc.height === h ? 'on' : ''}`} onClick={() => patchDoc({ width: +w, height: +h })}>
              {n} <span className="muted">{w}×{h}</span>
            </button>
          ))}
        </div>
        <div className="field-row">
          <span>Background</span>
          <ColorField value={doc.background || 'none'} onChange={(v, k) => patchDoc({ background: v }, k)} />
        </div>
      </Section>
      <Section title="Quick start">
        <ol className="steps">
          <li><b>Add artwork</b><span>Import an SVG, pick a shape, or draw with the toolbar.</span></li>
          <li><b>Organize</b><span>Select layers and press <kbd>Ctrl G</kbd> to group, or <b>Merge</b> them into one shape.</span></li>
          <li><b>Animate</b><span>Move the playhead, then change anything. Keyframes are added for you.</span></li>
          <li><b>Export</b><span>Animated SVG (no JavaScript needed) or a WebM video.</span></li>
        </ol>
        <p className="muted small">Everything stays in your browser — no account, no upload.</p>
      </Section>
    </>
  );
}

function ElementProps({ el, els, time }: { el: SvgEl; els: SvgEl[]; time: number }) {
  const ids = els.map((e) => e.id);
  const v = (p: PropKey) => valueAt(el, p, time);
  const num = (p: PropKey) => Number(v(p));
  const set = (p: PropKey) => (val: number | string, key: string) => setValue(ids, p, val, key);
  const has = (p: PropKey) => supports(el.type, p);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const focusText = useStore((s) => s.focusText);
  useEffect(() => {
    if (focusText && el.type === 'text' && textRef.current) {
      textRef.current.focus();
      textRef.current.select();
    }
  }, [focusText, el.type]);

  const cell = (p: PropKey, label: string) =>
    has(p) && (
      <div className="prop-cell" key={p}>
        <KeyButton el={el} prop={p} />
        <NumberField label={label} value={num(p)} step={PROP_META[p].step} min={PROP_META[p].min} max={PROP_META[p].max} unit={PROP_META[p].unit} onChange={set(p)} />
      </div>
    );
  const colorRow = (p: PropKey) =>
    has(p) && (
      <div className="prop-line" key={p}>
        <KeyButton el={el} prop={p} />
        <span className="line-label">{PROP_META[p].label}</span>
        <ColorField value={String(v(p))} onChange={set(p)} />
      </div>
    );

  const morphSources = flatten(getState().doc.elements).filter((e) => e.id !== el.id && ['rect', 'ellipse', 'path'].includes(e.type));
  const multi = els.length > 1;

  return (
    <>
      <div className="layer-card">
        <span className={`layer-icon big ${el.type === 'group' ? 'group' : ''}`}><Icon name={multi ? 'layers' : TYPE_ICON[el.type]} size={18} /></span>
        <div className="layer-card-main">
          {multi ? <b>{els.length} layers</b> : (
            <input className="name-input" value={el.name} onChange={(e) => patchElement(el.id, { name: e.target.value }, 'name')} />
          )}
          <span className="muted small">{multi ? 'Changes apply to all selected' : TYPE_LABEL[el.type]}{el.type === 'group' ? ` · ${el.children?.length ?? 0} layers inside` : ''}</span>
        </div>
      </div>

      <div className="action-row">
        <button className="btn sm" onClick={groupSelection}><Icon name="groupAdd" size={14} /> Group</button>
        {els.some((e) => e.type === 'group') && <button className="btn sm" onClick={ungroupSelection}><Icon name="ungroup" size={14} /> Ungroup</button>}
        {(multi || el.type === 'group') && <button className="btn sm" onClick={mergeSelection}><Icon name="merge" size={14} /> Merge</button>}
        {!multi && el.type === 'group' && <button className="btn sm" onClick={() => enterGroup(el.id)}><Icon name="enter" size={14} /> Edit inside</button>}
      </div>

      <Section title={multi ? 'Align selection' : 'Align to artboard'}>
        <div className="align-row">
          {(['left', 'centerH', 'right', 'top', 'middle', 'bottom'] as const).map((a) => (
            <button key={a} className="icon-btn sm" title={`Align ${a.replace('centerH', 'center')}`} onClick={() => alignSelection(a)}>
              <Icon name={'align' + a[0].toUpperCase() + a.slice(1)} />
            </button>
          ))}
          <span className="sep" />
          <button className="icon-btn sm" title="Distribute horizontally (3+ layers)" disabled={els.length < 3} onClick={() => distributeSelection('h')}><Icon name="distH" /></button>
          <button className="icon-btn sm" title="Distribute vertically (3+ layers)" disabled={els.length < 3} onClick={() => distributeSelection('v')}><Icon name="distV" /></button>
        </div>
      </Section>

      <Section title="Transform">
        <div className="grid2">
          {cell('x', 'X')}
          {cell('y', 'Y')}
          {cell('width', 'W')}
          {cell('height', 'H')}
          {cell('rotation', '↻')}
          {cell('opacity', 'Opacity')}
          {cell('scaleX', 'Scale X')}
          {cell('scaleY', 'Scale Y')}
          {cell('rx', 'Radius')}
          {cell('fontSize', 'Size')}
        </div>
      </Section>

      {el.type === 'text' && (
        <Section title="Text">
          <textarea
            ref={textRef}
            className="text-input"
            rows={2}
            value={el.text ?? ''}
            onChange={(e) => els.forEach((x) => x.type === 'text' && patchElement(x.id, { text: e.target.value }, 'text'))}
          />
          <div className="grid2">
            <select value={el.fontFamily ?? FONTS[0]} onChange={(e) => ids.forEach((id) => patchElement(id, { fontFamily: e.target.value }))}>
              {FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/'/g, '')}</option>)}
            </select>
            <select value={el.fontWeight ?? '400'} onChange={(e) => ids.forEach((id) => patchElement(id, { fontWeight: e.target.value }))}>
              {['300', '400', '500', '600', '700', '800', '900'].map((w) => <option key={w} value={w}>Weight {w}</option>)}
            </select>
          </div>
        </Section>
      )}

      {has('fill') && (
        <Section title="Appearance">
          {colorRow('fill')}
          {colorRow('stroke')}
          <div className="grid2">
            {cell('strokeWidth', 'Stroke')}
            {cell('trim', 'Draw')}
          </div>
          {el.type === 'path' && (
            <div className="grid2">
              <select value={el.lineCap ?? 'butt'} onChange={(e) => ids.forEach((id) => patchElement(id, { lineCap: e.target.value }))} title="Line cap">
                <option value="butt">Cap: flat</option>
                <option value="round">Cap: round</option>
                <option value="square">Cap: square</option>
              </select>
              <select value={el.lineJoin ?? 'miter'} onChange={(e) => ids.forEach((id) => patchElement(id, { lineJoin: e.target.value }))} title="Line join">
                <option value="miter">Join: sharp</option>
                <option value="round">Join: round</option>
                <option value="bevel">Join: bevel</option>
              </select>
            </div>
          )}
        </Section>
      )}

      {(el.type === 'path' || el.type === 'rect' || el.type === 'ellipse') && !multi && (
        <Section title="Shape & morph" right={<KeyButton el={el} prop="d" />}>
          {el.type !== 'path' ? (
            <button className="btn wide" onClick={() => convertToPath(el.id)}>Convert to path (enables morphing)</button>
          ) : (
            <>
              <button className="btn wide" onClick={() => setTool('node')}><Icon name="node" /> Edit nodes</button>
              <label className="field-row">
                <span>Morph into</span>
                <select value="" onChange={(e) => e.target.value && morphTo(el.id, e.target.value)}>
                  <option value="">Choose a shape…</option>
                  {morphSources.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <p className="muted small">Move the playhead first — the new shape becomes a morph keyframe.</p>
              <details>
                <summary>Path data</summary>
                <textarea className="code-input" rows={4} value={String(v('d'))} onChange={(e) => setValue([el.id], 'd', e.target.value, 'pathdata')} />
              </details>
            </>
          )}
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Animate tab

function AnimateTab() {
  const els = useSelected();
  const recordMode = useStore((s) => s.recordMode);
  const time = useStore((s) => s.time);
  const doc = useStore((s) => s.doc);
  const el = els[0];

  return (
    <>
      <div className={`record-card ${recordMode ? 'on' : ''}`}>
        <label className="switch">
          <input type="checkbox" checked={recordMode} onChange={(e) => setState({ recordMode: e.target.checked })} />
          <span className="slider" />
        </label>
        <div>
          <b>Animate mode {recordMode ? 'on' : 'off'}</b>
          <span>{recordMode ? 'Changes at the playhead create keyframes.' : 'Changes edit the static design (animated properties still get keyframes).'}</span>
        </div>
      </div>

      <KeyframeSection />

      {el ? (
        <>
          <Section title="Quick animations" right={<span className="muted small">at {time.toFixed(2)}s</span>}>
            <div className="preset-grid">
              {PRESETS.filter((p) => p.id !== 'draw' || els.some((e) => e.type === 'path')).map((p) => (
                <button key={p.id} className="preset" onClick={() => applyPreset(p.id)} title={p.hint}>
                  <b>{p.label}</b>
                  <span>{p.hint}</span>
                </button>
              ))}
            </div>
          </Section>
          {els.length === 1 && <AnimatedProps el={el} />}
        </>
      ) : (
        <Section title="Animation">
          <p className="muted">Select a layer to add quick animations, or move the playhead and edit a layer to create keyframes.</p>
        </Section>
      )}

      <Section title="Playback">
        <div className="grid2">
          <NumberField label="Length" value={doc.duration} min={0.1} step={0.1} unit="s" onChange={(v, k) => patchDoc({ duration: Math.round(v * 100) / 100 }, k)} />
          <label className="check-row">
            <input type="checkbox" checked={doc.loop} onChange={(e) => patchDoc({ loop: e.target.checked })} /> Loop forever
          </label>
        </div>
      </Section>
    </>
  );
}

function AnimatedProps({ el }: { el: SvgEl }) {
  const animated = PROPS_BY_TYPE[el.type].filter((p) => el.tracks[p]?.length);
  const time = useStore((s) => s.time);
  return (
    <Section title="Animated properties">
      {!animated.length && <p className="muted small">Nothing animated yet. Click a ◆ next to a property in Design, or use a quick animation.</p>}
      {animated.map((p) => {
        const tr = el.tracks[p]!;
        const next = tr.find((k) => k.time > time + 1e-3) ?? tr[0];
        return (
          <div key={p} className="anim-prop">
            <KeyButton el={el} prop={p} />
            <span className="grow">{PROP_META[p].label}</span>
            <span className="muted small">{tr.length} key{tr.length > 1 ? 's' : ''}</span>
            <button className="mini" title="Jump to next keyframe" onClick={() => { setTime(next.time); expand([el.id]); }}><Icon name="next" /></button>
          </div>
        );
      })}
    </Section>
  );
}

function KeyframeSection() {
  const selectedKfs = useStore((s) => s.selectedKfs);
  useStore((s) => s.doc);
  const kfs = selectedKfs.map(findKeyframe).filter(Boolean);
  if (!kfs.length) return null;
  const first = kfs[0]!;
  const mixed = kfs.some((k) => k!.easing !== first.easing);
  return (
    <Section title={kfs.length === 1 ? `Keyframe · ${PROP_META[selectedKfs[0].prop].label}` : `${kfs.length} keyframes`}>
      {kfs.length === 1 && (
        <NumberField label="Time" value={first.time} step={0.01} min={0} unit="s" onChange={(t, k) => setKeyframeTimes([{ ref: selectedKfs[0], time: t }], k)} />
      )}
      <div className="field-label">Easing to the next keyframe {mixed && <span className="muted">(mixed)</span>}</div>
      <EasingEditor value={first.easing} onChange={(id) => setKeyframeEasing(selectedKfs, id)} />
    </Section>
  );
}
