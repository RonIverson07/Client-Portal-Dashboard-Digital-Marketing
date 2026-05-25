const STORAGE_KEY = 'mind_map_task_parents';

/** Local parent links when DB has no parent_task_id column yet. */
export function loadMindMapParents(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveMindMapParent(childTaskId: string, parentTaskId: string): Record<string, string> {
  const prev = loadMindMapParents();
  const next = { ...prev, [childTaskId]: parentTaskId };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function removeMindMapParent(childTaskId: string): Record<string, string> {
  const prev = loadMindMapParents();
  const next = { ...prev };
  delete next[childTaskId];
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

/** Mind-map-only steps — hidden from list/board; never deleted by this check. */
export function isMindMapBranchTask(
  task: { id: string; parentTaskId?: string | null; is_mind_map_step?: boolean },
  parentOverrides?: Record<string, string>
): boolean {
  return !!(
    task.is_mind_map_step ||
    task.parentTaskId ||
    parentOverrides?.[task.id]
  );
}
