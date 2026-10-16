import { useStore } from '../state/store';
import { setTool } from '../state/actions';
import type { Tool } from '../model/types';
import { Icon } from './Icon';

export const TOOLS: { id: Tool; icon: string; label: string; key: string; group: number }[] = [
  { id: 'select', icon: 'select', label: 'Select & move', key: 'V', group: 0 },
  { id: 'node', icon: 'node', label: 'Edit nodes', key: 'A', group: 0 },
  { id: 'hand', icon: 'hand', label: 'Pan', key: 'H', group: 0 },
  { id: 'rect', icon: 'rect', label: 'Rectangle', key: 'R', group: 1 },
  { id: 'ellipse', icon: 'ellipse', label: 'Ellipse', key: 'E', group: 1 },
  { id: 'line', icon: 'line', label: 'Line', key: 'L', group: 1 },
  { id: 'star', icon: 'star', label: 'Star', key: 'S', group: 1 },
  { id: 'polygon', icon: 'polygon', label: 'Polygon', key: 'G', group: 1 },
  { id: 'pen', icon: 'pen', label: 'Pen', key: 'P', group: 2 },
  { id: 'text', icon: 'text', label: 'Text', key: 'T', group: 2 },
];

/** Floating toolbar at the top of the canvas. */
export function ToolDock() {
  const tool = useStore((s) => s.tool);
  return (
    <div className="tool-dock" onPointerDown={(e) => e.stopPropagation()}>
      {TOOLS.map((t, i) => (
        <div key={t.id} className="dock-item">
          {i > 0 && TOOLS[i - 1].group !== t.group && <span className="dock-sep" />}
          <button className={`dock-btn ${tool === t.id ? 'active' : ''}`} onClick={() => setTool(t.id)} aria-label={t.label}>
            <Icon name={t.icon} size={18} />
            <span className="tip">{t.label} <kbd>{t.key}</kbd></span>
          </button>
        </div>
      ))}
    </div>
  );
}
