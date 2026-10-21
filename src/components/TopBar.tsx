import { useEffect, useRef, useState } from 'react';
import { useStore, getState, setState, setTheme, setView } from '../state/store';
import { loadDoc, newProject, patchDoc, redo, reorderSelection, setTool, undo } from '../state/actions';
import { groupSelection, mergeSelection, ungroupSelection } from '../state/structure';
import { centerOrigin, clearGuides, createMask, flipSelection, rotateSelection } from '../state/editing';
import { demoDoc } from '../model/factory';
import { saveProject } from '../io/files';
import type { Tool } from '../model/types';
import { canvasApi } from './canvasApi';
import { Icon } from './Icon';

interface Props {
  onOpen: () => void;
  onImport: () => void;
  onExport: () => void;
  onHelp: () => void;
}

export interface ToolDef {
  id: Tool;
  icon: string;
  label: string;
  key: string;
}

export const TOOL_GROUPS: { id: string; tools: ToolDef[] }[] = [
  { id: 'select', tools: [{ id: 'select', icon: 'select', label: 'Transform', key: 'V' }, { id: 'node', icon: 'node', label: 'Node', key: 'A' }] },
  { id: 'pen', tools: [{ id: 'pen', icon: 'pen', label: 'Pen', key: 'P' }, { id: 'line', icon: 'line', label: 'Line', key: 'L' }] },
  {
    id: 'shapes',
    tools: [
      { id: 'rect', icon: 'rect', label: 'Rectangle', key: 'R' },
      { id: 'ellipse', icon: 'ellipse', label: 'Ellipse', key: 'E' },
      { id: 'polygon', icon: 'polygon', label: 'Polygon', key: 'G' },
      { id: 'star', icon: 'star', label: 'Star', key: 'S' },
    ],
  },
  { id: 'text', tools: [{ id: 'text', icon: 'text', label: 'Text', key: 'T' }] },
  { id: 'hand', tools: [{ id: 'hand', icon: 'hand', label: 'Hand', key: 'H' }] },
];

export const TOOLS = TOOL_GROUPS.flatMap((g) => g.tools);

