'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  useEdgesState,
  useNodesState,
  ConnectionLineType,
  MarkerType,
  ReactFlowProvider,
} from 'reactflow';
import dagre from '@dagrejs/dagre';
import 'reactflow/dist/style.css';

import { buildMindMapTree, flattenMindMapTree, type MindMapTreeNode } from '@/lib/mindMapTree';
import { MindMapNode, type MindMapNodeData } from './MindMapNode';
import { MindMapDraftNode } from './MindMapDraftNode';
import styles from './SpaceMindMapView.module.css';

const DRAFT_NODE_ID = 'mindmap-draft-input';

const nodeTypes = {
  mindmap: MindMapNode,
  mindmapDraft: MindMapDraftNode,
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 56;
const DRAFT_OFFSET_X = 48;
const DRAFT_ROW_GAP = 16;

type PendingAdd = {
  parentNodeId: string;
  listId: string;
  parentTaskId: string | null;
};

function layoutWithDagre(treeNodes: MindMapTreeNode[], edges: { source: string; target: string }[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 72, marginx: 24, marginy: 24 });

  treeNodes.forEach(n => {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return treeNodes.map(n => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      type: 'mindmap',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        label: n.label,
        kind: n.kind,
        statusColor: undefined,
        hasChildren: n.children.length > 0,
        collapsed: false,
        selected: false,
        onToggle: undefined,
      } as MindMapNodeData,
    };
  });
}

export interface SpaceMindMapTask {
  id: string;
  listId: string;
  title: string;
  status: string;
  priority?: string;
  parentTaskId?: string | null;
}

interface SpaceMindMapViewProps {
  activeType: 'space' | 'folder' | 'list';
  activeId: string;
  rootLabel: string;
  lists: { id: string; parentId: string; name: string; color?: string }[];
  folders: { id: string; spaceId: string; name: string; color?: string }[];
  tasks: SpaceMindMapTask[];
  getStatusStyles: (status: string) => { color: string; bg: string };
  onTaskOpen: (taskId: string) => void;
  onCreateTask: (
    listId: string,
    title: string,
    parentTaskId?: string | null
  ) => Promise<{ ok: boolean; taskId?: string }>;
  onDeleteTask: (taskId: string) => void;
  defaultListId?: string | null;
  parentOverrides?: Record<string, string>;
}

function getDraftPosition(
  parentId: string,
  parentFlow: Node,
  flowNodes: Node[],
  flatEdges: { source: string; target: string }[]
): { x: number; y: number } {
  const childIds = flatEdges.filter(e => e.source === parentId).map(e => e.target);
  const childFlows = flowNodes.filter(n => childIds.includes(n.id));

  const baseX = parentFlow.position.x + NODE_WIDTH + DRAFT_OFFSET_X;

  if (childFlows.length === 0) {
    return { x: baseX, y: parentFlow.position.y + (NODE_HEIGHT - 40) / 2 };
  }

  const bottomChild = childFlows.reduce((a, b) => (a.position.y > b.position.y ? a : b));
  return {
    x: baseX,
    y: bottomChild.position.y + NODE_HEIGHT + DRAFT_ROW_GAP,
  };
}

