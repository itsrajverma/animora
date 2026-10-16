import { useState } from 'react';
import { useStore, getState, setState } from '../state/store';
import { addElement, deleteSelection, patchElement, select } from '../state/actions';
import { groupSelection, mergeSelection, moveLayer, ungroupSelection } from '../state/structure';
import { LIBRARY, libraryElement } from '../model/library';
import type { SvgEl } from '../model/types';
import { flatten } from '../model/tree';
import { selectionInfo } from './commands';
import { Icon } from './Icon';

export const TYPE_ICON: Record<SvgEl['type'], string> = {
  rect: 'rect', ellipse: 'ellipse', path: 'pen', text: 'text', image: 'image', raw: 'shapes', group: 'folder',
};

type Drop = { id: string; where: 'above' | 'below' | 'inside' } | null;

export function Sidebar({ onImport }: { onImport: () => void }) {
  const tab = useStore((s) => s.sidebarTab);
  return (
    <aside className="sidebar">
      <div className="tabs">
        <button className={tab === 'layers' ? 'active' : ''} onClick={() => setState({ sidebarTab: 'layers' })}><Icon name="layers" /> Layers</button>
        <button className={tab === 'shapes' ? 'active' : ''} onClick={() => setState({ sidebarTab: 'shapes' })}><Icon name="shapes" /> Shapes</button>
      </div>
      {tab === 'layers' ? <LayersPanel onImport={onImport} /> : <ShapesPanel onImport={onImport} />}
    </aside>
  );
}