/** Click-outside popover anchored to a button. */
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('pointerdown', h);
      window.removeEventListener('keydown', k);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function ToolGroup({ tools }: { tools: ToolDef[] }) {
  const tool = useStore((s) => s.tool);
  const [last, setLast] = useState(tools[0].id);
  const dd = useDropdown();
  const active = tools.find((t) => t.id === tool);
  const shown = active ?? tools.find((t) => t.id === last) ?? tools[0];
  useEffect(() => {
    if (active) setLast(active.id);
  }, [active]);
  return (
    <div className="tool-group" ref={dd.ref}>
      <button className={`tb-btn ${active ? 'active' : ''}`} onClick={() => setTool(shown.id)} title={`${shown.label} (${shown.key})`}>
        <Icon name={shown.icon} size={18} />
      </button>
      {tools.length > 1 && (
        <button className={`tb-caret ${active ? 'active' : ''}`} onClick={() => dd.setOpen(!dd.open)} aria-label="More tools">
          <Icon name="chevD" size={10} />
        </button>
      )}
      {dd.open && (
        <div className="menu-pop">
          {tools.map((t) => (
            <button key={t.id} className={`menu-item ${tool === t.id ? 'checked' : ''}`} onClick={() => { setTool(t.id); dd.setOpen(false); }}>
              <span className="mi-icon"><Icon name={t.icon} size={14} /></span>
              <span className="mi-label">{t.label}</span>
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TB({ icon, title, onClick, disabled, active }: { icon: string; title: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button className={`tb-btn ${active ? 'active' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      <Icon name={icon} size={18} />
    </button>
  );
}

function Check({ on, label, kbd, onClick }: { on: boolean; label: string; kbd?: string; onClick: () => void }) {
  return (
    <button className="menu-item" onClick={onClick}>
      <span className="mi-icon">{on && <Icon name="check" size={14} />}</span>
      <span className="mi-label">{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  );
}

function SnapMenu() {
  const view = useStore((s) => s.view);
  const dd = useDropdown();
  return (
    <div className="tool-group" ref={dd.ref}>
      <button className={`tb-btn ${view.snap ? 'on' : ''}`} onClick={() => setView({ snap: !view.snap })} title={`Snapping ${view.snap ? 'on' : 'off'} (Alt+S)`}>
        <Icon name="magnet" size={18} />
      </button>
      <button className="tb-caret" onClick={() => dd.setOpen(!dd.open)} aria-label="Snapping options"><Icon name="chevD" size={10} /></button>
      {dd.open && (
        <div className="menu-pop">
          <Check on={view.snapObjects} label="Snap to objects" onClick={() => setView({ snapObjects: !view.snapObjects })} />
          <Check on={view.snapGuides} label="Snap to guides" onClick={() => setView({ snapGuides: !view.snapGuides })} />
          <Check on={view.snapGrid} label="Snap to grid" onClick={() => setView({ snapGrid: !view.snapGrid })} />
          <Check on={view.snapPixel} label="Snap to pixel" onClick={() => setView({ snapPixel: !view.snapPixel })} />
          <div className="menu-sep" />
          <Check on={view.snap} label="Enable snapping" kbd="Alt+S" onClick={() => setView({ snap: !view.snap })} />
        </div>
      )}
    </div>
  );
}

function StageMenu() {
  const view = useStore((s) => s.view);
  const dd = useDropdown();
  return (
    <div className="tool-group" ref={dd.ref}>
      <button className={`tb-btn ${view.showGrid ? 'on' : ''}`} onClick={() => setView({ showGrid: !view.showGrid })} title="Show grid (Alt+G)">
        <Icon name="grid" size={18} />
      </button>
      <button className="tb-caret" onClick={() => dd.setOpen(!dd.open)} aria-label="Stage options"><Icon name="chevD" size={10} /></button>
      {dd.open && (
        <div className="menu-pop">
          <Check on={view.showGrid} label="Show grid" kbd="Alt+G" onClick={() => setView({ showGrid: !view.showGrid })} />
          <div className="menu-row">
            <span>Grid size</span>
            <input type="number" min={2} max={500} value={view.gridSize} onChange={(e) => setView({ gridSize: Math.max(2, +e.target.value || 20) })} />
          </div>
          <div className="menu-sep" />
          <Check on={view.showRulers} label="Show rulers" kbd="Alt+R" onClick={() => setView({ showRulers: !view.showRulers })} />
          <Check on={view.showGuides} label="Show guides" kbd="Alt+L" onClick={() => setView({ showGuides: !view.showGuides })} />
          <button className="menu-item" onClick={() => { clearGuides(); dd.setOpen(false); }}>
            <span className="mi-icon" /><span className="mi-label">Clear all guides</span>
          </button>
        </div>
      )}
    </div>
  );
}

function AppMenu({ onOpen, onImport, onExport, onHelp }: Props) {
  const dd = useDropdown();
  const theme = useStore((s) => s.theme);
  const item = (label: string, run: () => void, kbd?: string, icon?: string) => (
    <button className="menu-item" onClick={() => { dd.setOpen(false); run(); }}>
      <span className="mi-icon">{icon && <Icon name={icon} size={14} />}</span>
      <span className="mi-label">{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  );
  return (
    <div className="tool-group" ref={dd.ref}>
      <button className="brand-btn" onClick={() => dd.setOpen(!dd.open)} title="Menu">
        <img src="./favicon.svg" alt="Animora" width={26} height={26} />
      </button>
      {dd.open && (
        <div className="menu-pop">
          {item('New project', () => confirm('Start a new empty project? Save the current one first if you need it.') && newProject(), undefined, 'file')}
          {item('Open project…', onOpen, 'Ctrl+O', 'open')}
          {item('Save project file', () => saveProject(getState().doc), 'Ctrl+S', 'save')}
          <div className="menu-sep" />
          {item('Import SVG / image…', onImport, 'Ctrl+I', 'upload')}
          {item('Export…', onExport, 'Ctrl+E', 'export')}
          <div className="menu-sep" />
          {item('Open demo project', () => loadDoc(demoDoc()), undefined, 'sparkles')}
          {item(theme === 'dark' ? 'Light theme' : 'Dark theme', () => setTheme(theme === 'dark' ? 'light' : 'dark'), undefined, theme === 'dark' ? 'sun' : 'moon')}
          {item('Shortcuts & help', onHelp, '?', 'help')}
          {item('Source code (MIT)', () => window.open('https://github.com/itsrajverma/animora', '_blank', 'noopener'), undefined, 'github')}
        </div>
      )}
    </div>
  );
}

export function TopBar(props: Props) {
  const name = useStore((s) => s.doc.name);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const selection = useStore((s) => s.selection);
  const zoom = useStore((s) => s.zoom);
  const saved = useStore((s) => s.doc);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => {
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 900);
    return () => clearTimeout(t);
  }, [saved]);
  const any = selection.length > 0;

  return (
    <header className="topbar">
      <div className="tb-left">
        <AppMenu {...props} />
        <input className="doc-name" value={name} onChange={(e) => patchDoc({ name: e.target.value }, 'docname')} aria-label="Project name" spellCheck={false} />
        <TB icon="undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <TB icon="redo" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
      </div>

      <div className="tb-tools">
        {TOOL_GROUPS.map((g) => <ToolGroup key={g.id} tools={g.tools} />)}
        <span className="tb-sep" />
        <TB icon="up" title="Move up" onClick={() => reorderSelection('up')} disabled={!any} />
        <TB icon="down" title="Move down" onClick={() => reorderSelection('down')} disabled={!any} />
        <TB icon="groupAdd" title="Group (Ctrl+G)" onClick={groupSelection} disabled={!any} />
        <TB icon="ungroup" title="Ungroup (Ctrl+Shift+G)" onClick={ungroupSelection} disabled={!any} />
        <TB icon="mask" title="Create mask — the top layer masks the others" onClick={createMask} disabled={selection.length < 2} />
        <TB icon="merge" title="Merge into one path (Ctrl+M)" onClick={mergeSelection} disabled={!any} />
        <span className="tb-sep" />
        <TB icon="origin" title="Center origin (Ctrl+Shift+O)" onClick={() => centerOrigin()} disabled={!any} />
        <TB icon="flipH" title="Flip horizontally" onClick={() => flipSelection('h')} disabled={!any} />
        <TB icon="flipV" title="Flip vertically" onClick={() => flipSelection('v')} disabled={!any} />
        <TB icon="rotL" title="Rotate 90° counter-clockwise" onClick={() => rotateSelection(-90)} disabled={!any} />
        <TB icon="rotR" title="Rotate 90° clockwise" onClick={() => rotateSelection(90)} disabled={!any} />
        <span className="tb-sep" />
        <SnapMenu />
        <StageMenu />
        <TB icon="fitScreen" title="Fit canvas into view (1)" onClick={() => canvasApi.fit()} />
        <div className="zoom-ctl">
          <button onClick={() => canvasApi.zoomBy(1 / 1.25)} title="Zoom out">−</button>
          <button className="zoom-val" onClick={() => canvasApi.fit()} title="Fit (Ctrl+0)">{Math.round(zoom * 100)}%</button>
          <button onClick={() => canvasApi.zoomBy(1.25)} title="Zoom in">+</button>
        </div>
      </div>

      <div className="tb-right">
        <span className={`save-state ${savedFlash ? 'flash' : ''}`} title="Your work is saved automatically in this browser">
          <Icon name="cloud" size={20} />
        </span>
        <button className="tb-btn" onClick={() => setState({ rightTab: 'comments', rightOpen: true })} title="Comments">
          <Icon name="comment" size={18} />
        </button>
        <button className="export-btn" onClick={props.onExport}>Export</button>
      </div>
    </header>
  );
}
