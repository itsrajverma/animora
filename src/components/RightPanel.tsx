import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, getState, notify, setState } from '../state/store';
import {
  PRESETS, applyPreset, convertToPath, deleteSelection, findEl, findKeyframe, keyframeAt, morphTo, patchDoc, patchElement,
  removeKeyframes, setKeyframeEasing, setKeyframeTimes, setTime, setTool, setValue, setValues, type Change,
} from '../state/actions';
import { alignSelection, distributeSelection, enterGroup, moveByWorld, ungroupSelection } from '../state/structure';
import {
  addComment, centerOrigin, deleteComment, patchComment, releaseMask, removeMotionPath, setOrigin, startPickMotionPath,
} from '../state/editing';
import { copyKeyframes, pasteKeyframes, reverseKeyframes, setKeyframeValue, toggleAnimatorKey } from '../state/animate';
import { PROP_META, supports } from '../model/props';
import type { PropKey, SvgEl } from '../model/types';
import { flatten, locate } from '../model/tree';
import { frameAt, hasShadow } from '../engine/interpolate';
import { pathLength } from '../engine/motion';
import { putItem, savedElementsItem } from '../io/userLibrary';
import { ColorField, NumberField } from './Fields';
import { EasingEditor } from './EasingEditor';
import { canvasApi } from './canvasApi';
import { Icon } from './Icon';

const FONTS = [
  'Inter, Arial, sans-serif', 'Arial, Helvetica, sans-serif', 'Georgia, serif', "'Times New Roman', serif",
  "'Courier New', monospace", 'Verdana, sans-serif', "'Trebuchet MS', sans-serif", 'Impact, sans-serif', 'system-ui, sans-serif',
];

const TYPE_LABEL: Record<SvgEl['type'], string> = {
  rect: 'Rectangle', ellipse: 'Ellipse', path: 'Path', text: 'Text', image: 'Image', raw: 'Graphic', group: 'Group',
};

const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

