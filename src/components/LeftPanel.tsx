import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, getState, notify, setState } from '../state/store';
import { addElement, loadDoc, patchElement, select } from '../state/actions';
import { moveLayer } from '../state/structure';
import { insertImage, insertSaved, insertSvg } from '../state/insert';
import { LIBRARY, libraryElement } from '../model/library';
import { ASSET_CATEGORIES, type Asset } from '../model/assets';
import { TEMPLATES, type Template } from '../model/templates';
import type { SvgEl } from '../model/types';
import { exportSvg } from '../engine/render';
import { svgDataUrl } from '../io/files';
import { readFileAsDataUrl } from '../io/importSvg';
import { deleteItem, listItems, onLibraryChange, putItem, svgThumb, type LibItem } from '../io/userLibrary';
import { Icon } from './Icon';

export const TYPE_ICON: Record<SvgEl['type'], string> = {
  rect: 'rect', ellipse: 'ellipse', path: 'pen', text: 'text', image: 'image', raw: 'shapes', group: 'folder',
};

export function LeftPanel({ onImport }: { onImport: () => void }) {
  const tab = useStore((s) => s.leftTab);
  return (
    <aside className="left-panel">
      <div className="ptabs">
        <button className={tab === 'elements' ? 'active' : ''} onClick={() => setState({ leftTab: 'elements' })}>Elements</button>
        <button className={tab === 'library' ? 'active' : ''} onClick={() => setState({ leftTab: 'library' })}>Library</button>
        <button className={tab === 'templates' ? 'active' : ''} onClick={() => setState({ leftTab: 'templates' })}>Templates</button>
        <span className="grow" />
        <button className="collapse-btn" onClick={() => setState({ leftOpen: false })} title="Hide panel"><Icon name="chevL" /></button>
      </div>
      {tab === 'elements' && <ElementsTab />}
      {tab === 'library' && <LibraryTab onImport={onImport} />}
      {tab === 'templates' && <TemplatesTab />}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Elements

type Drop = { id: string; where: 'above' | 'below' | 'inside' } | null;

function matches(el: SvgEl, q: string): boolean {
  return el.name.toLowerCase().includes(q) || !!el.children?.some((c) => matches(c, q));
}

function ElementsTab() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const expanded = useStore((s) => s.expanded);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const anyOpen = Object.values(expanded).some(Boolean);

  const onRowClick = (e: React.MouseEvent, id: string) => {
    const sel = getState().selection;
    if (e.shiftKey || e.ctrlKey || e.metaKey) select(sel.includes(id) ? sel.filter((i) => i !== id) : [...sel, id]);
    else select([id]);
  };

  const rows: JSX.Element[] = [];
  const renderList = (list: SvgEl[], depth: number, hiddenParent: boolean, lockedParent: boolean) => {
    for (const el of [...list].reverse()) {
      if (q && !matches(el, q)) continue;
      const isGroup = el.type === 'group';
      const open = q ? true : !!expanded[el.id];
      const animated = Object.values(el.tracks).some((t) => t?.length);
      const sel = selection.includes(el.id);
      const dim = hiddenParent || !el.visible;
      rows.push(
        <div
          key={el.id}
          className={`layer-row ${sel ? 'selected' : ''} ${dim ? 'dim' : ''} ${drop?.id === el.id ? 'drop-' + drop.where : ''} ${dragId === el.id ? 'dragging' : ''}`}
          style={{ paddingLeft: 10 + depth * 16 }}
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
          {depth > 0 && <span className="tree-line" style={{ left: depth * 16 - 2 }} />}
          <button
            className={`caret ${open ? 'open' : ''} ${isGroup ? '' : 'invisible'}`}
            onClick={(e) => { e.stopPropagation(); setState({ expanded: { ...expanded, [el.id]: !open } }); }}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <Icon name="caret" />
          </button>
          <span className={`layer-icon ${isGroup ? 'group' : ''} ${el.isMask ? 'mask' : ''}`}><Icon name={el.isMask ? 'mask' : TYPE_ICON[el.type]} size={15} /></span>
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
  renderList(doc.elements, 1, false, false);

  const toggleAll = () => {
    if (anyOpen) return setState({ expanded: {} });
    const all: Record<string, boolean> = {};
    const rec = (l: SvgEl[]) => l.forEach((e) => { if (e.type === 'group') { all[e.id] = true; rec(e.children ?? []); } });
    rec(doc.elements);
    setState({ expanded: all });
  };

  return (
    <div className="elements-tab">
      <div className="search-row">
        <label className="search">
          <Icon name="search" size={14} />
          <input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="mini" onClick={toggleAll} title={anyOpen ? 'Collapse all' : 'Expand all'}><Icon name="collapseAll" /></button>
      </div>
      <div className="layer-list" onClick={(e) => e.target === e.currentTarget && select([])}>
        <div className={`layer-row canvas-row ${selection.length === 0 ? 'selected' : ''}`} onClick={() => select([])} title="Canvas settings">
          <span className="layer-icon canvas"><Icon name="canvas" size={15} /></span>
          <span className="layer-title">Canvas</span>
        </div>
        {rows}
        {!doc.elements.length && <p className="muted small empty-note">Draw with the toolbar, pick something from the Library, or import an SVG.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library

type CatId = 'uploads' | 'saved' | 'symbols' | string;

function useUserItems(kind: LibItem['kind']) {
  const [items, setItems] = useState<LibItem[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => listItems(kind).then((l) => live && setItems(l));
    load();
    const off = onLibraryChange(load);
    return () => {
      live = false;
      off();
    };
  }, [kind]);
  return items;
}

function LibraryTab({ onImport }: { onImport: () => void }) {
  const [cat, setCat] = useState<CatId>('symbols');
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cats: { id: CatId; name: string; icon: string }[] = [
    { id: 'uploads', name: 'Uploads', icon: 'upload' },
    { id: 'saved', name: 'Saved', icon: 'bookmark' },
    { id: 'symbols', name: 'Symbols', icon: 'shapes' },
    ...ASSET_CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
  ];
  const current = cats.find((c) => c.id === cat)!;

  const upload = async (files: FileList) => {
    for (const f of Array.from(files)) {
      if (f.size > 7 * 1024 * 1024) {
        notify(`${f.name} is larger than 7 MB.`);
        continue;
      }
      const isSvg = f.name.toLowerCase().endsWith('.svg') || f.type === 'image/svg+xml';
      if (isSvg) {
        const text = await f.text();
        await putItem({ kind: 'upload', name: f.name.replace(/\.svg$/i, ''), format: 'svg', data: text, thumb: svgThumb(text) });
      } else if (f.type.startsWith('image/')) {
        const url = await readFileAsDataUrl(f);
        await putItem({ kind: 'upload', name: f.name.replace(/\.[^.]+$/, ''), format: 'image', data: url, thumb: url });
      }
    }
    setCat('uploads');
  };

  return (
    <div className="library-tab">
      <label className="search lib-search">
        <Icon name="search" size={14} />
        <input placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="library-body">
        <nav className="lib-rail">
          {cats.map((c) => (
            <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => setCat(c.id)} title={c.name}>
              <Icon name={c.icon} size={22} />
            </button>
          ))}
        </nav>
        <div className="lib-content">
          <div className="lib-head">
            <b>{current.name}</b>
            <span className="grow" />
            {cat === 'uploads' && (
              <>
                <button className="mini" title="Upload files (.svg .png .jpg .gif .webp, max 7 MB)" onClick={() => fileRef.current?.click()}><Icon name="plus" /></button>
                <input ref={fileRef} type="file" hidden multiple accept=".svg,image/svg+xml,image/png,image/jpeg,image/gif,image/webp" onChange={(e) => { e.target.files && upload(e.target.files); e.target.value = ''; }} />
              </>
            )}
            {cat !== 'uploads' && cat !== 'saved' && <button className="mini" title="Import your own file" onClick={onImport}><Icon name="insert" /></button>}
          </div>
          {cat === 'symbols' && <SymbolGrid query={query} />}
          {(cat === 'uploads' || cat === 'saved') && <UserGrid kind={cat === 'uploads' ? 'upload' : 'saved'} query={query} onUpload={() => fileRef.current?.click()} />}
          {ASSET_CATEGORIES.some((c) => c.id === cat) && <AssetGrid assets={ASSET_CATEGORIES.find((c) => c.id === cat)!.assets} query={query} />}
        </div>
      </div>
    </div>
  );
}

function SymbolGrid({ query }: { query: string }) {
  const q = query.toLowerCase();
  const insert = (i: number) => {
    const { doc } = getState();
    setState({ scope: null });
    addElement(libraryElement(LIBRARY[i], doc.width / 2, doc.height / 2));
  };
  return (
    <div className="lib-grid">
      {LIBRARY.map((s, i) => (!q || s.name.toLowerCase().includes(q)) && (
        <button key={s.id} className="lib-tile" onClick={() => insert(i)} title={s.name}>
          <svg viewBox="-60 -60 120 120">
            <path d={s.d} fill={s.fill === 'none' ? 'none' : '#4a7fd4'} stroke={s.stroke ? '#4a7fd4' : 'none'} strokeWidth={s.strokeWidth ?? 0} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function AssetGrid({ assets, query }: { assets: Asset[]; query: string }) {
  const q = query.toLowerCase();
  const list = assets.filter((a) => !q || a.name.toLowerCase().includes(q));
  return (
    <div className="lib-grid">
      {list.map((a) => (
        <button key={a.id} className="lib-tile" title={a.name} onClick={() => {
          try {
            insertSvg(a.svg, a.name);
          } catch (e) {
            notify((e as Error).message);
          }
        }}>
          <img src={svgDataUrl(a.svg)} alt={a.name} draggable={false} />
        </button>
      ))}
      {!list.length && <p className="muted small">Nothing matches “{query}”.</p>}
    </div>
  );
}

function UserGrid({ kind, query, onUpload }: { kind: LibItem['kind']; query: string; onUpload: () => void }) {
  const items = useUserItems(kind);
  if (!items) return <p className="muted small">Loading…</p>;
  const q = query.toLowerCase();
  const list = items.filter((i) => !q || i.name.toLowerCase().includes(q));
  const use = async (it: LibItem) => {
    try {
      if (it.format === 'svg') insertSvg(it.data, it.name);
      else if (it.format === 'image') await insertImage(it.data, it.name);
      else insertSaved(JSON.parse(it.data), it.defs);
    } catch (e) {
      notify((e as Error).message || 'Could not insert this item');
    }
  };
  if (!items.length) {
    return kind === 'upload' ? (
      <div className="lib-empty">
        <p>Click on <button className="link-btn" onClick={onUpload}><Icon name="plus" size={14} /></button> to upload files</p>
        <span>.svg, .png, .jpg, .gif, .webp</span>
        <span>Max 7 MB / file</span>
      </div>
    ) : (
      <div className="lib-empty">
        <p>No saved items yet</p>
        <span>Select layers and click <b>Save to library</b> in Properties to reuse them in any project.</span>
      </div>
    );
  }
  return (
    <div className="lib-grid">
      {list.map((it) => (
        <div key={it.id} className="lib-tile user" title={it.name}>
          <button className="lib-use" onClick={() => use(it)}><img src={it.thumb} alt={it.name} draggable={false} /></button>
          <span className="lib-name">{it.name}</span>
          <button className="lib-del" title="Delete" onClick={() => confirm(`Delete “${it.name}” from your library?`) && deleteItem(it.id)}><Icon name="trash" size={13} /></button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates

const thumbCache = new Map<string, string>();
function templateThumb(t: Template) {
  let url = thumbCache.get(t.id);
  if (!url) {
    url = svgDataUrl(exportSvg(t.make(), { animated: true }));
    thumbCache.set(t.id, url);
  }
  return url;
}

function TemplatesTab() {
  const thumbs = useMemo(() => TEMPLATES.map(templateThumb), []);
  const open = (t: Template) => {
    if (getState().doc.elements.length && !confirm(`Open the “${t.name}” template? It replaces the current project (save it first if you need it).`)) return;
    loadDoc(t.make());
    setState({ leftTab: 'elements' });
  };
  return (
    <div className="templates-tab">
      <p className="muted small">Start from an animated template. Every one is fully editable.</p>
      <div className="tpl-grid">
        {TEMPLATES.map((t, i) => (
          <button key={t.id} className="tpl-card" onClick={() => open(t)}>
            <span className="tpl-thumb"><img src={thumbs[i]} alt="" draggable={false} /></span>
            <b>{t.name}</b>
            <span>{t.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
