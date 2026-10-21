import { getState } from '../state/store';
import {
  convertToPath, copySelection, deleteSelection, duplicateSelection, findEl, paste, reorderSelection, selectAll, setTool,
} from '../state/actions';
import { enterGroup, groupSelection, mergeSelection, ungroupSelection } from '../state/structure';
import { centerOrigin, createMask, flipSelection, releaseMask, startPickMotionPath } from '../state/editing';
import { patchElement } from '../state/actions';

export interface Command {
  id: string;
  label: string;
  icon?: string;
  kbd?: string;
  run: () => void;
  enabled: boolean;
  danger?: boolean;
}

export type MenuEntry = Command | 'sep';

const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export function selectionInfo() {
  const { selection, doc } = getState();
  const els = selection.map((id) => findEl(doc, id)).filter(Boolean) as NonNullable<ReturnType<typeof findEl>>[];
  return {
    els,
    count: els.length,
    hasGroup: els.some((e) => e.type === 'group'),
    single: els.length === 1 ? els[0] : null,
    mergeable: els.length > 1 || (els.length === 1 && els[0].type === 'group'),
  };
}

export function layerCommands(): MenuEntry[] {
  const { count, hasGroup, single, mergeable, els } = selectionInfo();
  const any = count > 0;
  const shape = single && (single.type === 'rect' || single.type === 'ellipse');
  const allHidden = any && els.every((e) => !e.visible);
  const allLocked = any && els.every((e) => e.locked);
  return [
    { id: 'group', label: 'Group selection', icon: 'groupAdd', kbd: `${mod}G`, run: groupSelection, enabled: any },
    { id: 'ungroup', label: 'Ungroup', icon: 'ungroup', kbd: `${mod}Shift+G`, run: ungroupSelection, enabled: hasGroup },
    { id: 'merge', label: 'Merge into one path', icon: 'merge', kbd: `${mod}M`, run: mergeSelection, enabled: mergeable },
    { id: 'mask', label: 'Create mask (top layer masks)', icon: 'mask', run: createMask, enabled: count > 1 },
    ...(single?.isMask ? [{ id: 'unmask', label: 'Release mask', icon: 'mask', run: () => releaseMask(single.id), enabled: true }] : []),
    ...(single?.type === 'group' ? [{ id: 'enter', label: 'Select inside group', icon: 'enter', run: () => enterGroup(single.id), enabled: true }] : []),
    ...(shape ? [{ id: 'topath', label: 'Convert to path', icon: 'pen', run: () => convertToPath(single!.id), enabled: true }] : []),
    ...(single?.type === 'path' ? [{ id: 'nodes', label: 'Edit nodes', icon: 'node', kbd: 'A', run: () => setTool('node'), enabled: true }] : []),
    'sep',
    { id: 'origin', label: 'Center origin', icon: 'origin', kbd: `${mod}Shift+O`, run: () => centerOrigin(), enabled: any },
    { id: 'flipH', label: 'Flip horizontally', icon: 'flipH', run: () => flipSelection('h'), enabled: any },
    { id: 'flipV', label: 'Flip vertically', icon: 'flipV', run: () => flipSelection('v'), enabled: any },
    ...(single ? [{ id: 'motion', label: single.motionPath ? 'Replace motion path…' : 'Set motion path…', icon: 'motion', run: () => startPickMotionPath(single.id), enabled: true }] : []),
    'sep',
    { id: 'dup', label: 'Duplicate', icon: 'copy', kbd: `${mod}D`, run: duplicateSelection, enabled: any },
    { id: 'copy', label: 'Copy', kbd: `${mod}C`, run: () => copySelection(), enabled: any },
    { id: 'paste', label: 'Paste', kbd: `${mod}V`, run: paste, enabled: getState().clipboard.length > 0 },
    'sep',
    { id: 'front', label: 'Bring to front', icon: 'top', run: () => reorderSelection('top'), enabled: any },
    { id: 'fwd', label: 'Bring forward', icon: 'up', run: () => reorderSelection('up'), enabled: any },
    { id: 'back', label: 'Send backward', icon: 'down', run: () => reorderSelection('down'), enabled: any },
    { id: 'bottom', label: 'Send to back', icon: 'bottom', run: () => reorderSelection('bottom'), enabled: any },
    'sep',
    { id: 'hide', label: allHidden ? 'Show' : 'Hide', icon: allHidden ? 'eye' : 'eyeOff', run: () => els.forEach((e) => patchElement(e.id, { visible: allHidden })), enabled: any },
    { id: 'lock', label: allLocked ? 'Unlock' : 'Lock', icon: allLocked ? 'unlock' : 'lock', run: () => els.forEach((e) => patchElement(e.id, { locked: !allLocked })), enabled: any },
    { id: 'all', label: 'Select all', kbd: `${mod}A`, run: selectAll, enabled: true },
    'sep',
    { id: 'delete', label: 'Delete', icon: 'trash', kbd: 'Del', run: deleteSelection, enabled: any, danger: true },
  ];
}