export function RightPanel() {
  const tab = useStore((s) => s.rightTab);
  const comments = useStore((s) => s.doc.comments.filter((c) => !c.resolved).length);
  return (
    <aside className="right-panel">
      <div className="ptabs">
        <button className="collapse-btn" onClick={() => setState({ rightOpen: false })} title="Hide panel"><Icon name="chevR" /></button>
        <button className={tab === 'properties' ? 'active' : ''} onClick={() => setState({ rightTab: 'properties' })}>Properties</button>
        <button className={tab === 'comments' ? 'active' : ''} onClick={() => setState({ rightTab: 'comments' })}>
          Comments {comments > 0 && <span className="badge">{comments}</span>}
        </button>
      </div>
      <div className="right-body">{tab === 'properties' ? <Properties /> : <Comments />}</div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Building blocks

const collapsed: Record<string, boolean> = { presets: true };

function Section({ id, title, children, right }: { id: string; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  const [open, setOpen] = useState(!collapsed[id]);
  return (
    <section className={`psection ${open ? '' : 'closed'}`}>
      <header onClick={() => { collapsed[id] = open; setOpen(!open); }}>
        <span className="ps-side" onClick={(e) => e.stopPropagation()}>{right}</span>
        <h3>{title}</h3>
        <span className="ps-side end"><Icon name="chevD" size={12} /></span>
      </header>
      {open && <div className="psection-body">{children}</div>}
    </section>
  );
}

/** Keyframe diamond for one or more properties (an animator) at the playhead. */
function KeyDiamond({ el, props }: { el: SvgEl; props: PropKey[] }) {
  const time = useStore((s) => s.time);
  const ps = props.filter((p) => supports(el.type, p));
  if (!ps.length) return <span className="kf-btn placeholder" />;
  const animated = ps.some((p) => el.tracks[p]?.length);
  const here = animated && ps.some((p) => keyframeAt(el, p, time));
  return (
    <button
      className={`kf-btn ${animated ? 'animated' : ''} ${here ? 'here' : ''}`}
      title={here ? 'Remove keyframe at playhead' : animated ? 'Add keyframe at playhead' : 'Animate (adds a keyframe)'}
      onClick={() => toggleAnimatorKey(el.id, ps)}
    >
      <Icon name="diamond" size={10} />
    </button>
  );
}

function Row({ label, el, props, children, wide }: { label: string; el?: SvgEl; props?: PropKey[]; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`prow ${wide ? 'wide' : ''}`}>
      <span className="prow-label">{el && props ? <KeyDiamond el={el} props={props} /> : <span className="kf-btn placeholder" />}{label}</span>
      <div className="prow-fields">{children}</div>
    </div>
  );
}

function useSelected() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  return selection.map((id) => findEl(doc, id)).filter(Boolean) as SvgEl[];
}

type WBox = { x: number; y: number; w: number; h: number };

/** Artboard-space bounding box of the selection, measured from the canvas after it rendered. */
function useWorldBox(ids: string[]): WBox | null {
  // Re-measure whenever the document or the playhead changes.
  useStore((s) => s.doc);
  useStore((s) => s.time);
  const [box, setBox] = useState<WBox | null>(null);
  useLayoutEffect(() => {
    const pts = ids.flatMap((id) => canvasApi.measure(id)?.corners ?? []);
    if (!pts.length) {
      if (box) setBox(null);
      return;
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    if (!box || Object.keys(b).some((k) => Math.abs(b[k as keyof WBox] - box[k as keyof WBox]) > 1e-3)) setBox(b);
  });
  return box;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Properties

function Properties() {
  const els = useSelected();
  const time = useStore((s) => s.time);
  const selectedKfs = useStore((s) => s.selectedKfs);
  const ids = els.map((e) => e.id);
  return (
    <>
      <div className="align-bar">
        {(['left', 'centerH', 'right'] as const).map((a) => (
          <button key={a} className="mini" disabled={!els.length} title={`Align ${a.replace('centerH', 'center')}`} onClick={() => alignSelection(a)}>
            <Icon name={'align' + a[0].toUpperCase() + a.slice(1)} />
          </button>
        ))}
        <span className="sep" />
        {(['top', 'middle', 'bottom'] as const).map((a) => (
          <button key={a} className="mini" disabled={!els.length} title={`Align ${a}`} onClick={() => alignSelection(a)}>
            <Icon name={'align' + a[0].toUpperCase() + a.slice(1)} />
          </button>
        ))}
        <span className="sep" />
        <button className="mini" title="Distribute horizontally (3+ layers)" disabled={els.length < 3} onClick={() => distributeSelection('h')}><Icon name="distH" /></button>
        <button className="mini" title="Distribute vertically (3+ layers)" disabled={els.length < 3} onClick={() => distributeSelection('v')}><Icon name="distV" /></button>
      </div>
      {selectedKfs.length > 0 && <KeyframeSection />}
      {els.length ? <ElementProps el={els[0]} els={els} ids={ids} time={time} /> : <CanvasProps />}
    </>
  );
}

function CanvasProps() {
  const doc = useStore((s) => s.doc);
  return (
    <>
      <Section id="canvas" title="Canvas">
        <Row label="Name"><input className="pinput" value={doc.name} onChange={(e) => patchDoc({ name: e.target.value }, 'docname')} /></Row>
        <Row label="Size">
          <NumberField suffix label="W" value={doc.width} min={1} onChange={(v, k) => patchDoc({ width: Math.round(v) }, k)} />
          <NumberField suffix label="H" value={doc.height} min={1} onChange={(v, k) => patchDoc({ height: Math.round(v) }, k)} />
        </Row>
        <div className="presets-row">
          {[['Web', 800, 500], ['Square', 1080, 1080], ['HD', 1920, 1080], ['Story', 1080, 1920], ['Icon', 512, 512]].map(([n, w, h]) => (
            <button key={String(n)} className={`chip ${doc.width === w && doc.height === h ? 'on' : ''}`} onClick={() => patchDoc({ width: +w, height: +h })}>
              {n} <span className="muted">{w}×{h}</span>
            </button>
          ))}
        </div>
        <Row label="Color"><ColorField value={doc.background || 'none'} onChange={(v, k) => patchDoc({ background: v }, k)} /></Row>
      </Section>
      <Section id="animation" title="Animation">
        <Row label="Duration">
          <NumberField suffix label="s" value={doc.duration} min={0.1} step={0.1} onChange={(v, k) => patchDoc({ duration: Math.round(v * 100) / 100 }, k)} />
          <span />
        </Row>
        <Row label="Iterations">
          <select value={doc.loop ? 'inf' : 'count'} onChange={(e) => patchDoc({ loop: e.target.value === 'inf' })}>
            <option value="inf">Infinite</option>
            <option value="count">Count</option>
          </select>
          <NumberField suffix label="×" value={doc.iterations} min={1} step={1} disabled={doc.loop} onChange={(v, k) => patchDoc({ iterations: Math.max(1, Math.round(v)) }, k)} />
        </Row>
        <Row label="Direction">
          <select value={doc.direction} onChange={(e) => patchDoc({ direction: e.target.value as typeof doc.direction })}>
            <option value="normal">Normal</option>
            <option value="reverse">Reverse</option>
            <option value="alternate">Alternate</option>
            <option value="alternate-reverse">Alternate reverse</option>
          </select>
        </Row>
        <Row label="Speed"><NumberField suffix label="%" value={doc.speed} min={1} max={1000} step={5} onChange={(v, k) => patchDoc({ speed: Math.round(v) }, k)} /><span /></Row>
        <Row label="Start">
          <select value={doc.trigger} onChange={(e) => patchDoc({ trigger: e.target.value as typeof doc.trigger })}>
            <option value="load">On load</option>
            <option value="hover">On mouse over</option>
            <option value="click">On click</option>
          </select>
        </Row>
        <Row label="Fill mode">
          <select value={doc.fillMode} onChange={(e) => patchDoc({ fillMode: e.target.value as typeof doc.fillMode })}>
            <option value="freeze">Forwards (keep last frame)</option>
            <option value="remove">Backwards (back to first)</option>
          </select>
        </Row>
        <p className="muted small note">These settings are used by the exported SVG, video and GIF. Mouse-over and click start work when the SVG is embedded inline or with <code>&lt;object&gt;</code>.</p>
      </Section>
      <Section id="tips" title="Getting started">
        <ol className="steps">
          <li><b>Add artwork</b><span>Draw with the toolbar, pick from the Library, start from a Template or import an SVG.</span></li>
          <li><b>Animate</b><span>Select an element and click <b>Animate</b> in the timeline (or press Shift+P, Shift+S, Shift+R…).</span></li>
          <li><b>Keyframes</b><span>Move the playhead and change values. Keyframes are added automatically.</span></li>
          <li><b>Export</b><span>Animated SVG (no JavaScript), video, GIF or PNG frames.</span></li>
        </ol>
      </Section>
    </>
  );
}

function ElementProps({ el, els, ids, time }: { el: SvgEl; els: SvgEl[]; ids: string[]; time: number }) {
  const f = frameAt(el, time);
  const box = useWorldBox(ids);
  const [linkScale, setLinkScale] = useState(true);
  const [linkSize, setLinkSize] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const focusText = useStore((s) => s.focusText);
  const doc = useStore((s) => s.doc);
  useEffect(() => {
    if (focusText && el.type === 'text' && textRef.current) {
      textRef.current.focus();
      textRef.current.select();
    }
  }, [focusText, el.type]);

  const has = (p: PropKey) => supports(el.type, p);
  const set = (p: PropKey) => (val: number | string, key: string) => setValue(ids, p, val, key);
  const multi = els.length > 1;
  const parent = locate(doc.elements, el.id)?.parent ?? null;

  const resize = (axis: 'w' | 'h', v: number, key: string) => {
    if (!box) return;
    const cur = axis === 'w' ? box.w : box.h;
    if (cur <= 1e-6 || v <= 0) return;
    const k = v / cur;
    const ch: Change[] = [];
    for (const e of els) {
      const fe = frameAt(e, time);
      const both = linkSize;
      const sized = e.type === 'rect' || e.type === 'ellipse' || e.type === 'image';
      if (sized && !fe.rotation && !fe.skewX && !fe.skewY) {
        if (axis === 'w' || both) ch.push([e.id, 'width', r2(fe.width * k)]);
        if (axis === 'h' || both) ch.push([e.id, 'height', r2(fe.height * k)]);
      } else {
        if (axis === 'w' || both) ch.push([e.id, 'scaleX', Math.round(fe.scaleX * k * 1000) / 1000]);
        if (axis === 'h' || both) ch.push([e.id, 'scaleY', Math.round(fe.scaleY * k * 1000) / 1000]);
      }
    }
    setValues(ch, key);
  };

  const saveToLibrary = async () => {
    const snap = canvasApi.snapshot(ids);
    if (!snap) return;
    const name = prompt('Name for the library item', multi ? 'My elements' : el.name)?.trim();
    if (!name) return;
    const toSave = els.map((e) => JSON.parse(JSON.stringify(e)) as SvgEl);
    try {
      await putItem(savedElementsItem(name, toSave, snap.markup, snap.box, getState().doc.defs));
      notify(`Saved “${name}” to your library (Library → Saved).`);
    } catch {
      notify('Could not save to the library in this browser.');
    }
  };

  const turns = Math.trunc(f.rotation / 360);
  const deg = r2(f.rotation - turns * 360);
  const len = el.type === 'path' ? pathLength(f.d) : 0;
  const morphSources = flatten(doc.elements).filter((e) => e.id !== el.id && ['rect', 'ellipse', 'path'].includes(e.type));
  const showShadow = hasShadow(f) || !!el.tracks.shadowColor?.length;
  const showBlur = f.blur > 0 || !!el.tracks.blur?.length;

  return (
    <>
      <Section id="element" title={multi ? `${els.length} elements` : TYPE_LABEL[el.type]}>
        {!multi && (
          <Row label="Name"><input className="pinput" value={el.name} onChange={(e) => patchElement(el.id, { name: e.target.value }, 'name')} /></Row>
        )}
        <Row label="Position">
          <NumberField suffix label="x" value={r2(box?.x ?? 0)} onChange={(v, k) => box && moveByWorld(ids, v - box.x, 0, k)} />
          <NumberField suffix label="y" value={r2(box?.y ?? 0)} onChange={(v, k) => box && moveByWorld(ids, 0, v - box.y, k)} />
        </Row>
        <Row label="Size" props={['width', 'height']} el={has('width') ? el : undefined}>
          <NumberField suffix label="w" value={r2(box?.w ?? 0)} min={0.1} onChange={(v, k) => resize('w', v, k)} />
          <NumberField suffix label="h" value={r2(box?.h ?? 0)} min={0.1} onChange={(v, k) => resize('h', v, k)} />
          <button className={`mini link ${linkSize ? 'on' : ''}`} title="Maintain proportions" onClick={() => setLinkSize(!linkSize)}><Icon name={linkSize ? 'link' : 'unlink'} /></button>
        </Row>
        {el.type === 'rect' && (
          <Row label="Radius" el={el} props={['rx']}>
            <NumberField suffix label="px" value={r2(f.rx)} min={0} onChange={set('rx')} />
            <span />
          </Row>
        )}
        <div className="pbuttons">
          <button className="pbtn" onClick={saveToLibrary}><Icon name="bookmark" size={14} /> Save to library</button>
          {!multi && !el.motionPath && <button className="pbtn" onClick={() => startPickMotionPath(el.id)}><Icon name="motion" size={14} /> Set motion path</button>}
          {!multi && el.type === 'group' && <button className="pbtn" onClick={() => enterGroup(el.id)}><Icon name="enter" size={14} /> Edit inside</button>}
          {els.some((e) => e.type === 'group') && <button className="pbtn" onClick={ungroupSelection}><Icon name="ungroup" size={14} /> Ungroup</button>}
          {!multi && (el.type === 'rect' || el.type === 'ellipse') && <button className="pbtn" onClick={() => convertToPath(el.id)}><Icon name="pen" size={14} /> Convert to path</button>}
          {!multi && el.type === 'path' && <button className="pbtn" onClick={() => setTool('node')}><Icon name="node" size={14} /> Edit nodes</button>}
        </div>
      </Section>

      {!multi && el.motionPath && (
        <Section id="motion" title="Motion path">
          <Row label="Offset" el={el} props={['motion']}>
            <NumberField suffix label="%" value={r2(f.motion)} min={0} max={100} step={0.5} onChange={set('motion')} />
            <span />
          </Row>
          <label className="check-row">
            <input type="checkbox" checked={!!el.autoRotate} onChange={(e) => patchElement(el.id, { autoRotate: e.target.checked })} /> Auto orient (rotate along the path)
          </label>
          <div className="pbuttons">
            <button className="pbtn" onClick={() => startPickMotionPath(el.id)}>Replace path…</button>
            <button className="pbtn danger" onClick={() => removeMotionPath(el.id)}>Remove motion path</button>
          </div>
          <p className="muted small note">Drag the path's points on the canvas to reshape it. Animate <b>Offset</b> to control the speed.</p>
        </Section>
      )}

      <Section id="transforms" title="Transforms">
        <Row label="Position" el={el} props={el.motionPath ? ['motion'] : ['x', 'y']}>
          <NumberField suffix label="x" value={r2(f.x)} onChange={set('x')} />
          <NumberField suffix label="y" value={r2(f.y)} onChange={set('y')} />
        </Row>
        <Row label="Origin" el={el} props={['originX', 'originY']}>
          <NumberField suffix label="x" value={r2(f.originX)} onChange={(v, k) => setOrigin(ids, v, null, k)} />
          <NumberField suffix label="y" value={r2(f.originY)} onChange={(v, k) => setOrigin(ids, null, v, k)} />
          <button className="mini" title="Center origin (Ctrl+Shift+O)" onClick={() => centerOrigin(ids)}><Icon name="origin" /></button>
        </Row>
        <Row label="Scale" el={el} props={['scaleX', 'scaleY']}>
          <NumberField suffix label="x" value={f.scaleX} step={0.01} onChange={(v, k) => setValues(ids.flatMap((id) => {
            const ch: Change[] = [[id, 'scaleX', v]];
            if (linkScale && f.scaleX) ch.push([id, 'scaleY', Math.round((f.scaleY * v) / f.scaleX * 1000) / 1000]);
            return ch;
          }), k)} />
          <NumberField suffix label="y" value={f.scaleY} step={0.01} onChange={(v, k) => setValues(ids.flatMap((id) => {
            const ch: Change[] = [[id, 'scaleY', v]];
            if (linkScale && f.scaleY) ch.push([id, 'scaleX', Math.round((f.scaleX * v) / f.scaleY * 1000) / 1000]);
            return ch;
          }), k)} />
          <button className={`mini link ${linkScale ? 'on' : ''}`} title="Maintain proportions" onClick={() => setLinkScale(!linkScale)}><Icon name={linkScale ? 'link' : 'unlink'} /></button>
        </Row>
        <Row label="Skew" el={el} props={['skewX', 'skewY']}>
          <NumberField suffix label="x°" value={r2(f.skewX)} min={-89} max={89} onChange={set('skewX')} />
          <NumberField suffix label="y°" value={r2(f.skewY)} min={-89} max={89} onChange={set('skewY')} />
        </Row>
        <Row label="Rotate" el={el} props={['rotation']}>
          <NumberField suffix label="turn" value={turns} step={1} onChange={(v, k) => setValue(ids, 'rotation', Math.round(v) * 360 + deg, k)} />
          <NumberField suffix label="deg" value={deg} onChange={(v, k) => setValue(ids, 'rotation', turns * 360 + v, k)} />
          {!multi && el.motionPath && (
            <button className={`mini ${el.autoRotate ? 'on' : ''}`} title="Auto orient along the motion path" onClick={() => patchElement(el.id, { autoRotate: !el.autoRotate })}><Icon name="orient" /></button>
          )}
        </Row>
      </Section>

      {el.type === 'text' && (
        <Section id="text" title="Text">
          <textarea ref={textRef} className="text-input" rows={2} value={el.text ?? ''}
            onChange={(e) => els.forEach((x) => x.type === 'text' && patchElement(x.id, { text: e.target.value }, 'text'))} />
          <Row label="Font">
            <select value={el.fontFamily ?? FONTS[0]} onChange={(e) => ids.forEach((id) => patchElement(id, { fontFamily: e.target.value }))}>
              {FONTS.map((x) => <option key={x} value={x}>{x.split(',')[0].replace(/'/g, '')}</option>)}
            </select>
          </Row>
          <Row label="Style" el={el} props={['fontSize']}>
            <select value={el.fontWeight ?? '400'} onChange={(e) => ids.forEach((id) => patchElement(id, { fontWeight: e.target.value }))}>
              {['300', '400', '500', '600', '700', '800', '900'].map((w) => <option key={w} value={w}>Weight {w}</option>)}
            </select>
            <NumberField suffix label="px" value={r2(f.fontSize)} min={1} onChange={set('fontSize')} />
          </Row>
          <Row label="Align">
            <div className="seg-btns">
              {(['start', 'middle', 'end'] as const).map((a) => (
                <button key={a} className={(el.textAlign ?? 'middle') === a ? 'on' : ''} onClick={() => ids.forEach((id) => patchElement(id, { textAlign: a }))}>
                  <Icon name={a === 'start' ? 'alignLeft' : a === 'middle' ? 'alignCenterH' : 'alignRight'} size={14} />
                </button>
              ))}
            </div>
            <NumberField suffix label="ls" title="Letter spacing" value={el.letterSpacing ?? 0} step={0.5} onChange={(v, k) => ids.forEach((id) => patchElement(id, { letterSpacing: v }, k))} />
          </Row>
        </Section>
      )}

      <Section id="appearance" title="Appearance">
        <Row label="Opacity" el={el} props={['opacity']}>
          <input type="range" min={0} max={1} step={0.01} value={f.opacity} onChange={(e) => setValue(ids, 'opacity', +e.target.value, 'opacity-slider')} />
          <NumberField suffix label="%" value={Math.round(f.opacity * 100)} min={0} max={100} onChange={(v, k) => setValue(ids, 'opacity', v / 100, k)} />
        </Row>
        <Row label="Blend">
          <select value={el.blend ?? 'normal'} onChange={(e) => ids.forEach((id) => patchElement(id, { blend: e.target.value }))}>
            {BLENDS.map((b) => <option key={b} value={b}>{b[0].toUpperCase() + b.slice(1).replace('-', ' ')}</option>)}
          </select>
        </Row>
        {!multi && (
          <label className="check-row" title="This layer masks the layers below it in the same group">
            <input type="checkbox" checked={!!el.isMask} onChange={(e) => (e.target.checked ? patchElement(el.id, { isMask: true }) : releaseMask(el.id))} />
            Use as mask for the layers below{parent ? ` in “${parent.name}”` : ''}
          </label>
        )}
      </Section>

      {has('fill') && (
        <Section id="fill" title="Fill">
          <Row label="Color" el={el} props={['fill']}><ColorField value={f.fill} onChange={set('fill')} /></Row>
          <Row label="Opacity" el={el} props={['fillOpacity']}>
            <input type="range" min={0} max={1} step={0.01} value={f.fillOpacity} onChange={(e) => setValue(ids, 'fillOpacity', +e.target.value, 'fo-slider')} />
            <NumberField suffix label="%" value={Math.round(f.fillOpacity * 100)} min={0} max={100} onChange={(v, k) => setValue(ids, 'fillOpacity', v / 100, k)} />
          </Row>
          {el.type === 'path' && (
            <Row label="Fill rule">
              <select value={el.fillRule ?? 'nonzero'} onChange={(e) => ids.forEach((id) => patchElement(id, { fillRule: e.target.value as 'nonzero' | 'evenodd' }))}>
                <option value="nonzero">Non-zero</option>
                <option value="evenodd">Even-odd</option>
              </select>
            </Row>
          )}
        </Section>
      )}

      {has('stroke') && (
        <Section id="stroke" title="Stroke">
          <Row label="Color" el={el} props={['stroke']}><ColorField value={f.stroke} onChange={set('stroke')} /></Row>
          <Row label="Opacity" el={el} props={['strokeOpacity']}>
            <input type="range" min={0} max={1} step={0.01} value={f.strokeOpacity} onChange={(e) => setValue(ids, 'strokeOpacity', +e.target.value, 'so-slider')} />
            <NumberField suffix label="%" value={Math.round(f.strokeOpacity * 100)} min={0} max={100} onChange={(v, k) => setValue(ids, 'strokeOpacity', v / 100, k)} />
          </Row>
          <Row label="Width" el={el} props={['strokeWidth']}>
            <NumberField suffix label="px" value={r2(f.strokeWidth)} min={0} step={0.5} onChange={set('strokeWidth')} />
            <span />
          </Row>
          <Row label="Ends">
            <div className="seg-btns">
              {(['butt', 'round', 'square'] as const).map((c) => (
                <button key={c} title={c} className={(el.lineCap ?? 'butt') === c ? 'on' : ''} onClick={() => ids.forEach((id) => patchElement(id, { lineCap: c }))}>
                  <Icon name={'cap' + c[0].toUpperCase() + c.slice(1)} size={14} />
                </button>
              ))}
            </div>
            <div className="seg-btns">
              {(['miter', 'round', 'bevel'] as const).map((j) => (
                <button key={j} title={j} className={(el.lineJoin ?? 'miter') === j ? 'on' : ''} onClick={() => ids.forEach((id) => patchElement(id, { lineJoin: j }))}>
                  <Icon name={'join' + j[0].toUpperCase() + j.slice(1)} size={14} />
                </button>
              ))}
            </div>
          </Row>
          <Row label="Dashes" el={el} props={['dashArray']}>
            <DashInput value={f.dashArray} onChange={(v) => setValue(ids, 'dashArray', v, 'dash')} />
          </Row>
          <Row label="Offset" el={el} props={['dashOffset']}>
            <NumberField suffix label="px" value={r2(f.dashOffset)} onChange={set('dashOffset')} />
            <span />
          </Row>
          {el.type === 'path' && (
            <>
              <Row label="Length">
                <span className="readout">{r2(len)}</span>
                <button className="pbtn sm" title="Set the dashes and offset to the path length (a hidden stroke, ready to be drawn)" onClick={() => setValues([
                  [el.id, 'dashArray', `${r2(len)} ${r2(len)}`], [el.id, 'dashOffset', r2(len)],
                ])}>Set as offset</button>
              </Row>
              <Row label="Draw" el={el} props={['trim']}>
                <input type="range" min={0} max={100} step={1} value={f.trim} onChange={(e) => setValue(ids, 'trim', +e.target.value, 'trim-slider')} />
                <NumberField suffix label="%" value={r2(f.trim)} min={0} max={100} onChange={set('trim')} />
              </Row>
            </>
          )}
        </Section>
      )}

      <Section id="filters" title="Filters" right={
        <select className="add-filter" value="" title="Add filter" onChange={(e) => {
          if (e.target.value === 'blur') setValue(ids, 'blur', 4);
          if (e.target.value === 'shadow') setValues(ids.flatMap((id) => [[id, 'shadowColor', 'rgba(0,0,0,0.35)'], [id, 'shadowY', 6], [id, 'shadowBlur', 6]] as Change[]));
        }}>
          <option value="">+</option>
          <option value="blur">Blur</option>
          <option value="shadow">Drop shadow</option>
        </select>
      }>
        {!showBlur && !showShadow && <p className="muted small note">No filters. Use <b>+</b> to add a blur or a drop shadow; animate them with the Filters animator (Shift+L).</p>}
        {showBlur && (
          <Row label="Blur" el={el} props={['blur']}>
            <NumberField suffix label="px" value={r2(f.blur)} min={0} step={0.5} onChange={set('blur')} />
            <button className="mini" title="Remove blur" onClick={() => { setValue(ids, 'blur', 0); }}><Icon name="close" /></button>
          </Row>
        )}
        {showShadow && (
          <>
            <Row label="Shadow" el={el} props={['shadowColor']}>
              <ColorField value={f.shadowColor} onChange={set('shadowColor')} allowNone={false} />
              <button className="mini" title="Remove shadow" onClick={() => setValue(ids, 'shadowColor', 'none')}><Icon name="close" /></button>
            </Row>
            <Row label="Offset" el={el} props={['shadowX', 'shadowY']}>
              <NumberField suffix label="x" value={r2(f.shadowX)} onChange={set('shadowX')} />
              <NumberField suffix label="y" value={r2(f.shadowY)} onChange={set('shadowY')} />
            </Row>
            <Row label="Spread" el={el} props={['shadowBlur']}>
              <NumberField suffix label="px" value={r2(f.shadowBlur)} min={0} step={0.5} onChange={set('shadowBlur')} />
              <span />
            </Row>
          </>
        )}
      </Section>

      {!multi && el.type === 'path' && (
        <Section id="morph" title="Morph">
          <Row label="Into">
            <select value="" onChange={(e) => e.target.value && morphTo(el.id, e.target.value)}>
              <option value="">Choose a shape…</option>
              {morphSources.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Row>
          <p className="muted small note">Move the playhead first: the chosen shape becomes a Morph keyframe. You can also edit nodes (A) at a new time.</p>
        </Section>
      )}

      <Section id="presets" title="Quick animations">
        <div className="preset-grid">
          {PRESETS.filter((p) => p.id !== 'draw' || els.some((e) => e.type === 'path')).map((p) => (
            <button key={p.id} className="preset" onClick={() => applyPreset(p.id)} title={p.hint}>
              <b>{p.label}</b>
              <span>{p.hint}</span>
            </button>
          ))}
        </div>
        <p className="muted small note">Added at the playhead ({time.toFixed(2)}s).</p>
      </Section>

      <div className="pbuttons end">
        <button className="pbtn danger" onClick={deleteSelection}><Icon name="trash" size={14} /> Delete</button>
      </div>
    </>
  );
}

function DashInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="pinput"
      placeholder="e.g. 10 5"
      value={text ?? value}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        if (text !== null) onChange(e.target.value.replace(/;/g, ' ').trim());
        setText(null);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function KeyframeSection() {
  const selectedKfs = useStore((s) => s.selectedKfs);
  useStore((s) => s.doc);
  const kfs = selectedKfs.map(findKeyframe).filter(Boolean);
  if (!kfs.length) return null;
  const first = kfs[0]!;
  const ref = selectedKfs[0];
  const meta = PROP_META[ref.prop];
  const mixed = kfs.some((k) => k!.easing !== first.easing);
  return (
    <Section id="keyframe" title={kfs.length === 1 ? `Keyframe · ${meta.label}` : `${kfs.length} keyframes`}>
      {kfs.length === 1 && (
        <Row label="Time">
          <NumberField suffix label="s" value={first.time} step={0.01} min={0} onChange={(t, k) => { setKeyframeTimes([{ ref, time: t }], k); setTime(t); }} />
          {meta.kind === 'number' ? (
            <NumberField suffix label="val" value={r2(Number(first.value))} step={meta.step} onChange={(v, k) => setKeyframeValue(ref, v, k)} />
          ) : meta.kind === 'color' ? <ColorField value={String(first.value)} onChange={(v, k) => setKeyframeValue(ref, v, k)} /> : <span />}
        </Row>
      )}
      <div className="field-label">Easing to the next keyframe {mixed && <span className="muted">(mixed)</span>}</div>
      <EasingEditor value={first.easing} onChange={(id) => setKeyframeEasing(selectedKfs, id)} />
      <div className="pbuttons">
        <button className="pbtn sm" onClick={copyKeyframes}>Copy</button>
        <button className="pbtn sm" onClick={pasteKeyframes}>Paste</button>
        <button className="pbtn sm" onClick={() => reverseKeyframes()}>Reverse</button>
        <button className="pbtn sm danger" onClick={() => removeKeyframes(selectedKfs)}>Delete</button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Comments

function Comments() {
  const comments = useStore((s) => s.doc.comments);
  const time = useStore((s) => s.time);
  const doc = useStore((s) => s.doc);
  const [text, setText] = useState('');
  const [atTime, setAtTime] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const list = [...comments].filter((c) => showResolved || !c.resolved).sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9) || a.created - b.created);
  const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  const submit = () => {
    if (!text.trim()) return;
    addComment(text.trim(), atTime);
    setText('');
  };
  return (
    <div className="comments">
      <div className="comment-new">
        <textarea placeholder="Leave a note for this project…" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }} />
        <div className="comment-actions">
          <label className="check-row"><input type="checkbox" checked={atTime} onChange={(e) => setAtTime(e.target.checked)} /> at {fmt(time)}</label>
          <button className="btn sm primary" onClick={submit} disabled={!text.trim()}>Comment</button>
        </div>
      </div>
      <label className="check-row resolved-toggle"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved</label>
      {!list.length && <p className="muted small note">No comments yet. Comments are saved with the project file, so collaborators see them when you share it.</p>}
      {list.map((c) => {
        const target = c.elId ? findEl(doc, c.elId) : undefined;
        return (
          <div key={c.id} className={`comment ${c.resolved ? 'resolved' : ''}`}>
            <div className="comment-meta">
              {c.time !== null && <button className="chip" onClick={() => setTime(c.time!)} title="Jump to this time">{fmt(c.time)}</button>}
              {target && <button className="chip" onClick={() => setState({ selection: [target.id], selectedKfs: [] })}>{target.name}</button>}
              <span className="grow" />
              <span className="muted small">{new Date(c.created).toLocaleDateString()}</span>
            </div>
            <p>{c.text}</p>
            <div className="comment-actions">
              <button className="link-btn" onClick={() => patchComment(c.id, { resolved: !c.resolved })}>{c.resolved ? 'Reopen' : 'Resolve'}</button>
              <button className="link-btn danger" onClick={() => deleteComment(c.id)}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
