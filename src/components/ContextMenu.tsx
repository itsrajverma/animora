import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, setState } from '../state/store';
import { layerCommands, type MenuEntry } from './commands';
import { Icon } from './Icon';

export function MenuList({ items, onDone }: { items: MenuEntry[]; onDone: () => void }) {
  return (
    <>
      {items.map((it, i) =>
        it === 'sep' ? (
          <div key={'s' + i} className="menu-sep" />
        ) : (
          <button
            key={it.id}
            className={`menu-item ${it.danger ? 'danger' : ''}`}
            disabled={!it.enabled}
            onClick={() => {
              onDone();
              it.run();
            }}
          >
            <span className="mi-icon">{it.icon && <Icon name={it.icon} size={14} />}</span>
            <span className="mi-label">{it.label}</span>
            {it.kbd && <kbd>{it.kbd}</kbd>}
          </button>
        ),
      )}
    </>
  );
}

/** Right-click menu for layers (canvas and layer list). */
export function ContextMenu() {
  const menu = useStore((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const close = () => setState({ menu: null });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', close);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div ref={ref} className="menu-pop context" style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}>
      <MenuList items={layerCommands()} onDone={close} />
    </div>
  );
}
