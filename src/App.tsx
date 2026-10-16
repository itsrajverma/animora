import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, getState, setState, AUTOSAVE_KEY, notify } from './state/store';
import {
  addElement, addElements, copySelection, deleteSelection, duplicateSelection, expand, findEl, openProjectJson, paste, redo, select,
  selectAll, setTime, setTool, setValues, undo, type Change,
} from './state/actions';
import { groupSelection, mergeSelection, ungroupSelection } from './state/structure';
import { createElement } from './model/factory';
import { frameAt } from './engine/interpolate';
import { importSvgText, imageSize, readFileAsDataUrl, wrapImport } from './io/importSvg';
import { exportAnimatedSvg, saveProject } from './io/files';
import { Header } from './components/Header';
import { TOOLS } from './components/ToolDock';
import { Canvas } from './components/Canvas';
import { canvasApi } from './components/canvasApi';
import { Timeline, togglePlay } from './components/Timeline';
import { Inspector } from './components/Inspector';
import { Sidebar } from './components/Sidebar';
import { ContextMenu } from './components/ContextMenu';
import { HelpDialog, PreviewDialog, VideoDialog, WelcomeDialog } from './components/Dialogs';

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

export default function App() {
  const [dialog, setDialog] = useState<'preview' | 'video' | 'help' | null>(null);
  const [tlHeight, setTlHeight] = useState(240);
  const [dropping, setDropping] = useState(false);
  const openRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const playing = useStore((s) => s.playing);
  const theme = useStore((s) => s.theme);
  const toast = useStore((s) => s.toast);
  const showWelcome = useStore((s) => s.showWelcome);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
        if (s.doc.loop) t = t % D;
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
          const res = importSvgText(await file.text());
          if (!res.elements.length) throw new Error('No drawable elements found in this SVG.');
          const { doc } = getState();
          if (doc.elements.length === 0) setState({ doc: { ...doc, width: Math.round(res.width), height: Math.round(res.height) } });
          const els = wrapImport(res.elements, file.name.replace(/\.svg$/i, ''));
          setState({ scope: null });
          addElements(els, res.defs);
          expand(els.filter((e) => e.type === 'group').map((e) => e.id));
          setState({ sidebarTab: 'layers' });
          const count = res.elements.length;
          notify(`Imported “${file.name}” as a group of ${count} layer${count > 1 ? 's' : ''}. Double-click it to edit inside.`);
        } else if (file.type.startsWith('image/')) {
          const url = await readFileAsDataUrl(file);
          const { w, h } = await imageSize(url);
          const { doc } = getState();
          const k = Math.min(1, (doc.width * 0.8) / w, (doc.height * 0.8) / h);
          setState({ scope: null });
          addElement(createElement('image', { name: file.name.replace(/\.[^.]+$/, ''), href: url }, {
            x: doc.width / 2, y: doc.height / 2, width: Math.round(w * k), height: Math.round(h * k),
          }));
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
      if (mod) {
        if (k === 'z' && !e.shiftKey) undo();
        else if ((k === 'z' && e.shiftKey) || k === 'y') redo();
        else if (k === 'g' && e.shiftKey) ungroupSelection();
        else if (k === 'g') groupSelection();
        else if (k === 'e' && e.shiftKey) exportAnimatedSvg(s.doc);
        else if (k === 'e') mergeSelection();
        else if (k === 'd') duplicateSelection();
        else if (k === 'c') copySelection();
        else if (k === 'x') copySelection(true);
        else if (k === 'v') paste();
        else if (k === 'a') selectAll();
        else if (k === 's') saveProject(s.doc);
        else if (k === 'o') openRef.current?.click();
        else if (k === 'i') importRef.current?.click();
        else if (k === '0') canvasApi.fit();
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === ' ') {
        (document.activeElement as HTMLElement | null)?.blur?.();
        togglePlay();
      } else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
      else if (e.key === 'Escape') {
        if (s.menu) setState({ menu: null });
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
    const move = (ev: PointerEvent) => setTlHeight(Math.max(120, Math.min(window.innerHeight - 240, h0 - (ev.clientY - y0))));
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
      className="app"
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
      <Header
        onOpen={() => openRef.current?.click()}
        onImport={openImport}
        onPreview={() => setDialog('preview')}
        onVideo={() => setDialog('video')}
        onHelp={() => setDialog('help')}
      />
      <Sidebar onImport={openImport} />
      <main className="stage">
        <Canvas onImport={openImport} />
      </main>
      <Inspector />
      <div className="tl-resizer" onPointerDown={startResize} title="Drag to resize the timeline" />
      <Timeline />

      <input ref={openRef} type="file" accept=".json,application/json" hidden onChange={(e) => { e.target.files && importFiles(e.target.files); e.target.value = ''; }} />
      <input ref={importRef} type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => { e.target.files && importFiles(e.target.files); e.target.value = ''; }} />

      <ContextMenu />
      {dialog === 'preview' && <PreviewDialog onClose={() => setDialog(null)} onVideo={() => setDialog('video')} />}
      {dialog === 'video' && <VideoDialog onClose={() => setDialog(null)} />}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {showWelcome && !dialog && <WelcomeDialog onImport={openImport} />}
      {dropping && <div className="drop-overlay"><div>Drop an SVG, image or Animora project</div></div>}
      {toast && <div className="toast" key={toast.id}>{toast.msg}</div>}
    </div>
  );
}
