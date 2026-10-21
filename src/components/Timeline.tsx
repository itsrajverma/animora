import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, getState, setState, setView } from '../state/store';
import { findEl, patchDoc, patchElement, removeKeyframes, select, setKeyframeEasing, setTime } from '../state/actions';
import {
  addAnimator, copyKeyframes, duplicateKeyframes, pasteKeyframes, removeAnimator, reverseKeyframes, selectAnimatorKeys, shiftKeyframes,
  toggleAnimatorKey,
} from '../state/animate';
import { animatorsFor, animatorProps, isAnimatorActive, type Animator } from '../model/props';
import type { KfRef, PropKey, SvgEl } from '../model/types';
import { flatten } from '../model/tree';
import { uid } from '../model/factory';
import { getEasing } from '../engine/easing';
import { EasingEditor } from './EasingEditor';
import { TYPE_ICON } from './LeftPanel';
import { useDropdown } from './TopBar';
import { Icon } from './Icon';

export const TL_LEFT = 300;
/** Room before 0s so keyframes at the very start aren't hidden under the layer column. */
const PAD = 14;
const kfKey = (r: KfRef) => `${r.elId}|${r.prop}|${r.kfId}`;
const EPS = 1e-3;

export const fmtTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

/** Fixed position for a popup opening upward from a button (the timeline scroller would clip it). */
function popAbove(el: HTMLElement | null): React.CSSProperties {
  const r = el?.getBoundingClientRect();
  if (!r) return {};
  return { position: 'fixed', left: r.left, bottom: window.innerHeight - r.top + 6, top: 'auto', maxHeight: r.top - 60 };
}

export function togglePlay() {
  const s = getState();
  if (!s.playing && s.time >= s.doc.duration - 1e-3) setState({ time: 0 });
  setState({ playing: !s.playing });
}

type KfGroup = { t: number; refs: KfRef[] };

/** Keyframes of several properties merged by time (one diamond per time). */
function groupByTime(el: SvgEl, props: PropKey[]): KfGroup[] {
  const m = new Map<number, KfRef[]>();
  for (const p of props) {
    for (const k of el.tracks[p] ?? []) {
      const t = Math.round(k.time * 1000) / 1000;
      const key = [...m.keys()].find((x) => Math.abs(x - t) < EPS) ?? t;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push({ elId: el.id, prop: p, kfId: k.id });
    }
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, refs]) => ({ t, refs }));
}