export function SpaceMindMapView({
  activeType,
  activeId,
  rootLabel,
  lists,
  folders,
  tasks,
  getStatusStyles,
  onTaskOpen,
  onCreateTask,
  onDeleteTask,
  defaultListId,
  parentOverrides = {},
}: SpaceMindMapViewProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const tree = useMemo(
    () =>
      buildMindMapTree({
        activeType,
        activeId,
        rootLabel,
        lists,
        folders,
        tasks,
        parentOverrides,
      }),
    [activeType, activeId, rootLabel, lists, folders, tasks, parentOverrides]
  );

  // Ensure root can always receive + when viewing a list
  const effectiveDefaultListId =
    activeType === 'list' ? activeId : defaultListId;

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const startInlineAdd = useCallback((parentNodeId: string, listId: string, parentTaskId: string | null) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.delete(parentNodeId);
      return next;
    });
    setSelectedNodeId(parentNodeId);
    setPendingAdd({ parentNodeId, listId, parentTaskId });
  }, []);

  const cancelInlineAdd = useCallback(() => {
    setPendingAdd(null);
  }, []);

  const submitInlineAdd = useCallback(
    async (title: string) => {
      if (!pendingAdd) return;
      const trimmed = title.trim();
      if (!trimmed) {
        cancelInlineAdd();
        return;
      }
      const { parentNodeId, listId, parentTaskId } = pendingAdd;
      setPendingAdd(null);
      const result = await onCreateTask(listId, trimmed, parentTaskId);
      if (!result.ok) {
        setPendingAdd({ parentNodeId, listId, parentTaskId });
        return;
      }
      if (result.taskId) {
        setCollapsedIds(prev => {
          const next = new Set(prev);
          next.delete(parentNodeId);
          return next;
        });
        setSelectedNodeId(`task-${result.taskId}`);
      }
    },
    [pendingAdd, onCreateTask, cancelInlineAdd]
  );

  const rebuildGraph = useCallback(() => {
    const { nodes: flatNodes, edges: flatEdges } = flattenMindMapTree(tree, collapsedIds);

    const nodeMap = new Map<string, MindMapTreeNode>();
    const collect = (n: MindMapTreeNode) => {
      nodeMap.set(n.id, n);
      n.children.forEach(collect);
    };
    collect(tree);

    const flowNodes: Node[] = layoutWithDagre(flatNodes, flatEdges).map(node => {
      const src = nodeMap.get(node.id);
      const hasChildren = (src?.children.length ?? 0) > 0;
      const collapsed = collapsedIds.has(node.id);
      const isTask = src?.kind === 'task';
      const isList = src?.kind === 'list';
      const isRoot = src?.kind === 'root';
      const isFolder = src?.kind === 'folder';
      const listId = src?.listId ?? (isList ? src.id.replace('list-', '') : undefined);
      const taskId = src?.taskId;
      let addListId = src?.listId ?? listId ?? effectiveDefaultListId ?? undefined;
      if (isFolder && src && src.children.length > 0) {
        const firstList = src.children.find(c => c.kind === 'list');
        if (firstList?.listId) addListId = firstList.listId;
      }
      const canAdd = !!(isRoot || isList || isTask || isFolder) && !!addListId;
      const canDelete = isTask && !!taskId;
      const isPendingParent = pendingAdd?.parentNodeId === node.id;
      return {
        ...node,
        data: {
          label: node.data.label,
          kind: node.data.kind,
          statusColor: isTask && src?.status ? getStatusStyles(src.status).color : undefined,
          hasChildren,
          collapsed,
          selected: selectedNodeId === node.id,
          canAdd: canAdd && !pendingAdd,
          canDelete,
          isPendingParent,
          onToggle: hasChildren ? () => toggleCollapse(node.id) : undefined,
          onAdd:
            canAdd && addListId && !pendingAdd
              ? () => startInlineAdd(node.id, addListId, isTask ? taskId ?? null : null)
              : undefined,
          onDelete: canDelete && taskId ? () => onDeleteTask(taskId) : undefined,
          onOpen: isTask && taskId ? () => onTaskOpen(taskId) : undefined,
        },
      };
    });

    const flowEdges: Edge[] = flatEdges.map((e, i) => {
      const active =
        selectedNodeId === e.source ||
        selectedNodeId === e.target ||
        pendingAdd?.parentNodeId === e.source;
      return {
        id: `e-${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: active ? '#2563eb' : '#cbd5e1',
          strokeWidth: active ? 2 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: active ? '#2563eb' : '#cbd5e1',
          width: 16,
          height: 16,
        },
      };
    });

    if (pendingAdd) {
      const parentFlow = flowNodes.find(n => n.id === pendingAdd.parentNodeId);
      if (parentFlow) {
        const draftPos = getDraftPosition(pendingAdd.parentNodeId, parentFlow, flowNodes, flatEdges);
        flowNodes.push({
          id: DRAFT_NODE_ID,
          type: 'mindmapDraft',
          position: draftPos,
          data: {
            onSubmit: submitInlineAdd,
            onCancel: cancelInlineAdd,
          },
          draggable: false,
          selectable: false,
        });
        flowEdges.push({
          id: 'e-draft',
          source: pendingAdd.parentNodeId,
          target: DRAFT_NODE_ID,
          type: 'smoothstep',
          style: { stroke: '#2563eb', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb', width: 16, height: 16 },
        });
      }
    }

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [
    tree,
    collapsedIds,
    selectedNodeId,
    pendingAdd,
    toggleCollapse,
    setNodes,
    setEdges,
    effectiveDefaultListId,
    activeType,
    activeId,
    onDeleteTask,
    onTaskOpen,
    getStatusStyles,
    startInlineAdd,
    submitInlineAdd,
    cancelInlineAdd,
  ]);

  useEffect(() => {
    rebuildGraph();
  }, [rebuildGraph]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id === DRAFT_NODE_ID) return;
      setSelectedNodeId(node.id);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    cancelInlineAdd();
  }, [cancelInlineAdd]);

  const showEmptyHint = tree.children.length === 0;

  return (
    <div className={styles.wrapper}>
      {showEmptyHint && (
        <div className={styles.emptyHint}>
          Click <strong>+</strong> on the node to add your first task
        </div>
      )}
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnScroll
        >
          <Background color="#e2e8f0" gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={n => {
              const k = (n.data as MindMapNodeData)?.kind;
              if (k === 'root') return '#2563eb';
              if (k === 'folder') return '#f59e0b';
              if (k === 'list') return '#10b981';
              return '#94a3b8';
            }}
            maskColor="rgba(248, 250, 252, 0.85)"
            style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
