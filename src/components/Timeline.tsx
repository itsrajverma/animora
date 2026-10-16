import { useEffect, useRef, useState } from 'react';
import { useStore, getState, setState } from '../state/store';
import {
  addKeyframe, findEl, keyframeAt, patchDoc, removeTrack, select, setKeyframeTimes, setTime, toggleKeyframe,
} from '../state/actions';
import { moveLayer } from '../state/structure';
import { TYPE_ICON } from './Sidebar';
import { PROP_META, PROPS_BY_TYPE } from '../model/props';
import type { KfRef, PropKey, SvgEl } from '../model/types';
import { uid } from '../model/factory';
import { Icon } from './Icon';

const LEFT = 230;
/** Room before 0s so keyframes at the very start aren't hidden under the layer column. */
const PAD = 12;
const kfKey = (r: KfRef) => `${r.elId}|${r.prop}|${r.kfId}`;

export function Timeline() {
  const doc = useStore((s) => s.doc);
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const selection = useStore((s) => s.selection);
  const selectedKfs = useStore((s) => s.selectedKfs);
  const expanded = useStore((s) => s.expanded);
  const recordMode = useStore((s) => s.recordMode);
  const [pps, setPps] = useState(160);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const selKeys = new Set(selectedKfs.map(kfKey));
  const width = doc.duration * pps + PAD * 2;

  // Keep the playhead visible during playback.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !playing) return;
    const x = LEFT + PAD + time * pps;
    if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft + LEFT) sc.scrollLeft = x - LEFT - 40;
  }, [time, playing, pps]);

  const timeFromClient = (clientX: number) => {
    const r = innerRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(doc.duration, (clientX - r.left - LEFT - PAD) / pps));
  };

  const snap = (t: number, shift: boolean) => {
    const step = shift ? 0.1 : 0.01;
    let v = Math.round(t / step) * step;
    if (Math.abs(t - getState().time) * pps < 6) v = getState().time;
    return Math.round(v * 1000) / 1000;
  };

  const startScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setState({ playing: false, selectedKfs: e.shiftKey ? getState().selectedKfs : [] });
    setTime(snap(timeFromClient(e.clientX), e.shiftKey));
    const move = (ev: PointerEvent) => setTime(snap(timeFromClient(ev.clientX), ev.shiftKey));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startKfDrag = (e: React.PointerEvent, refs: KfRef[]) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const s = getState();
    const already = refs.every((r) => selKeys.has(kfKey(r)));
    let sel = s.selectedKfs;
    if (e.shiftKey) sel = already ? sel.filter((r) => !refs.some((x) => kfKey(x) === kfKey(r))) : [...sel, ...refs];
    else if (!already) sel = refs;
    setState({ selectedKfs: sel, playing: false, selection: s.selection.includes(refs[0].elId) ? s.selection : [refs[0].elId] });

    const starts = sel.map((ref) => ({ ref, t0: findTime(ref) }));
    const anchorT = findTime(refs[0]);
    const x0 = e.clientX;
    const key = 'g:' + uid();
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      const dt = snap(anchorT + dx / pps, ev.shiftKey) - anchorT;
      setKeyframeTimes(starts.map(({ ref, t0 }) => ({ ref, time: Math.round((t0 + dt) * 1000) / 1000 })), key);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved && !e.shiftKey) {
        setState({ selectedKfs: refs });
        setTime(anchorT);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const rows: { el: SvgEl; depth: number }[] = [];
  const addRows = (list: SvgEl[], depth: number) => {
    for (const el of [...list].reverse()) {
      rows.push({ el, depth });
      if (el.type === 'group' && expanded[el.id]) addRows(el.children ?? [], depth + 1);
    }
  };
  addRows(doc.elements, 0);

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <div className="tl-transport">
          <button className="icon-btn" title="Go to start (Home)" onClick={() => setTime(0)}><Icon name="first" /></button>
          <button className="icon-btn play" title="Play / Pause (Space)" onClick={() => togglePlay()}>
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button className="icon-btn" title="Go to end (End)" onClick={() => setTime(doc.duration)}><Icon name="last" /></button>
          <span className="tl-time">{time.toFixed(2)}s <span className="muted">/ {doc.duration.toFixed(2)}s</span></span>
        </div>
        <button
          className={`record-btn ${recordMode ? 'on' : ''}`}
          title="Animate mode: when on, changing a property at the playhead creates keyframes. Already-animated properties always get keyframes."
          onClick={() => setState({ recordMode: !recordMode })}
        >
          <span className="dot" /> {recordMode ? 'Animate mode on' : 'Animate mode off'}
        </button>
        <div className="tl-right">
          <label className="tl-field" title="Animation length in seconds">
            Duration
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={doc.duration}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (v > 0) patchDoc({ duration: Math.round(v * 100) / 100 }, 'duration');
              }}
            />
            s
          </label>
          <label className="tl-field check" title="Loop the animation forever">
            <input type="checkbox" checked={doc.loop} onChange={(e) => patchDoc({ loop: e.target.checked })} /> Loop
          </label>
          <label className="tl-field" title="Timeline zoom">
            <Icon name="zoom" />
            <input type="range" min={30} max={600} value={pps} onChange={(e) => setPps(+e.target.value)} />
          </label>
        </div>
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-inner" ref={innerRef} style={{ width: LEFT + width + 60 }}>
          <div className="tl-row tl-ruler-row">
            <div className="tl-name tl-ruler-label">Layers</div>
            <div className="tl-track tl-ruler" style={{ width }} onPointerDown={startScrub}>
              <Ruler duration={doc.duration} pps={pps} />
            </div>
          </div>

          {rows.length === 0 && (
            <div className="tl-empty">No layers yet — draw with the toolbar, add a shape, or import an SVG.</div>
          )}

          {rows.map(({ el, depth }) => {
            const isOpen = !!expanded[el.id];
            const animated = PROPS_BY_TYPE[el.type].filter((p) => (el.tracks[p]?.length ?? 0) > 0);
            const isSel = selection.includes(el.id);
            const summary = summaryTimes(el, animated);
            return (
              <div key={el.id} className="tl-group">
                <div
                  className={`tl-row el-row ${isSel ? 'selected' : ''} ${dragOver === el.id ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(el.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = e.dataTransfer.getData('text/animora-layer');
                    if (id && id !== el.id) moveLayer(id, el.id, 'above');
                  }}
                >
                  <div
                    className="tl-name"
                    style={{ paddingLeft: 4 + depth * 14 }}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/animora-layer', el.id)}
                    onClick={(e) => {
                      const s = getState().selection;
                      select(e.shiftKey ? (s.includes(el.id) ? s.filter((i) => i !== el.id) : [...s, el.id]) : [el.id]);
                    }}
                  >
                    <button
                      className={`caret ${isOpen ? 'open' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setState({ expanded: { ...expanded, [el.id]: !isOpen } }); }}
                      title={el.type === 'group' ? 'Show layers and animated properties' : 'Show animated properties'}
                    >
                      <Icon name="caret" />
                    </button>
                    <TypeIcon el={el} />
                    <span className="layer-name">{el.name}</span>
                    {!el.visible && <span className="muted small">hidden</span>}
                  </div>
                  <div className="tl-track" style={{ width }} onPointerDown={startScrub}>
                    {summary.map((t) => {
                      const refs = animated.flatMap((p) => el.tracks[p]!.filter((k) => Math.abs(k.time - t) < 1e-3).map((k) => ({ elId: el.id, prop: p, kfId: k.id })));
                      const sel = refs.length > 0 && refs.every((r) => selKeys.has(kfKey(r)));
                      return (
                        <div
                          key={t}
                          className={`kf summary ${sel ? 'selected' : ''}`}
                          style={{ left: PAD + t * pps }}
                          onPointerDown={(e) => startKfDrag(e, refs)}
                          title={`${t.toFixed(2)}s`}
                        />
                      );
                    })}
                  </div>
                </div>

                {isOpen &&
                  animated.map((p) => (
                    <PropRow key={p} el={el} prop={p} pps={pps} width={width} time={time} selKeys={selKeys} onScrub={startScrub} onKfDown={startKfDrag} />
                  ))}
                {isOpen && <AddTrackRow el={el} animated={animated} width={width} onScrub={startScrub} />}
              </div>
            );
          })}

          <div className="tl-playhead" style={{ left: LEFT + PAD + time * pps }}>
            <div className="tl-playhead-head" />
          </div>
          <div className="tl-end" style={{ left: LEFT + PAD + doc.duration * pps }} />
        </div>
      </div>
    </div>
  );

  function findTime(ref: KfRef) {
    return findEl(getState().doc, ref.elId)?.tracks[ref.prop]?.find((k) => k.id === ref.kfId)?.time ?? 0;
  }
}

