import { useStore, setState } from '../state/store';
import { deleteSelection, duplicateSelection } from '../state/actions';
import { alignSelection, groupSelection, mergeSelection, ungroupSelection } from '../state/structure';
import { selectionInfo } from './commands';
import { Icon } from './Icon';

/** Floating action bar shown while something is selected. */
export function SelectionBar() {
  useStore((s) => s.selection);
  useStore((s) => s.doc);
  const { count, hasGroup, mergeable, single } = selectionInfo();
  if (!count) return null;
  return (
    <div className="selection-bar" onPointerDown={(e) => e.stopPropagation()}>
      <span className="sb-label">{single ? single.name : `${count} layers`}</span>
      <span className="dock-sep" />
      <button className="sb-btn" onClick={groupSelection} title="Group (Ctrl+G)"><Icon name="groupAdd" /> Group</button>
      {hasGroup && <button className="sb-btn" onClick={ungroupSelection} title="Ungroup (Ctrl+Shift+G)"><Icon name="ungroup" /> Ungroup</button>}
      {mergeable && <button className="sb-btn" onClick={mergeSelection} title="Merge into one shape (Ctrl+E)"><Icon name="merge" /> Merge</button>}
      <span className="dock-sep" />
      {count > 1 && (
        <>
          <button className="sb-icon" onClick={() => alignSelection('left')} title="Align left"><Icon name="alignLeft" /></button>
          <button className="sb-icon" onClick={() => alignSelection('centerH')} title="Align centers"><Icon name="alignCenterH" /></button>
          <button className="sb-icon" onClick={() => alignSelection('top')} title="Align top"><Icon name="alignTop" /></button>
          <button className="sb-icon" onClick={() => alignSelection('middle')} title="Align middles"><Icon name="alignMiddle" /></button>
          <span className="dock-sep" />
        </>
      )}
      <button className="sb-icon" onClick={() => setState({ inspectorTab: 'animate' })} title="Animate this"><Icon name="wand" /></button>
      <button className="sb-icon" onClick={duplicateSelection} title="Duplicate (Ctrl+D)"><Icon name="copy" /></button>
      <button className="sb-icon danger" onClick={deleteSelection} title="Delete (Del)"><Icon name="trash" /></button>
    </div>
  );
}
