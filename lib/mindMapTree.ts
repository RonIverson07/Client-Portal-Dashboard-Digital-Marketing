export type MindMapNodeKind = 'root' | 'folder' | 'list' | 'task';

export interface MindMapTreeNode {
  id: string;
  kind: MindMapNodeKind;
  label: string;
  parentId: string | null;
  listId?: string;
  taskId?: string;
  status?: string;
  priority?: string;
  color?: string;
  children: MindMapTreeNode[];
}

interface BuildMindMapInput {
  activeType: 'space' | 'folder' | 'list';
  activeId: string;
  rootLabel: string;
  lists: { id: string; parentId: string; name: string; color?: string }[];
  folders: { id: string; spaceId: string; name: string; color?: string }[];
  tasks: {
    id: string;
    listId: string;
    title: string;
    status: string;
    priority?: string;
    parentTaskId?: string | null;
  }[];
  /** child task id → parent task id (local fallback) */
  parentOverrides?: Record<string, string>;
}

function resolveParentTaskId(
  task: BuildMindMapInput['tasks'][0],
  listTasks: BuildMindMapInput['tasks'],
  overrides?: Record<string, string>
): string | null {
  const pid = task.parentTaskId ?? overrides?.[task.id] ?? null;
  if (!pid) return null;
  const parentInList = listTasks.some(t => t.id === pid);
  return parentInList ? pid : null;
}

function buildTaskSubtree(
  tasks: BuildMindMapInput['tasks'],
  listId: string,
  parentTaskId: string | null,
  overrides?: Record<string, string>
): MindMapTreeNode[] {
  const listTasks = tasks.filter(t => t.listId === listId);
  return listTasks
    .filter(t => resolveParentTaskId(t, listTasks, overrides) === parentTaskId)
    .map(t => ({
      id: `task-${t.id}`,
      kind: 'task' as const,
      label: t.title,
      parentId: parentTaskId ? `task-${parentTaskId}` : `list-${listId}`,
      listId,
      taskId: t.id,
      status: t.status,
      priority: t.priority,
      children: buildTaskSubtree(tasks, listId, t.id, overrides),
    }));
}

function buildListNode(
  list: { id: string; name: string; color?: string },
  parentNodeId: string,
  tasks: BuildMindMapInput['tasks'],
  overrides?: Record<string, string>
): MindMapTreeNode {
  return {
    id: `list-${list.id}`,
    kind: 'list',
    label: list.name,
    parentId: parentNodeId,
    listId: list.id,
    color: list.color,
    children: buildTaskSubtree(tasks, list.id, null, overrides),
  };
}

/** Builds a hierarchical tree for the mind map from space / folder / list selection. */
export function buildMindMapTree(input: BuildMindMapInput): MindMapTreeNode {
  const { activeType, activeId, rootLabel, lists, folders, tasks, parentOverrides } = input;
  const rootId = `root-${activeId}`;

  const root: MindMapTreeNode = {
    id: rootId,
    kind: 'root',
    label: rootLabel,
    parentId: null,
    children: [],
  };

  if (activeType === 'list') {
    const list = lists.find(l => l.id === activeId);
    root.listId = list?.id ?? activeId;
    root.children = buildTaskSubtree(tasks, root.listId, null, parentOverrides);
    return root;
  }

  if (activeType === 'folder') {
    const folderLists = lists.filter(l => l.parentId === activeId);
    root.children = folderLists.map(l => buildListNode(l, rootId, tasks, parentOverrides));
    return root;
  }

  // space
  const spaceFolders = folders.filter(f => f.spaceId === activeId);
  const directLists = lists.filter(l => l.parentId === activeId);

  spaceFolders.forEach(folder => {
    const folderNode: MindMapTreeNode = {
      id: `folder-${folder.id}`,
      kind: 'folder',
      label: folder.name,
      parentId: rootId,
      color: folder.color,
      children: lists
        .filter(l => l.parentId === folder.id)
        .map(l => buildListNode(l, `folder-${folder.id}`, tasks, parentOverrides)),
    };
    root.children.push(folderNode);
  });

  directLists.forEach(l => {
    root.children.push(buildListNode(l, rootId, tasks, parentOverrides));
  });

  return root;
}

/** Flattens tree to visible nodes/edges respecting collapsed branch ids. */
export function flattenMindMapTree(
  root: MindMapTreeNode,
  collapsedIds: Set<string>
): { nodes: MindMapTreeNode[]; edges: { source: string; target: string }[] } {
  const nodes: MindMapTreeNode[] = [];
  const edges: { source: string; target: string }[] = [];

  const walk = (node: MindMapTreeNode, parentId: string | null) => {
    nodes.push(node);
    if (parentId) edges.push({ source: parentId, target: node.id });
    if (collapsedIds.has(node.id)) return;
    node.children.forEach(child => walk(child, node.id));
  };

  walk(root, null);
  return { nodes, edges };
}
