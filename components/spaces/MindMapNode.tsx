'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import styles from './SpaceMindMapView.module.css';

export type MindMapNodeData = {
  label: string;
  kind: 'root' | 'folder' | 'list' | 'task';
  statusColor?: string;
  hasChildren: boolean;
  collapsed: boolean;
  selected: boolean;
  canAdd?: boolean;
  canDelete?: boolean;
  isPendingParent?: boolean;
  onToggle?: () => void;
  onAdd?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
};

function MindMapNodeComponent({ data }: NodeProps<MindMapNodeData>) {
  const cardClass = [
    styles.nodeCard,
    data.kind === 'root' && styles.nodeCardRoot,
    data.kind === 'folder' && styles.nodeCardFolder,
    data.kind === 'list' && styles.nodeCardList,
    data.selected && styles.nodeCardSelected,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 8, height: 8 }} />
      <div className={`${styles.nodeWrap} ${data.selected && data.canDelete ? styles.nodeWrapWithDelete : ''}`}>
        {data.selected && data.canDelete && (
          <button
            type="button"
            className={styles.deleteBtn}
            title="Delete task"
            onClick={e => {
              e.stopPropagation();
              data.onDelete?.();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
        <div
          className={cardClass}
          onDoubleClick={e => {
            e.stopPropagation();
            if (data.kind === 'task') data.onOpen?.();
          }}
        >
        {data.kind === 'task' && data.statusColor && (
          <span className={styles.statusDot} style={{ background: data.statusColor }} />
        )}
        {data.kind === 'list' && (
          <span className={styles.nodeIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
            </svg>
          </span>
        )}
        {data.kind === 'folder' && (
          <span className={styles.nodeIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </span>
        )}
        <span className={styles.nodeLabel} title={data.label}>
          {data.label}
        </span>
        {data.hasChildren && (
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={e => {
              e.stopPropagation();
              data.onToggle?.();
            }}
            title={data.collapsed ? 'Expand' : 'Collapse'}
          >
            {data.collapsed ? '+' : '−'}
          </button>
        )}
        </div>
        {data.canAdd && !data.isPendingParent && (
          <button
            type="button"
            className={styles.addBtn}
            title={data.kind === 'task' ? 'Add child task' : 'Add task'}
            onClick={e => {
              e.stopPropagation();
              data.onAdd?.();
            }}
          >
            +
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 8, height: 8 }} />
    </>
  );
}

export const MindMapNode = memo(MindMapNodeComponent);