export function togglePlay() {
  const s = getState();
  if (!s.playing && s.time >= s.doc.duration - 1e-3) setState({ time: 0 });
  setState({ playing: !s.playing });
}

function summaryTimes(el: SvgEl, props: PropKey[]) {
  const set = new Set<number>();
  for (const p of props) for (const k of el.tracks[p]!) set.add(Math.round(k.time * 1000) / 1000);
  return [...set].sort((a, b) => a - b);
}

function PropRow({
  el, prop, pps, width, time, selKeys, onScrub, onKfDown,
}: {
  el: SvgEl; prop: PropKey; pps: number; width: number; time: number; selKeys: Set<string>;
  onScrub: (e: React.PointerEvent) => void; onKfDown: (e: React.PointerEvent, refs: KfRef[]) => void;
}) {
  const tr = el.tracks[prop]!;
  const here = keyframeAt(el, prop, time);
  const prev = [...tr].reverse().find((k) => k.time < time - 1e-3);
  const next = tr.find((k) => k.time > time + 1e-3);
  return (
    <div className="tl-row prop-row">
      <div className="tl-name prop-name">
        <span className="prop-label">{PROP_META[prop].label}</span>
        <span className="row-actions always">
          <button className="mini" disabled={!prev} title="Previous keyframe" onClick={() => prev && setTime(prev.time)}><Icon name="prev" /></button>
          <button className={`mini kf-toggle ${here ? 'on' : ''}`} title={here ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'} onClick={() => toggleKeyframe(el.id, prop)}>
            <Icon name="diamond" />
          </button>
          <button className="mini" disabled={!next} title="Next keyframe" onClick={() => next && setTime(next.time)}><Icon name="next" /></button>
          <button className="mini" title="Remove animation (keeps current value)" onClick={() => removeTrack(el.id, prop)}><Icon name="close" /></button>
        </span>
      </div>
      <div className="tl-track" style={{ width }} onPointerDown={onScrub}>
        {tr.map((k, i) => {
          const n = tr[i + 1];
          return n ? (
            <div
              key={'s' + k.id}
              className={`seg ${k.easing === 'hold' ? 'hold' : ''}`}
              style={{ left: PAD + k.time * pps, width: Math.max(0, (n.time - k.time) * pps) }}
              title={k.easing}
            />
          ) : null;
        })}
        {tr.map((k) => {
          const ref = { elId: el.id, prop, kfId: k.id };
          return (
            <div
              key={k.id}
              className={`kf ${selKeys.has(kfKey(ref)) ? 'selected' : ''} ${k.easing === 'hold' ? 'hold' : ''}`}
              style={{ left: PAD + k.time * pps }}
              title={`${k.time.toFixed(2)}s · ${typeof k.value === 'number' ? Math.round(k.value * 100) / 100 : String(k.value).slice(0, 24)} · ${k.easing}`}
              onPointerDown={(e) => onKfDown(e, [ref])}
            />
          );
        })}
      </div>
    </div>
  );
}

function AddTrackRow({ el, animated, width, onScrub }: { el: SvgEl; animated: PropKey[]; width: number; onScrub: (e: React.PointerEvent) => void }) {
  const avail = PROPS_BY_TYPE[el.type].filter((p) => !animated.includes(p));
  if (!avail.length) return null;
  return (
    <div className="tl-row prop-row add-row">
      <div className="tl-name prop-name">
        <select
          className="add-track"
          value=""
          onChange={(e) => {
            if (e.target.value) addKeyframe(el.id, e.target.value as PropKey);
          }}
        >
          <option value="">+ Animate property…</option>
          {avail.map((p) => (
            <option key={p} value={p}>{PROP_META[p].label}</option>
          ))}
        </select>
      </div>
      <div className="tl-track" style={{ width }} onPointerDown={onScrub} />
    </div>
  );
}

function Ruler({ duration, pps }: { duration: number; pps: number }) {
  const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30];
  const major = steps.find((s) => s * pps >= 70) ?? 30;
  const minor = major / 5;
  const ticks: JSX.Element[] = [];
  const count = Math.floor(duration / minor + 1e-6);
  for (let i = 0; i <= count; i++) {
    const t = i * minor;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    ticks.push(
      <div key={i} className={`tick ${isMajor ? 'major' : ''}`} style={{ left: PAD + t * pps }}>
        {isMajor && <span>{Number(t.toFixed(2))}s</span>}
      </div>,
    );
  }
  return <>{ticks}</>;
}

function TypeIcon({ el }: { el: SvgEl }) {
  return <span className="type-icon"><Icon name={TYPE_ICON[el.type]} /></span>;
}