export function Timeline() {
  const doc = useStore((s) => s.doc);
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const selection = useStore((s) => s.selection);
  const selectedKfs = useStore((s) => s.selectedKfs);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const pps = useStore((s) => s.view.pps);
  const loopPreview = useStore((s) => s.loopPreview);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(800);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const refMap = useRef(new Map<string, KfRef[]>());
  refMap.current = new Map();

  const selKeys = new Set(selectedKfs.map(kfKey));
  const span = Math.max(doc.duration + 2, (viewW - TL_LEFT - PAD) / pps);
  const width = span * pps + PAD * 2;

  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bring the selected element's row into view.
  const selKey = selection.join(',');
  useEffect(() => {
    if (!selection.length) return;
    const row = innerRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(selection[0])}"]`);
    const sc = scrollRef.current;
    if (!row || !sc) return;
    const top = row.offsetTop - 52;
    if (top < sc.scrollTop || top + 30 > sc.scrollTop + sc.clientHeight - 52) sc.scrollTop = Math.max(0, top - 8);
  }, [selKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the playhead visible during playback.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !playing) return;
    const x = TL_LEFT + PAD + time * pps;
    if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft + TL_LEFT) sc.scrollLeft = x - TL_LEFT - 40;
  }, [time, playing, pps]);

  const timeFromClient = (clientX: number, clamp = true) => {
    const r = innerRef.current!.getBoundingClientRect();
    const t = (clientX - r.left - TL_LEFT - PAD) / pps;
    return clamp ? Math.max(0, Math.min(getState().doc.duration, t)) : Math.max(0, t);
  };

  const snap = (t: number, shift: boolean) => {
    const step = shift ? 0.1 : 0.01;
    let v = Math.round(t / step) * step;
    if (Math.abs(t - getState().time) * pps < 6) v = getState().time;
    return Math.round(v * 1000) / 1000;
  };

  const drag = (move: (ev: PointerEvent) => void, up?: (ev: PointerEvent) => void) => {
    const m = (ev: PointerEvent) => move(ev);
    const u = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', m);
      window.removeEventListener('pointerup', u);
      up?.(ev);
    };
    window.addEventListener('pointermove', m);
    window.addEventListener('pointerup', u);
  };

  const startScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setState({ playing: false });
    setTime(snap(timeFromClient(e.clientX), e.shiftKey));
    drag((ev) => setTime(snap(timeFromClient(ev.clientX), ev.shiftKey)));
  };

  const startEndDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const key = 'g:' + uid();
    drag((ev) => {
      const t = Math.max(0.1, Math.round(timeFromClient(ev.clientX, false) * 10) / 10);
      patchDoc({ duration: t }, key);
      if (getState().time > t) setTime(t);
    });
  };

  /** Click on empty track: move the playhead; drag: box-select keyframes. */
  const startTrackPress = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const r = innerRef.current!.getBoundingClientRect();
    const x0 = e.clientX - r.left, y0 = e.clientY - r.top;
    let moved = false;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    drag(
      (ev) => {
        const x1 = ev.clientX - r.left, y1 = ev.clientY - r.top;
        if (!moved && Math.hypot(x1 - x0, y1 - y0) < 4) return;
        moved = true;
        setMarquee({ x0, y0, x1, y1 });
      },
      (ev) => {
        setMarquee(null);
        if (!moved) {
          setState({ playing: false, selectedKfs: additive ? getState().selectedKfs : [] });
          setTime(snap(timeFromClient(ev.clientX), ev.shiftKey));
          return;
        }
        const box = { l: Math.min(x0, ev.clientX - r.left), r: Math.max(x0, ev.clientX - r.left), t: Math.min(y0, ev.clientY - r.top), b: Math.max(y0, ev.clientY - r.top) };
        const hits: KfRef[] = [];
        innerRef.current!.querySelectorAll<HTMLElement>('.kf[data-k]').forEach((n) => {
          if (n.classList.contains('summary')) return;
          const b = n.getBoundingClientRect();
          const cx = b.left + b.width / 2 - r.left, cy = b.top + b.height / 2 - r.top;
          if (cx >= box.l && cx <= box.r && cy >= box.t && cy <= box.b) hits.push(...(refMap.current.get(n.dataset.k!) ?? []));
        });
        const base = additive ? getState().selectedKfs : [];
        const seen = new Set(base.map(kfKey));
        setState({ selectedKfs: [...base, ...hits.filter((h) => !seen.has(kfKey(h)))] });
      },
    );
  };

  const findTime = (ref: KfRef) => findEl(getState().doc, ref.elId)?.tracks[ref.prop]?.find((k) => k.id === ref.kfId)?.time ?? 0;

  /** Drag keyframes (and/or a segment) in time. */
  const startKfDrag = (e: React.PointerEvent, refs: KfRef[], jump = true) => {
    e.stopPropagation();
    if (e.button === 2) {
      if (!refs.every((r) => selKeys.has(kfKey(r)))) setState({ selectedKfs: refs });
      return;
    }
    if (e.button !== 0) return;
    const s = getState();
    const already = refs.every((r) => selKeys.has(kfKey(r)));
    let sel = s.selectedKfs;
    if (e.shiftKey || e.ctrlKey || e.metaKey) sel = already ? sel.filter((r) => !refs.some((x) => kfKey(x) === kfKey(r))) : [...sel, ...refs];
    else if (!already) sel = refs;
    setState({ selectedKfs: sel, playing: false, selection: s.selection.includes(refs[0].elId) ? s.selection : [refs[0].elId] });
    const starts = sel.map(findTime);
    const anchorT = findTime(refs[0]);
    const x0 = e.clientX;
    const key = 'g:' + uid();
    let moved = false;
    drag(
      (ev) => {
        const dx = ev.clientX - x0;
        if (!moved && Math.abs(dx) < 3) return;
        moved = true;
        const dt = Math.max(-Math.min(...starts), snap(anchorT + dx / pps, ev.shiftKey) - anchorT);
        shiftKeyframes(sel, starts, dt, key);
      },
      () => {
        if (!moved && !(e.shiftKey || e.ctrlKey || e.metaKey)) {
          setState({ selectedKfs: refs });
          if (jump) setTime(anchorT);
        }
      },
    );
  };

  // Rows: animated elements plus the selection, in layer order (top first).
  const all = flatten(doc.elements).reverse();
  const rows = all.filter((el) => selection.includes(el.id) || Object.values(el.tracks).some((t) => t?.length));

  const diamond = (k: string, refs: KfRef[], left: number, cls = '', title = '') => {
    refMap.current.set(k, refs);
    const sel = refs.length > 0 && refs.every((r) => selKeys.has(kfKey(r)));
    return (
      <div
        key={k}
        data-k={k}
        className={`kf ${cls} ${sel ? 'selected' : ''}`}
        style={{ left }}
        title={title}
        onPointerDown={(e) => startKfDrag(e, refs)}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      />
    );
  };

  return (
    <div className="timeline">
      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-inner" ref={innerRef} style={{ width: TL_LEFT + width }}>
          <div className="tl-row tl-head">
            <div className="tl-name tl-transport">
              <button className="tl-ic" title="Back to start (Home)" onClick={() => { setTime(0); setState({ playing: false }); }}><Icon name="first" size={15} /></button>
              <button className="tl-ic play" title="Play / Pause (Space)" onClick={() => togglePlay()}><Icon name={playing ? 'pause' : 'play'} size={18} /></button>
              <TimeInput time={time} />
              <EaseButton />
              <AnimateButton />
            </div>
            <div className="tl-track tl-ruler" style={{ width }} onPointerDown={startScrub}>
              <div className="tl-span" style={{ left: PAD, width: doc.duration * pps }} />
              <Ruler span={span} pps={pps} />
              <div className="tl-end-marker" style={{ left: PAD + doc.duration * pps }} onPointerDown={startEndDrag} title={`Animation length ${doc.duration}s — drag to change`}>
                <span>{doc.duration}s</span>
              </div>
              <div className="tl-head-marker" style={{ left: PAD + time * pps }} />
            </div>
          </div>

          {rows.length === 0 && <EmptyHint />}

          {rows.map((el) => {
            const isOpen = !collapsed[el.id];
            const animators = animatorsFor(el).filter((a) => isAnimatorActive(a, el));
            const animatedProps = animators.flatMap((a) => animatorProps(a, el));
            const isSel = selection.includes(el.id);
            const summary = groupByTime(el, animatedProps);
            return (
              <div key={el.id} className="tl-group" data-row={el.id}>
                <div className={`tl-row el-row ${isSel ? 'selected' : ''}`}>
                  <div
                    className="tl-name"
                    onClick={(e) => {
                      const s = getState().selection;
                      select(e.shiftKey ? (s.includes(el.id) ? s.filter((i) => i !== el.id) : [...s, el.id]) : [el.id]);
                    }}
                  >
                    <button
                      className={`caret ${isOpen ? 'open' : ''} ${animators.length ? '' : 'invisible'}`}
                      onClick={(e) => { e.stopPropagation(); setCollapsed({ ...collapsed, [el.id]: isOpen }); }}
                    >
                      <Icon name="caret" />
                    </button>
                    <span className="type-icon"><Icon name={TYPE_ICON[el.type]} size={14} /></span>
                    <span className="layer-name">{el.name}</span>
                    <button className={`mini ${el.visible ? '' : 'off'}`} title={el.visible ? 'Hide element' : 'Show element'}
                      onClick={(e) => { e.stopPropagation(); patchElement(el.id, { visible: !el.visible }); }}>
                      <Icon name={el.visible ? 'eye' : 'eyeOff'} />
                    </button>
                  </div>
                  <div className="tl-track" style={{ width }} onPointerDown={startTrackPress}>
                    {!isOpen && summary.map((g) => diamond(`s|${el.id}|${g.t}`, g.refs, PAD + g.t * pps, 'summary', `${g.t.toFixed(2)}s`))}
                  </div>
                </div>
                {isOpen && animators.map((a) => animatorRow(el, a))}
              </div>
            );
          })}

          <div className="tl-playhead" style={{ left: TL_LEFT + PAD + time * pps }} />
          {marquee && (
            <div className="tl-marquee" style={{
              left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
            }} />
          )}
        </div>
      </div>

      <div className="tl-bottom">
        <button className={`tl-ic ${loopPreview ? 'on' : ''}`} title={loopPreview ? 'Loop preview: on' : 'Loop preview: off'} onClick={() => setState({ loopPreview: !loopPreview })}>
          <Icon name="loop" size={16} />
        </button>
        <div className="tl-zoom">
          <button onClick={() => setView({ pps: Math.max(20, Math.round(pps / 1.25)) })} title="Zoom out timeline">−</button>
          <input type="range" min={20} max={600} value={pps} onChange={(e) => setView({ pps: +e.target.value })} title="Timeline zoom" />
          <button onClick={() => setView({ pps: Math.min(600, Math.round(pps * 1.25)) })} title="Zoom in timeline">+</button>
        </div>
        <span className="grow" />
        <span className="muted small tl-hint">Drag on tracks to select keyframes · Shift-drag to snap to 0.1s · right-click a keyframe for more</span>
        <button className="help-btn" onClick={() => window.dispatchEvent(new CustomEvent('animora:help'))}><Icon name="getHelp" size={16} /> Get help</button>
      </div>

      {menu && <KfMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );

  function animatorRow(el: SvgEl, a: Animator) {
    const props = animatorProps(a, el).filter((p) => el.tracks[p]?.length);
    const groups = groupByTime(el, props);
    const prev = [...groups].reverse().find((g) => g.t < time - EPS);
    const next = groups.find((g) => g.t > time + EPS);
    const here = groups.some((g) => Math.abs(g.t - time) < EPS);
    return (
      <div key={a.id} className="tl-row prop-row">
        <div className="tl-name prop-name" onClick={(e) => selectAnimatorKeys(el.id, props, e.shiftKey)} title="Click to select all its keyframes">
          <span className="prop-label">{a.label}</span>
          <span className="row-actions">
            <button className="mini" disabled={!prev} title="Previous keyframe" onClick={(e) => { e.stopPropagation(); prev && setTime(prev.t); }}><Icon name="prev" /></button>
            <button className={`mini kf-toggle ${here ? 'on' : ''}`} title={here ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
              onClick={(e) => { e.stopPropagation(); toggleAnimatorKey(el.id, props); }}>
              <Icon name="diamond" />
            </button>
            <button className="mini" disabled={!next} title="Next keyframe" onClick={(e) => { e.stopPropagation(); next && setTime(next.t); }}><Icon name="next" /></button>
            <button className="mini" title="Remove animator (keeps the current value)" onClick={(e) => { e.stopPropagation(); removeAnimator(el.id, props); }}><Icon name="close" /></button>
          </span>
        </div>
        <div className="tl-track" style={{ width }} onPointerDown={startTrackPress}>
          {groups.map((g, i) => {
            const n = groups[i + 1];
            if (!n) return null;
            const ease = el.tracks[g.refs[0].prop]?.find((k) => k.id === g.refs[0].kfId)?.easing ?? 'linear';
            const e = getEasing(ease);
            const segSel = [...g.refs, ...n.refs].every((r) => selKeys.has(kfKey(r)));
            return (
              <div
                key={'s' + g.t}
                className={`seg ${e.id === 'hold' || e.steps ? 'hold' : ''} ${segSel ? 'selected' : ''}`}
                style={{ left: PAD + g.t * pps, width: Math.max(0, (n.t - g.t) * pps) }}
                title={`${e.label} — drag to move both keyframes`}
                onPointerDown={(ev) => startKfDrag(ev, [...g.refs, ...n.refs], false)}
                onContextMenu={(ev) => { ev.preventDefault(); setMenu({ x: ev.clientX, y: ev.clientY }); }}
              />
            );
          })}
          {groups.map((g) => {
            const k = el.tracks[g.refs[0].prop]?.find((x) => x.id === g.refs[0].kfId);
            const e = k ? getEasing(k.easing) : undefined;
            return diamond(`${el.id}|${a.id}|${g.t}`, g.refs, PAD + g.t * pps, e?.id === 'hold' || e?.steps ? 'hold' : '', `${g.t.toFixed(2)}s · ${e?.label ?? ''}`);
          })}
        </div>
      </div>
    );
  }
}

function TimeInput({ time }: { time: number }) {
  const [text, setText] = useState<string | null>(null);
  const parse = (s: string) => {
    const m = /^(?:(\d+):)?(\d+(?:\.\d*)?)$/.exec(s.trim());
    return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN;
  };
  return (
    <input
      className="tl-time"
      value={text ?? fmtTime(time)}
      onFocus={(e) => { setText(fmtTime(time)); setTimeout(() => e.target.select()); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = parse(text ?? '');
        if (Number.isFinite(t)) setTime(t);
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setText(null); (e.target as HTMLInputElement).blur(); }
      }}
      title="Current time (click to type)"
    />
  );
}

