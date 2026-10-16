import { useEffect, useRef, useState } from 'react';
import { useStore, getState, setTheme } from '../state/store';
import { loadDoc, newProject, patchDoc, redo, undo } from '../state/actions';
import { demoDoc } from '../model/factory';
import { exportAnimatedSvg, exportPng, exportStaticSvg, saveProject } from '../io/files';
import { layerCommands } from './commands';
import { MenuList } from './ContextMenu';
import { Icon } from './Icon';

interface Props {
  onOpen: () => void;
  onImport: () => void;
  onPreview: () => void;
  onVideo: () => void;
  onHelp: () => void;
}

function Menu({ label, icon, children, primary, align = 'left' }: {
  label: string; icon?: string; primary?: boolean; align?: 'left' | 'right';
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`hbtn ${primary ? 'primary' : ''} ${open ? 'active' : ''}`} onClick={() => setOpen(!open)}>
        {icon && <Icon name={icon} />} {label} {primary && <Icon name="caret" size={12} />}
      </button>
      {open && <div className={`menu-pop ${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

const Item = ({ onClick, children, kbd, icon }: { onClick: () => void; children: React.ReactNode; kbd?: string; icon?: string }) => (
  <button className="menu-item" onClick={onClick}>
    <span className="mi-icon">{icon && <Icon name={icon} size={14} />}</span>
    <span className="mi-label">{children}</span>
    {kbd && <kbd>{kbd}</kbd>}
  </button>
);

export function Header({ onOpen, onImport, onPreview, onVideo, onHelp }: Props) {
  const name = useStore((s) => s.doc.name);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const theme = useStore((s) => s.theme);

  return (
    <header className="header">
      <div className="brand">
        <img src="./favicon.svg" alt="" width={26} height={26} />
        <span>Animora</span>
      </div>
      <nav className="menus">
        <Menu label="File">
          {(close) => (
            <>
              <Item icon="file" onClick={() => { if (confirm('Start a new empty project? Save the current one first if you need it.')) newProject(); close(); }}>New project</Item>
              <Item icon="open" kbd="Ctrl+O" onClick={() => { onOpen(); close(); }}>Open project…</Item>
              <Item icon="save" kbd="Ctrl+S" onClick={() => { saveProject(getState().doc); close(); }}>Save project file</Item>
              <div className="menu-sep" />
              <Item icon="upload" kbd="Ctrl+I" onClick={() => { onImport(); close(); }}>Import SVG / image…</Item>
              <Item icon="sparkles" onClick={() => { loadDoc(demoDoc()); close(); }}>Open demo project</Item>
            </>
          )}
        </Menu>
        <Menu label="Edit">
          {(close) => (
            <>
              <Item icon="undo" kbd="Ctrl+Z" onClick={() => { undo(); close(); }}>Undo</Item>
              <Item icon="redo" kbd="Ctrl+Shift+Z" onClick={() => { redo(); close(); }}>Redo</Item>
              <div className="menu-sep" />
              <MenuList items={layerCommands()} onDone={close} />
            </>
          )}
        </Menu>
        <Menu label="Help">
          {(close) => (
            <>
              <Item icon="help" kbd="?" onClick={() => { onHelp(); close(); }}>Shortcuts & tips</Item>
              <Item icon="github" onClick={() => { window.open('https://github.com/', '_blank', 'noopener'); close(); }}>Source code (MIT)</Item>
            </>
          )}
        </Menu>
      </nav>
      <div className="hgroup">
        <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
        <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)"><Icon name="redo" /></button>
      </div>

      <input className="doc-name" value={name} onChange={(e) => patchDoc({ name: e.target.value }, 'docname')} aria-label="Project name" spellCheck={false} />

      <div className="header-right">
        <span className="saved-hint" title="Your work is saved automatically in this browser"><span className="saved-dot" /> Saved locally</span>
        <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="hbtn" onClick={onImport}><Icon name="upload" /> Import</button>
        <button className="hbtn" onClick={onPreview}><Icon name="preview" /> Preview</button>
        <Menu label="Export" icon="export" primary align="right">
          {(close) => (
            <>
              <Item icon="export" kbd="Ctrl+Shift+E" onClick={() => { exportAnimatedSvg(getState().doc); close(); }}>Animated SVG <span className="muted">· no JS</span></Item>
              <Item icon="play" onClick={() => { onVideo(); close(); }}>Video (WebM)…</Item>
              <div className="menu-sep" />
              <Item icon="image" onClick={() => { exportPng(getState().doc, getState().time); close(); }}>PNG of current frame</Item>
              <Item icon="file" onClick={() => { exportStaticSvg(getState().doc, getState().time); close(); }}>Static SVG of current frame</Item>
              <div className="menu-sep" />
              <Item icon="save" onClick={() => { saveProject(getState().doc); close(); }}>Project file (.json)</Item>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
