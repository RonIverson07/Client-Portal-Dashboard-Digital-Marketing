'use client';

import { memo, useEffect, useRef } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import styles from './SpaceMindMapView.module.css';

export type MindMapDraftNodeData = {
  onSubmit: (title: string) => void;
  onCancel: () => void;
};

function MindMapDraftNodeComponent({ data }: NodeProps<MindMapDraftNodeData>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const submit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const title = inputRef.current?.value ?? '';
    data.onSubmit(title);
  };

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 8, height: 8 }} />
      <div className={styles.draftNode}>
        <input
          ref={inputRef}
          type="text"
          className={styles.draftInput}
          placeholder="Task name"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              data.onCancel();
            }
          }}
          onBlur={() => {
            if (doneRef.current) return;
            const v = inputRef.current?.value?.trim();
            if (v) submit();
            else data.onCancel();
          }}
        />
      </div>
    </>
  );
}

export const MindMapDraftNode = memo(MindMapDraftNodeComponent);