function EaseButton() {
  const selectedKfs = useStore((s) => s.selectedKfs);
  const doc = useStore((s) => s.doc);
  const dd = useDropdown();
  const first = selectedKfs[0] && findEl(doc, selectedKfs[0].elId)?.tracks[selectedKfs[0].prop]?.find((k) => k.id === selectedKfs[0].kfId);
  return (
    <div className="tool-group" ref={dd.ref}>
      <button className="tl-ic" disabled={!first} onClick={() => dd.setOpen(!dd.open)} title={first ? 'Easing of the selected keyframes' : 'Select keyframes to change their easing'}>
        <Icon name="ease" size={16} />
      </button>
      {dd.open && first && (
        <div className="menu-pop ease-pop" style={popAbove(dd.ref.current)}>
          <div className="field-label">Easing ({selectedKfs.length} keyframe{selectedKfs.length > 1 ? 's' : ''})</div>
          <EasingEditor value={first.easing} onChange={(id) => setKeyframeEasing(getState().selectedKfs, id)} />
        </div>
      )}
    </div>
  );
}

function AnimateButton() {
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const dd = useDropdown();
  const el = selection.length ? findEl(doc, selection[0]) : undefined;
  const list = el ? animatorsFor(el) : [];
  return (
    <div className="tool-group" ref={dd.ref}>
      <button className="animate-btn" disabled={!el} onClick={() => dd.setOpen(!dd.open)} title={el ? 'Add animator' : 'Select an element first'}>
        Animate
      </button>
      {dd.open && el && (
        <div className="menu-pop animators-pop" style={popAbove(dd.ref.current)}>
          {list.map((a, i) => (
            <div key={a.id}>
              {a.sep && i > 0 && <div className="menu-sep" />}
              <button className="menu-item" onClick={() => { addAnimator(a.id); dd.setOpen(false); }}>
                <span className="mi-icon">{isAnimatorActive(a, el) && <Icon name="check" size={14} />}</span>
                <span className="mi-label">{a.label}</span>
                {a.key && <kbd>⇧ {a.key}</kbd>}
              </button>
            </div>
          ))}
          {!el.motionPath && (
            <>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { dd.setOpen(false); window.dispatchEvent(new CustomEvent('animora:motionpath', { detail: el.id })); }}>
                <span className="mi-icon"><Icon name="motion" size={14} /></span>
                <span className="mi-label">Motion path…</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function KfMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);
  useEffect(() => {
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, [onClose]);
  const s = getState();
  const item = (label: string, run: () => void, enabled = true, kbd?: string, danger = false) => (
    <button className={`menu-item ${danger ? 'danger' : ''}`} disabled={!enabled} onClick={() => { onClose(); run(); }}>
      <span className="mi-icon" />
      <span className="mi-label">{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  );
  const has = s.selectedKfs.length > 0;
  return (
    <div ref={ref} className="menu-pop context" style={{ left: pos.x, top: pos.y }}>
      {item('Copy', copyKeyframes, has, 'Ctrl+C')}
      {item('Paste at playhead', pasteKeyframes, s.kfClipboard.length > 0 && s.selection.length > 0, 'Ctrl+V')}
      {item('Duplicate at playhead', duplicateKeyframes, has, 'Ctrl+D')}
      {item('Reverse keyframes', () => reverseKeyframes(), has)}
      <div className="menu-sep" />
      {(['linear', 'easeInOut', 'easeOutBack', 'hold'] as const).map((id) => item(`Easing: ${getEasing(id).label}`, () => setKeyframeEasing(getState().selectedKfs, id), has))}
      <div className="menu-sep" />
      {item('Delete', () => removeKeyframes(getState().selectedKfs), has, 'Del', true)}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="tl-empty">
      <svg width="190" height="96" viewBox="0 0 190 96" aria-hidden>
        <defs>
          <linearGradient id="tlg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4fc3f7" /><stop offset="1" stopColor="#7c4dff" /></linearGradient>
        </defs>
        <rect x="10" y="50" width="30" height="30" rx="7" fill="url(#tlg1)" />
        <rect x="64" y="40" width="44" height="44" rx="3" fill="none" stroke="#3b82f6" strokeWidth="1.5" />
        <path d="M86 75 C70 64 70 52 78 50 C82 49 86 52 86 55 C86 52 90 49 94 50 C102 52 102 64 86 75 Z" fill="#fff" />
        <rect x="128" y="50" width="34" height="24" rx="7" fill="#b388ff" />
        <path d="M112 34 C130 30 140 20 146 6" fill="none" stroke="#4dd0e1" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d="M142 8 L147 4 L149 10" fill="none" stroke="#4dd0e1" strokeWidth="1.5" />
      </svg>
      <span>Select an element, then click <b>Animate</b></span>
    </div>
  );
}

function Ruler({ span, pps }: { span: number; pps: number }) {
  const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30];
  const major = steps.find((s) => s * pps >= 90) ?? 30;
  const minor = major / 10;
  const ticks: JSX.Element[] = [];
  const count = Math.floor(span / minor + 1e-6);
  for (let i = 0; i <= count; i++) {
    const t = i * minor;
    const isMajor = i % 10 === 0;
    const isMid = i % 5 === 0;
    ticks.push(
      <div key={i} className={`tick ${isMajor ? 'major' : isMid ? 'mid' : ''}`} style={{ left: PAD + t * pps }}>
        {isMajor && <span>{Number(t.toFixed(2))}s</span>}
      </div>,
    );
  }
  return <>{ticks}</>;
}
