import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, getState, setState, setView, AUTOSAVE_KEY, notify } from './state/store';
import {
  copySelection, deleteSelection, duplicateSelection, findEl, openProjectJson, paste, redo, select,
  selectAll, setTime, setTool, setValues, undo, type Change,
} from './state/actions';
import { groupSelection, mergeSelection, ungroupSelection } from './state/structure';
import { addAnimator, animatorForShortcut, copyKeyframes, duplicateKeyframes, pasteKeyframes } from './state/animate';
import { centerOrigin, startPickMotionPath } from './state/editing';
import { insertImage, insertSvg } from './state/insert';
import { frameAt } from './engine/interpolate';
import { readFileAsDataUrl } from './io/importSvg';
import { exportAnimatedSvg, saveProject } from './io/files';
import { TopBar, TOOLS } from './components/TopBar';
import { Canvas } from './components/Canvas';
import { canvasApi } from './components/canvasApi';
import { Timeline, togglePlay } from './components/Timeline';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { ContextMenu } from './components/ContextMenu';
import { ExportDialog, HelpDialog, WelcomeDialog } from './components/Dialogs';
import { Icon } from './components/Icon';

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

export default function App() {
  const [dialog, setDialog] = useState<'export' | 'help' | null>(null);
  const [tlHeight, setTlHeight] = useState(250);
  const [dropping, setDropping] = useState(false);
  const openRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const playing = useStore((s) => s.playing);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const showWelcome = useStore((s) => s.showWelcome);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const help = () => setDialog('help');
    const motion = (e: Event) => startPickMotionPath((e as CustomEvent<string>).detail);
    window.addEventListener('animora:help', help);
    window.addEventListener('animora:motionpath', motion);
    return () => {
      window.removeEventListener('animora:help', help);
      window.removeEventListener('animora:motionpath', motion);
    };
  }, []);

  // ---- playback --------------------------------------------------------------
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = getState();
      const D = s.doc.duration;
      let t = s.time + (now - last) / 1000;
      last = now;
      if (t >= D) {
        if (s.loopPreview) t = t % D;
        else {
          setState({ time: D, playing: false });
          return;
        }
      }
      setState({ time: t });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // ---- autosave --------------------------------------------------------------
  useEffect(() => {
    let timer = 0;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(getState().doc));
        } catch {
          /* quota exceeded (large images) — the user can still save the project file */
        }
      }, 400);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // ---- files -------------------------------------------------------------------
  const importFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      try {
        const name = file.name.toLowerCase();
        if (name.endsWith('.json')) {
          openProjectJson(await file.text());
          notify(`Opened ${file.name}`);
        } else if (name.endsWith('.svg') || file.type === 'image/svg+xml') {
          const text = await file.text();
          const empty = getState().doc.elements.length === 0;
          const { res } = insertSvg(text, file.name.replace(/\.svg$/i, ''), empty ? 'original' : 'center');
          if (empty) {
            const { doc } = getState();
            setState({ doc: { ...doc, width: Math.round(res.width), height: Math.round(res.height) } });
          }
          setState({ leftTab: 'elements' });
          const count = res.elements.length;
          notify(`Imported “${file.name}” as a group of ${count} layer${count > 1 ? 's' : ''}. Double-click it to edit inside.`);
        } else if (file.type.startsWith('image/')) {
          await insertImage(await readFileAsDataUrl(file), file.name.replace(/\.[^.]+$/, ''));
          notify(`Imported image ${file.name}`);
        } else {
          throw new Error(`Unsupported file: ${file.name}`);
        }
      } catch (e) {
        notify((e as Error).message || 'Import failed');
      }
    }
  }, []);

  // ---- keyboard ------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || dialog || getState().showWelcome) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const s = getState();
      const kfs = s.selectedKfs.length > 0;
      if (mod) {
        if (k === 'z' && !e.shiftKey) undo();
        else if ((k === 'z' && e.shiftKey) || k === 'y') redo();
        else if (k === 'g' && e.shiftKey) ungroupSelection();
        else if (k === 'g') groupSelection();
        else if (k === 'e' && e.shiftKey) exportAnimatedSvg(s.doc);
        else if (k === 'e') setDialog('export');
        else if (k === 'm') mergeSelection();
        else if (k === 'o' && e.shiftKey) centerOrigin();
        else if (k === 'd') (kfs ? duplicateKeyframes() : duplicateSelection());
        else if (k === 'c') (kfs ? copyKeyframes() : copySelection());
        else if (k === 'x') copySelection(true);
        else if (k === 'v') (s.kfClipboard.length && (kfs || !s.clipboard.length) ? pasteKeyframes() : paste());
        else if (k === 'a') selectAll();
        else if (k === 's') saveProject(s.doc);
        else if (k === 'o') openRef.current?.click();
        else if (k === 'i') importRef.current?.click();
        else if (k === '0') canvasApi.fit();
        else return;
        e.preventDefault();
        return;
      }
      if (e.altKey) {
        if (k === 's') setView({ snap: !s.view.snap });
        else if (k === 'g') setView({ showGrid: !s.view.showGrid });
        else if (k === 'r') setView({ showRulers: !s.view.showRulers });
        else if (k === 'l') setView({ showGuides: !s.view.showGuides });
        else return;
        e.preventDefault();
        return;
      }
      if (e.shiftKey && /^[a-z]$/.test(k)) {
        const a = animatorForShortcut(k);
        if (a && s.selection.length) {
          addAnimator(a.id);
          e.preventDefault();
        }
        return;
      }
      if (e.key === ' ') {
        (document.activeElement as HTMLElement | null)?.blur?.();
        togglePlay();
      } else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
      else if (e.key === 'Escape') {
        if (s.pickMotionFor) setState({ pickMotionFor: null });
        else if (s.menu) setState({ menu: null });
        else if (s.tool !== 'select') setTool('select');
        else if (s.selectedKfs.length) setState({ selectedKfs: [] });
        else if (s.scope) select([s.scope]);
        else select([]);
      } else if (e.key === 'Enter' && s.selection.length === 1 && findEl(s.doc, s.selection[0])?.type === 'group') {
        const g = findEl(s.doc, s.selection[0])!;
        if (g.children?.length) setState({ scope: g.id, selection: [g.children[g.children.length - 1].id] });
      } else if (e.key === 'Home') setTime(0);
      else if (e.key === 'End') setTime(s.doc.duration);
      else if (e.key === ',') setTime(s.time - 1 / 30);
      else if (e.key === '.') setTime(s.time + 1 / 30);
      else if (e.key === '?') setDialog('help');
      else if (e.key === '1') canvasApi.fit();
      else if (e.key.startsWith('Arrow') && s.selection.length) {
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        const ch: Change[] = [];
        for (const id of s.selection) {
          const el = findEl(s.doc, id);
          if (!el) continue;
          const f = frameAt(el, s.time);
          if (dx) ch.push([id, 'x', f.x + dx]);
          if (dy) ch.push([id, 'y', f.y + dy]);
        }
        setValues(ch, 'nudge');
      } else {
        const t = TOOLS.find((t) => t.key.toLowerCase() === k);
        if (!t) return;
        setTool(t.id);
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const h0 = tlHeight;
    const move = (ev: PointerEvent) => setTlHeight(Math.max(130, Math.min(window.innerHeight - 220, h0 - (ev.clientY - y0))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const openImport = () => importRef.current?.click();

  return (
    <div
      className={`app ${leftOpen ? '' : 'left-closed'} ${rightOpen ? '' : 'right-closed'}`}
      style={{ '--tl-h': `${tlHeight}px` } as React.CSSProperties}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDropping(false);
        importFiles(e.dataTransfer.files);
      }}
    >
      <TopBar
        onOpen={() => openRef.current?.click()}
        onImport={openImport}
        onExport={() => setDialog('export')}
        onHelp={() => setDialog('help')}
      />
      {leftOpen ? <LeftPanel onImport={openImport} /> : (
        <button className="panel-expander left" onClick={() => setState({ leftOpen: true })} title="Show Elements / Library"><Icon name="chevR" /></button>
      )}
      <main className="stage">
        <Canvas onImport={openImport} />
      </main>
      {rightOpen ? <RightPanel /> : (
        <button className="panel-expander right" onClick={() => setState({ rightOpen: true })} title="Show Properties"><Icon name="chevL" /></button>
      )}
      <div className="tl-resizer" onPointerDown={startResize} title="Drag to resize the timeline" />
      <Timeline />

      <input ref={openRef} type="file" accept=".json,application/json" hidden onChange={(e) => { e.target.files && importFiles(e.target.files); e.target.value = ''; }} />
      <input ref={importRef} type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { e.target.files && importFiles(e.target.files); e.target.value = ''; }} />

      <ContextMenu />
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {showWelcome && !dialog && <WelcomeDialog onImport={openImport} onTemplates={() => setState({ leftTab: 'templates', leftOpen: true })} />}
      {dropping && <div className="drop-overlay"><div>Drop an SVG, image or Animora project</div></div>}
      {toast && <div className="toast" key={toast.id}>{toast.msg}</div>}
    </div>
  );
}