function LayersPanel({ onImport }: { onImport: () => void }) {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const expanded = useStore((s) => s.expanded);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const { count, hasGroup, mergeable } = selectionInfo();
  const total = flatten(doc.elements).length;

  const onRowClick = (e: React.MouseEvent, id: string) => {
    const sel = getState().selection;
    if (e.shiftKey || e.ctrlKey || e.metaKey) select(sel.includes(id) ? sel.filter((i) => i !== id) : [...sel, id]);
    else select([id]);
  };

  const rows: JSX.Element[] = [];
  const renderList = (list: SvgEl[], depth: number, hiddenParent: boolean, lockedParent: boolean) => {
    for (const el of [...list].reverse()) {
      const isGroup = el.type === 'group';
      const open = !!expanded[el.id];
      const animated = Object.values(el.tracks).some((t) => t?.length);
      const sel = selection.includes(el.id);
      const dim = hiddenParent || !el.visible;
      rows.push(
        <div
          key={el.id}
          className={`layer-row ${sel ? 'selected' : ''} ${dim ? 'dim' : ''} ${drop?.id === el.id ? 'drop-' + drop.where : ''} ${dragId === el.id ? 'dragging' : ''}`}
          style={{ paddingLeft: 6 + depth * 16 }}
          draggable={renaming !== el.id}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/animora-layer', el.id);
            e.dataTransfer.effectAllowed = 'move';
            setDragId(el.id);
          }}
          onDragEnd={() => { setDragId(null); setDrop(null); }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('text/animora-layer')) return;
            e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            const where = isGroup && y > 0.3 && y < 0.7 ? 'inside' : y < 0.5 ? 'above' : 'below';
            if (drop?.id !== el.id || drop.where !== where) setDrop({ id: el.id, where });
          }}
          onDragLeave={() => drop?.id === el.id && setDrop(null)}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/animora-layer');
            const d = drop;
            setDrop(null);
            setDragId(null);
            if (id && d) moveLayer(id, d.id, d.where);
          }}
          onClick={(e) => onRowClick(e, el.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!getState().selection.includes(el.id)) select([el.id]);
            setState({ menu: { x: e.clientX, y: e.clientY } });
          }}
        >
          <button
            className={`caret ${open ? 'open' : ''} ${isGroup ? '' : 'invisible'}`}
            onClick={(e) => { e.stopPropagation(); setState({ expanded: { ...expanded, [el.id]: !open } }); }}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <Icon name="caret" />
          </button>
          <span className={`layer-icon ${isGroup ? 'group' : ''}`}><Icon name={TYPE_ICON[el.type]} size={14} /></span>
          {renaming === el.id ? (
            <input
              className="rename"
              autoFocus
              defaultValue={el.name}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { patchElement(el.id, { name: e.target.value.trim() || el.name }); setRenaming(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <span className="layer-title" onDoubleClick={(e) => { e.stopPropagation(); setRenaming(el.id); }} title="Double-click to rename">
              {el.name}
              {isGroup && <span className="count">{el.children?.length ?? 0}</span>}
            </span>
          )}
          {animated && <span className="anim-dot" title="Animated" />}
          <span className="layer-actions">
            <button
              className={`mini ${el.locked || lockedParent ? 'on' : ''} ${el.locked ? 'pinned' : ''}`}
              title={el.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => { e.stopPropagation(); patchElement(el.id, { locked: !el.locked }); }}
            >
              <Icon name={el.locked ? 'lock' : 'unlock'} />
            </button>
            <button
              className={`mini ${el.visible ? '' : 'off pinned'}`}
              title={el.visible ? 'Hide' : 'Show'}
              onClick={(e) => { e.stopPropagation(); patchElement(el.id, { visible: !el.visible }); }}
            >
              <Icon name={el.visible ? 'eye' : 'eyeOff'} />
            </button>
          </span>
        </div>,
      );
      if (isGroup && open) renderList(el.children ?? [], depth + 1, dim, lockedParent || el.locked);
    }
  };
  renderList(doc.elements, 0, false, false);

  return (
    <div className="layers-panel">
      <div className="panel-head">
        <span className="muted small">{total} layer{total === 1 ? '' : 's'}</span>
        <button className="btn sm" onClick={onImport}><Icon name="upload" size={14} /> Import</button>
      </div>
      <div className="layer-list" onClick={(e) => e.target === e.currentTarget && select([])}>
        {rows.length ? rows : (
          <div className="layers-empty">
            <Icon name="layers" size={28} />
            <p>No layers yet</p>
            <span>Draw with the toolbar, add a shape from <b>Shapes</b>, or import an SVG.</span>
          </div>
        )}
      </div>
      <div className="layer-foot">
        <button className="icon-btn sm" disabled={!count} onClick={groupSelection} title="Group selection (Ctrl+G)"><Icon name="groupAdd" /></button>
        <button className="icon-btn sm" disabled={!hasGroup} onClick={ungroupSelection} title="Ungroup (Ctrl+Shift+G)"><Icon name="ungroup" /></button>
        <button className="icon-btn sm" disabled={!mergeable} onClick={mergeSelection} title="Merge into one shape (Ctrl+E)"><Icon name="merge" /></button>
        <span className="grow" />
        <span className="muted small">{count ? `${count} selected` : 'Drag to reorder or into groups'}</span>
        <span className="grow" />
        <button className="icon-btn sm danger" disabled={!count} onClick={deleteSelection} title="Delete"><Icon name="trash" /></button>
      </div>
    </div>
  );
}

function ShapesPanel({ onImport }: { onImport: () => void }) {
  const insert = (i: number) => {
    const { doc } = getState();
    setState({ scope: null });
    const el = libraryElement(LIBRARY[i], doc.width / 2, doc.height / 2);
    addElement(el);
    setState({ sidebarTab: 'layers' });
  };
  return (
    <div className="shapes-panel">
      <p className="muted small">Click a shape to add it to the center of the artboard.</p>
      <div className="shape-grid">
        {LIBRARY.map((s, i) => (
          <button key={s.id} className="shape-tile" onClick={() => insert(i)} title={s.name}>
            <svg viewBox="-60 -60 120 120" width="44" height="44">
              <path d={s.d} fill={s.fill} stroke={s.stroke ?? 'none'} strokeWidth={s.strokeWidth ?? 0} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{s.name}</span>
          </button>
        ))}
      </div>
      <div className="import-card" onClick={onImport}>
        <Icon name="upload" size={22} />
        <div>
          <b>Import your own artwork</b>
          <span>SVG files keep their groups and layers. PNG / JPG become image layers.</span>
        </div>
      </div>
    </div>
  );
}
