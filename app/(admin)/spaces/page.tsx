'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './spaces.module.css';

// Interfaces for our local structural state
interface Space { id: string; name: string; color?: string; }
interface Folder { id: string; spaceId: string; name: string; color?: string; }
interface List { id: string; parentId: string; name: string; color?: string; }
interface SpaceTask {
  id: string;
  listId: string;
  title: string;
  status: string;
  assignee?: string;
  dueDate?: string;
  startDate?: string;
  priority?: 'Urgent' | 'High' | 'Normal' | 'Low' | 'Clear';
  description?: string;
  reminder_at?: string;
}

const FOLDER_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];
const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low', 'Clear'];

const getStatusStyles = (status: string) => {
  // We normalize to handle custom renamed statuses by checking original names or using a default
  const normalized = status.toUpperCase();
  if (normalized.includes('TODO') || normalized.includes('DO')) return { color: '#64748b', bg: '#f1f5f9' };
  if (normalized.includes('PLAN')) return { color: '#8b5cf6', bg: '#f5f3ff' };
  if (normalized.includes('PROGRESS')) return { color: '#3b82f6', bg: '#eff6ff' };
  if (normalized.includes('RISK')) return { color: '#f59e0b', bg: '#fffbeb' };
  if (normalized.includes('UPDATE') || normalized.includes('REQ')) return { color: '#d97706', bg: '#fefce8' };
  if (normalized.includes('HOLD')) return { color: '#92400e', bg: '#fff7ed' };
  if (normalized.includes('COMPLETE') || normalized.includes('DONE')) return { color: '#10b981', bg: '#ecfdf5' };
  if (normalized.includes('CANCEL')) return { color: '#ef4444', bg: '#fef2f2' };
  return { color: '#64748b', bg: '#f1f5f9' };
};

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<SpaceTask[]>([]);
  const [statuses, setStatuses] = useState(['TO DO', 'PLANNING', 'IN PROGRESS', 'AT RISK', 'UPDATE REQUIRED', 'ON HOLD', 'COMPLETE', 'CANCELLED']);

  // Selection state
  const [activeItem, setActiveItem] = useState<{ type: 'space' | 'folder' | 'list', id: string } | null>(null);
  const [activeView, setActiveView] = useState<'board' | 'list' | 'calendar' | 'gantt' | 'table' | 'dashboard' | 'activity' | 'workload' | 'inbox'>('list');
  const [pinnedViews, setPinnedViews] = useState<string[]>(['list', 'board', 'calendar', 'gantt', 'table', 'dashboard', 'activity', 'workload', 'inbox']);
  const [pinnedViewIds, setPinnedViewIds] = useState<string[]>([]);
  const [draggedView, setDraggedView] = useState<string | null>(null);
  const [isAddViewDropdownOpen, setIsAddViewDropdownOpen] = useState(false);
  const [viewContextMenu, setViewContextMenu] = useState<{ x: number, y: number, view: string } | null>(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day'>('month');
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const addViewBtnRef = useRef<HTMLButtonElement>(null);
  const [addViewDropdownPos, setAddViewDropdownPos] = useState<{ top: number; right: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'space' | 'folder' | 'list' | 'statusGroup' | 'task', id: string, extra?: any } | null>(null);
  const [activeSubMenu, setActiveSubMenu] = useState<'remind' | null>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  // Unified View Persistence
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem('spaces_view_config');
      if (savedSettings) {
        try {
          const config = JSON.parse(savedSettings);
          if (config.pinnedViews) setPinnedViews(config.pinnedViews);
          if (config.pinnedViewIds) setPinnedViewIds(config.pinnedViewIds);
          if (config.activeView) setActiveView(config.activeView);
        } catch (e) {
          console.error('Failed to load view config', e);
        }
      }
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (isHydrated && typeof window !== 'undefined') {
      const config = { pinnedViews, pinnedViewIds, activeView };
      localStorage.setItem('spaces_view_config', JSON.stringify(config));
    }
  }, [pinnedViews, pinnedViewIds, activeView, isHydrated]);

  // Handle clicks outside to close dropdowns/menus
  useEffect(() => {
    const handleClickOutside = () => {
      setViewContextMenu(null);
      setIsAddViewDropdownOpen(false);
      setIsViewDropdownOpen(false);
    };

    if (viewContextMenu || isAddViewDropdownOpen || isViewDropdownOpen) {
      // Use setTimeout so the current click event finishes before we attach
      const timer = setTimeout(() => {
        window.addEventListener('click', handleClickOutside, { once: true });
      }, 0);
      return () => { clearTimeout(timer); window.removeEventListener('click', handleClickOutside); };
    }
    return undefined;
  }, [viewContextMenu, isAddViewDropdownOpen, isViewDropdownOpen]);

  // Close task context menu on any click anywhere (capture phase bypasses stopPropagation)
  useEffect(() => {
    if (!contextMenu) return;
    const closeOnClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(`.${styles.contextMenu}`)) return;
      setContextMenu(null);
    };
    const timer = setTimeout(() => {
      window.addEventListener('click', closeOnClick, { capture: true });
    }, 0);
    return () => { clearTimeout(timer); window.removeEventListener('click', closeOnClick, { capture: true }); };
  }, [contextMenu]);

  // Close all popups on view or selection change
  useEffect(() => {
    setViewContextMenu(null);
    setIsAddViewDropdownOpen(false);
    setIsViewDropdownOpen(false);
    setContextMenu(null);
  }, [activeView, activeItem]);

  // Load from database on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [hierarchyRes, tasksRes] = await Promise.all([
        fetch('/api/admin/spaces'),
        fetch('/api/admin/project-tasks')
      ]);

      if (hierarchyRes.ok && tasksRes.ok) {
        const hierarchy = await hierarchyRes.json();
        const taskData = await tasksRes.json();

        setSpaces(hierarchy.spaces || []);

        // Map snake_case to camelCase
        const mappedFolders = (hierarchy.folders || []).map((f: any) => ({
          ...f,
          spaceId: f.space_id
        }));
        setFolders(mappedFolders);

        const mappedLists = (hierarchy.lists || []).map((l: any) => ({
          ...l,
          parentId: l.parent_id
        }));
        setLists(mappedLists);

        const mappedTasks = (taskData.tasks || []).map((t: any) => ({
          ...t,
          listId: t.list_id,
          dueDate: t.due_date,
          startDate: t.start_date
        }));
        setTasks(mappedTasks);

        // Auto-select first list if nothing selected
        if (!activeItem && mappedLists.length > 0) {
          setActiveItem({ type: 'list', id: mappedLists[0].id });
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const formatDateForInput = (dateStr: string) => {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'Space' | 'Folder' | 'List' | 'Task' | 'Rename' | 'Delete' | 'Move' | 'Color';
    targetId?: string;
    targetType?: 'space' | 'folder' | 'list' | 'statusGroup' | 'task';
    inputValue: string;
    moveTargetId?: string;
    description: string;
    assignee: string;
    dueDate: string;
    startDate: string;
    priority: 'Urgent' | 'High' | 'Normal' | 'Low' | 'Clear';
  }>({
    isOpen: false,
    type: 'Space',
    inputValue: '',
    description: '',
    assignee: '',
    dueDate: '',
    startDate: '',
    priority: 'Normal',
  });

  const openModal = (type: 'Space' | 'Folder' | 'List' | 'Task' | 'Rename' | 'Delete' | 'Move' | 'Color', targetId?: string, targetType?: 'space' | 'folder' | 'list' | 'statusGroup' | 'task', initialValue: string = '', initialData: any = {}) => {
    setModalConfig({
      isOpen: true,
      type,
      targetId,
      targetType,
      inputValue: initialValue,
      moveTargetId: '',
      description: initialData.description || '',
      assignee: initialData.assignee || '',
      dueDate: formatDateForInput(initialData.dueDate),
      startDate: formatDateForInput(initialData.startDate),
      priority: initialData.priority || 'Normal',
    });
  };

  const closeModal = () => {
    setModalConfig({ ...modalConfig, isOpen: false });
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { type, targetId, targetType, inputValue, moveTargetId, description, assignee, dueDate, startDate, priority } = modalConfig;

    try {
      if (type === 'Delete' && targetId && targetType) {
        const url = targetType === 'task' ? `/api/admin/project-tasks?id=${targetId}` : `/api/admin/spaces?id=${targetId}&type=${targetType}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (res.ok) {
          performDelete(targetType, targetId);
          closeModal();
        } else {
          const err = await res.json();
          console.error('Delete failed:', err);
          alert(`Failed to delete: ${err.error || 'Unknown error'}`);
        }
        return;
      }

      if (type === 'Move' && targetId && targetType && moveTargetId) {
        const url = targetType === 'task' ? '/api/admin/project-tasks' : '/api/admin/spaces';
        const res = await fetch(url, {
          method: 'PATCH',
          body: JSON.stringify({ type: targetType, id: targetId, parent_id: moveTargetId, list_id: moveTargetId })
        });
        if (res.ok) {
          const updated = await res.json();
          if (targetType === 'list') setLists(lists.map(l => l.id === targetId ? updated : l));
          else if (targetType === 'task') setTasks(tasks.map(t => t.id === targetId ? updated : t));
          closeModal();
        }
        return;
      }

      if (type === 'Space') {
        const res = await fetch('/api/admin/spaces', {
          method: 'POST',
          body: JSON.stringify({ type: 'space', name: inputValue })
        });
        if (res.ok) {
          const newItem = await res.json();
          setSpaces([...spaces, newItem]);
        }
      } else if (type === 'Folder' && targetId) {
        const res = await fetch('/api/admin/spaces', {
          method: 'POST',
          body: JSON.stringify({ type: 'folder', space_id: targetId, name: inputValue, color: FOLDER_COLORS[0] })
        });
        if (res.ok) {
          const newItem = await res.json();
          setFolders([...folders, { ...newItem, spaceId: newItem.space_id }]);
        }
      } else if (type === 'List' && targetId) {
        const res = await fetch('/api/admin/spaces', {
          method: 'POST',
          body: JSON.stringify({ type: 'list', parent_id: targetId, name: inputValue })
        });
        if (res.ok) {
          const newItem = await res.json();
          setLists([...lists, { ...newItem, parentId: newItem.parent_id }]);
        }
      } else if (type === 'Task' && targetId) {
        let actualListId = targetId;
        const isList = lists.some(l => l.id === targetId);

        if (!isList) {
          // Auto-create a list if adding to Folder/Space directly
          const lRes = await fetch('/api/admin/spaces', {
            method: 'POST',
            body: JSON.stringify({ type: 'list', parent_id: targetId, name: 'General' })
          });
          if (lRes.ok) {
            const newList = await lRes.json();
            const mappedList = { ...newList, parentId: newList.parent_id };
            setLists(prev => [...prev, mappedList]);
            actualListId = newList.id;
          } else {
            return;
          }
        }

        const res = await fetch('/api/admin/project-tasks', {
          method: 'POST',
          body: JSON.stringify({
            list_id: actualListId,
            title: inputValue,
            status: 'TO DO',
            description,
            assignee,
            due_date: dueDate || null,
            start_date: startDate || null,
            priority
          })
        });
        if (res.ok) {
          const newItem = await res.json();
          setTasks([...tasks, { ...newItem, listId: newItem.list_id, dueDate: newItem.due_date, startDate: newItem.start_date }]);
        }
      } else if (type === 'Rename' && targetId && targetType) {
        const url = targetType === 'task' ? '/api/admin/project-tasks' : '/api/admin/spaces';
        const body: any = { id: targetId, type: targetType };
        if (targetType === 'task') {
          body.title = inputValue;
          body.description = description;
          body.assignee = assignee;
          body.due_date = dueDate || null;
          body.start_date = startDate || null;
          body.priority = priority;
        } else {
          body.name = inputValue;
        }
        const res = await fetch(url, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        if (res.ok) {
          const updated = await res.json();
          if (targetType === 'space') setSpaces(spaces.map(s => s.id === targetId ? updated : s));
          else if (targetType === 'folder') setFolders(folders.map(f => f.id === targetId ? { ...updated, spaceId: updated.space_id } : f));
          else if (targetType === 'list') setLists(lists.map(l => l.id === targetId ? { ...updated, parentId: updated.parent_id } : l));
          else if (targetType === 'task') setTasks(tasks.map(t => t.id === targetId ? { ...updated, listId: updated.list_id, dueDate: updated.due_date, startDate: updated.start_date } : t));
        }
      }
      closeModal();
    } catch (e) {
      console.error('Modal submit error:', e);
    }
  };

  const performDelete = (type: 'space' | 'folder' | 'list' | 'statusGroup' | 'task', id: string) => {
    if (type === 'space') {
      setSpaces(spaces.filter(s => s.id !== id));
      setFolders(folders.filter(f => f.spaceId !== id));
      setLists(lists.filter(l => l.parentId !== id));
    } else if (type === 'folder') {
      setFolders(folders.filter(f => f.id !== id));
      setLists(lists.filter(l => l.parentId !== id));
    } else if (type === 'list') {
      setLists(lists.filter(l => l.id !== id));
      setTasks(tasks.filter(t => t.listId !== id));
    } else if (type === 'task') {
      setTasks(tasks.filter(t => t.id !== id));
    }
    if (activeItem?.id === id) setActiveItem(null);
  };

  const addSpace = () => openModal('Space');
  const addFolder = (spaceId: string) => openModal('Folder', spaceId);
  const addList = (parentId: string) => openModal('List', parentId);

  const addTask = (listId: string) => openModal('Task', listId);

  const performDuplicate = async (type: 'space' | 'folder' | 'list', id: string) => {
    try {
      const res = await fetch('/api/admin/spaces', {
        method: 'POST',
        body: JSON.stringify({ type: 'duplicate', itemType: type, id })
      });
      if (res.ok) {
        fetchData(); // Refresh everything from DB to get the new items
      }
    } catch (e) { console.error(e); }
  };

  const duplicateTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    try {
      const res = await fetch('/api/admin/project-tasks', {
        method: 'POST',
        body: JSON.stringify({
          list_id: task.listId,
          title: `${task.title} (Copy)`,
          status: task.status,
          description: task.description || '',
          assignee: task.assignee || '',
          due_date: task.dueDate || null,
          start_date: task.startDate || null,
          priority: task.priority || 'Normal'
        })
      });
      if (res.ok) {
        const newItem = await res.json();
        setTasks(prev => [...prev, { ...newItem, listId: newItem.list_id, dueDate: newItem.due_date, startDate: newItem.start_date }]);
      }
    } catch (e) { console.error(e); }
  };

  const updateItemColor = async (id: string, type: 'space' | 'folder' | 'list' | 'statusGroup' | 'task', color: string) => {
    try {
      const res = await fetch('/api/admin/spaces', {
        method: 'PATCH',
        body: JSON.stringify({ type, id, color })
      });
      if (res.ok) {
        const updated = await res.json();
        if (type === 'space') setSpaces(spaces.map(s => s.id === id ? updated : s));
        else if (type === 'folder') setFolders(folders.map(f => f.id === id ? { ...updated, spaceId: updated.space_id } : f));
        else if (type === 'list') setLists(lists.map(l => l.id === id ? { ...updated, parentId: updated.parent_id } : l));
      }
      closeModal();
    } catch (e) { console.error(e); }
  };

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTaskId(id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    if (!draggedTaskId) return;

    // 1. Optimistic UI update
    setTasks(prev => prev.map(t => t.id === draggedTaskId ? { ...t, status: newStatus } : t));

    // 2. Persist to DB
    try {
      const res = await fetch('/api/admin/project-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draggedTaskId, status: newStatus })
      });
      if (!res.ok) throw new Error('DB update failed');
    } catch (err) {
      console.error('Board sync error:', err);
      // Optional: Rollback if needed, but let's keep it simple for now
    }

    setDraggedTaskId(null);
  };

  // Expand/Collapse State
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedItems(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));
  };

  const isExpanded = (id: string) => expandedItems[id] !== false;

  const setTaskReminder = async (taskId: string, date: Date) => {
    const reminderAt = date.toISOString();
    const res = await fetch('/api/admin/project-tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, reminder_at: reminderAt })
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks(tasks.map(t => t.id === taskId ? updated : t));
    } else {
      const err = await res.json();
      console.error('Failed to set reminder:', err);
      alert('Error: Could not save reminder. Please ensure the "reminder_at" column exists in your database.');
    }
  };

  // Context Menu Handlers

  const handleContextMenu = (e: React.MouseEvent, type: 'space' | 'folder' | 'list' | 'statusGroup' | 'task', id: string, extra?: any) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('ContextMenu Triggered:', type, id);
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, extra });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setActiveSubMenu(null);
  };

  const [collapsedStatuses, setCollapsedStatuses] = useState<Record<string, boolean>>({});
  const toggleStatusCollapse = (status: string) => {
    setCollapsedStatuses(prev => ({ ...prev, [status]: !prev[status] }));
  };

  // Get current tasks to display
  let currentTasks: SpaceTask[] = [];

  if (activeItem) {
    if (activeItem.type === 'list') {
      currentTasks = tasks.filter(t => t.listId === activeItem.id);
    } else if (activeItem.type === 'folder') {
      const folderLists = lists.filter(l => l.parentId === activeItem.id).map(l => l.id);
      currentTasks = tasks.filter(t => folderLists.includes(t.listId));
    } else if (activeItem.type === 'space') {
      const spaceFolders = folders.filter(f => f.spaceId === activeItem.id).map(f => f.id);
      const spaceLists = lists.filter(l => l.parentId === activeItem.id || spaceFolders.includes(l.parentId)).map(l => l.id);
      currentTasks = tasks.filter(t => spaceLists.includes(t.listId));
    }
  }

  // Icons
  const IconSpace = ({ color = '#10b981' }: { color?: string }) => <svg width="12" height="12" viewBox="0 0 24 24" fill={color} style={{ borderRadius: '2px' }}><rect width="24" height="24" rx="4" /></svg>;
  const IconFolder = ({ color = '#f59e0b' }: { color?: string }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill={color} fillOpacity="0.1" /></svg>;
  const IconList = ({ color = '#94a3b8' }: { color?: string }) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;

  const getItemName = (type: string, id: string) => {
    if (type === 'space') return spaces.find(s => s.id === id)?.name || '';
    if (type === 'folder') return folders.find(f => f.id === id)?.name || '';
    if (type === 'list') return lists.find(l => l.id === id)?.name || '';
    return '';
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  return (
    <main className={styles.main} onClick={() => { setIsViewDropdownOpen(false); setIsAddViewDropdownOpen(false); setViewContextMenu(null); setContextMenu(null); }}>
      <div className={styles.content}>

        {/* Hierarchical Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            Spaces
            <button className={styles.addBtn} onClick={addSpace} title="Add Space">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>

          <div className={styles.hierarchyList}>
            {spaces.map(space => (
              <div key={space.id}>
                {/* Space Row */}
                <div
                  className={`${styles.treeItem} ${activeItem?.id === space.id ? styles.treeItemActive : ''}`}
                  onClick={() => setActiveItem({ type: 'space', id: space.id })}
                  onContextMenu={(e) => handleContextMenu(e, 'space', space.id)}
                >
                  <button className={styles.chevronBtn} onClick={(e) => toggleExpand(e, space.id)}>
                    {isExpanded(space.id) ? '▼' : '▶'}
                  </button>
                  <div className={styles.treeIcon}><IconSpace color={space.color} /></div>
                  <div style={{ flex: 1 }}>{space.name}</div>
                  <button className={styles.addBtn} onClick={(e) => { e.stopPropagation(); addFolder(space.id); }} title="Add Folder">+</button>
                </div>

                {isExpanded(space.id) && (
                  <>
                    {/* Folders in Space */}
                    {folders.filter(f => f.spaceId === space.id).map(folder => (
                      <div key={folder.id}>
                        <div
                          className={`${styles.treeItem} ${styles.indentLevel1} ${activeItem?.id === folder.id ? styles.treeItemActive : ''}`}
                          onClick={() => setActiveItem({ type: 'folder', id: folder.id })}
                          onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}
                        >
                          <button className={styles.chevronBtn} onClick={(e) => toggleExpand(e, folder.id)}>
                            {isExpanded(folder.id) ? '▼' : '▶'}
                          </button>
                          <div className={styles.treeIcon}><IconFolder color={folder.color} /></div>
                          <div style={{ flex: 1 }}>{folder.name}</div>
                          <button className={styles.addBtn} onClick={(e) => { e.stopPropagation(); addList(folder.id); }} title="Add List">+</button>
                        </div>

                        {isExpanded(folder.id) && (
                          <>
                            {/* Lists in Folder */}
                            {lists.filter(l => l.parentId === folder.id).map(list => (
                              <div
                                key={list.id}
                                className={`${styles.treeItem} ${styles.indentLevel2} ${activeItem?.id === list.id ? styles.treeItemActive : ''}`}
                                onClick={() => setActiveItem({ type: 'list', id: list.id })}
                                onContextMenu={(e) => handleContextMenu(e, 'list', list.id)}
                              >
                                <div className={styles.treeIcon} style={{ marginLeft: '24px' }}><IconList color={list.color} /></div>
                                <div>{list.name}</div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    ))}

                    {/* Independent Lists in Space */}
                    {lists.filter(l => l.parentId === space.id).map(list => (
                      <div
                        key={list.id}
                        className={`${styles.treeItem} ${styles.indentLevel1} ${activeItem?.id === list.id ? styles.treeItemActive : ''}`}
                        onClick={() => setActiveItem({ type: 'list', id: list.id })}
                        onContextMenu={(e) => handleContextMenu(e, 'list', list.id)}
                      >
                        <div className={styles.treeIcon} style={{ marginLeft: '24px' }}><IconList color={list.color} /></div>
                        <div>{list.name}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className={styles.mainPane}>
          <div className={styles.mainHeader}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
                  {activeItem?.type === 'list' ? lists.find(l => l.id === activeItem.id)?.name :
                    activeItem?.type === 'folder' ? folders.find(f => f.id === activeItem.id)?.name :
                      activeItem?.type === 'space' ? spaces.find(s => s.id === activeItem.id)?.name : 'Overview'}
                </div>
              </div>

              {/* Notification Bell */}
              <div style={{ position: 'relative' }}>
                <button
                  className={styles.notificationBtn}
                  onClick={(e) => { e.stopPropagation(); setIsNotificationOpen(!isNotificationOpen); }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                  {tasks.filter(t => t.reminder_at).length > 0 && (
                    <span className={styles.notificationBadge}>{tasks.filter(t => t.reminder_at).length}</span>
                  )}
                </button>

                {isNotificationOpen && (
                  <div className={styles.notificationDropdown} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.notificationDropdownHeader}>
                      <span>Notifications</span>
                      <button onClick={() => setIsNotificationOpen(false)}>✕</button>
                    </div>
                    <div className={styles.notificationDropdownList}>
                      {tasks.filter(t => t.reminder_at).length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                          No new notifications
                        </div>
                      ) : (
                        tasks.filter(t => t.reminder_at).slice(0, 5).map(task => (
                          <div key={task.id} className={styles.notificationSmallItem} onClick={() => { setActiveView('inbox'); setIsNotificationOpen(false); }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{task.title}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Reminder for: {new Date(task.reminder_at!).toLocaleDateString()}</div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className={styles.notificationDropdownFooter}>
                      <button onClick={() => { setActiveView('inbox'); setIsNotificationOpen(false); }}>View All in Inbox</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {activeItem && (
              <div className={styles.viewTabs} style={{ marginTop: 'auto', marginBottom: '-1px' }}>
                <div className={styles.tabsScrollArea}>
                  {pinnedViews.map(view => {
                    const isPinned = pinnedViewIds.includes(view);

                    const icon = view === 'list' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg> :
                      view === 'board' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg> :
                        view === 'calendar' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> :
                          view === 'gantt' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><path d="M3 7h18M3 12h10M3 17h14" /></svg> :
                            view === 'activity' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> :
                              view === 'workload' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><path d="M4 10h16" /><path d="M10 4v16" /></svg> :
                                view === 'inbox' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg> :
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>;

                    const label = view.charAt(0).toUpperCase() + view.slice(1);

                    return (
                      <button
                        key={view}
                        draggable
                        className={`${styles.tabBtn} ${activeView === view ? styles.tabActive : ''}`}
                        onClick={() => setActiveView(view as any)}
                        onContextMenu={(e) => { e.preventDefault(); setViewContextMenu({ x: e.clientX, y: e.clientY, view }); }}
                        onDragStart={(e) => { setDraggedView(view); e.dataTransfer.setData('view', view); }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const sourceView = e.dataTransfer.getData('view') || draggedView;
                          if (!sourceView || sourceView === view) return;

                          const newPinned = [...pinnedViews];
                          const sourceIdx = newPinned.indexOf(sourceView);
                          const targetIdx = newPinned.indexOf(view);

                          newPinned.splice(sourceIdx, 1);
                          newPinned.splice(targetIdx, 0, sourceView);

                          setPinnedViews(newPinned);
                          setDraggedView(null);
                        }}
                        style={{ position: 'relative', cursor: 'grab' }}
                      >
                        {icon}
                        {label}
                        {isPinned && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="#f59e0b" style={{ marginLeft: '4px', marginTop: '-6px' }}>
                            <path d="M12 2L15 8L22 9L17 14L18 21L12 17L6 21L7 14L2 9L9 8L12 2Z" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>

                {activeView !== 'gantt' && activeView !== 'board' && (
                  <div className={styles.headerActions}>
                    <div className={styles.addViewContainer}>
                      <button ref={addViewBtnRef} className={styles.addViewBtn} onClick={(e) => {
                        e.stopPropagation();
                        if (!isAddViewDropdownOpen && addViewBtnRef.current) {
                          const rect = addViewBtnRef.current.getBoundingClientRect();
                          setAddViewDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                        }
                        setIsAddViewDropdownOpen(!isAddViewDropdownOpen);
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        View
                      </button>

                      {isAddViewDropdownOpen && addViewDropdownPos && (
                        <div className={styles.addViewDropdown} style={{ position: 'fixed', top: addViewDropdownPos.top, right: addViewDropdownPos.right }} onClick={e => e.stopPropagation()}>
                          <div className={styles.addViewSection}>
                            <div className={styles.addViewSectionHeader}>Popular</div>
                            <div className={styles.addViewGrid}>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('list'); setPinnedViews(prev => prev.includes('list') ? prev : [...prev, 'list']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#f1f5f9', color: '#64748b' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>List</div>
                                  <div className={styles.addViewSub}>Track tasks, bugs, people & more</div>
                                </div>
                              </div>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('calendar'); setPinnedViews(prev => prev.includes('calendar') ? prev : [...prev, 'calendar']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#fff7ed', color: '#f97316' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Calendar</div>
                                  <div className={styles.addViewSub}>Plan, schedule, & delegate</div>
                                </div>
                              </div>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('board'); setPinnedViews(prev => prev.includes('board') ? prev : [...prev, 'board']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#eff6ff', color: '#2563eb' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Board - Kanban</div>
                                  <div className={styles.addViewSub}>Move tasks between columns</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className={styles.addViewSection}>
                            <div className={styles.addViewSectionHeader}>More views</div>
                            <div className={styles.addViewGrid}>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('gantt'); setPinnedViews(prev => prev.includes('gantt') ? prev : [...prev, 'gantt']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#fef2f2', color: '#ef4444' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18M3 12h10M3 17h14" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Gantt</div>
                                  <div className={styles.addViewSub}>Plan dependencies & time</div>
                                </div>
                              </div>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('table'); setPinnedViews(prev => prev.includes('table') ? prev : [...prev, 'table']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#ecfdf5', color: '#10b981' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Table</div>
                                  <div className={styles.addViewSub}>Structured table format</div>
                                </div>
                              </div>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('dashboard'); setPinnedViews(prev => prev.includes('dashboard') ? prev : [...prev, 'dashboard']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><path d="M3 9h18" /><path d="M9 21V9" /><path d="M15 21V9" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Dashboard</div>
                                  <div className={styles.addViewSub}>Visual overview & reporting</div>
                                </div>
                              </div>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('activity'); setPinnedViews(prev => prev.includes('activity') ? prev : [...prev, 'activity']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#f8fafc', color: '#0f172a' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Activity</div>
                                  <div className={styles.addViewSub}>Track team updates & logs</div>
                                </div>
                              </div>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('workload'); setPinnedViews(prev => prev.includes('workload') ? prev : [...prev, 'workload']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#ecfdf5', color: '#10b981' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><path d="M4 10h16" /><path d="M10 4v16" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Workload</div>
                                  <div className={styles.addViewSub}>Manage team capacity</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Add Task button */}
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ marginLeft: '24px', borderRadius: '6px', fontWeight: 600 }}
                      onClick={() => {
                        let targetId = activeItem.id;
                        if (activeItem.type !== 'list') {
                          // Try to find an existing list first
                          const existingList = lists.find(l => l.parentId === activeItem.id);
                          if (existingList) targetId = existingList.id;
                          else if (activeItem.type === 'space') {
                            const sf = folders.filter(f => f.spaceId === activeItem.id);
                            for (const f of sf) {
                              const fl = lists.find(l => l.parentId === f.id);
                              if (fl) { targetId = fl.id; break; }
                            }
                          }
                        }
                        addTask(targetId);
                      }}
                    >
                      + Add Task
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={styles.dataArea} style={{ padding: '24px' }}>
            {activeItem && activeView === 'board' && (
              <div className={styles.boardContainer}>
                {statuses.map(status => {
                  const colTasks = currentTasks.filter(t => t.status === status);
                  const { color: statusColor, bg: statusBg } = getStatusStyles(status);

                  const isCollapsed = collapsedStatuses[status];

                  return (
                    <div
                      key={status}
                      className={`${styles.boardColumn} ${isCollapsed ? styles.boardColumnCollapsed : ''}`}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, status)}
                      onClick={() => isCollapsed && toggleStatusCollapse(status)}
                      style={{ cursor: isCollapsed ? 'pointer' : 'default' }}
                    >
                      <div className={styles.columnHeader} style={{ background: statusBg, color: statusColor }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <div className={styles.statusIconCircle} style={{ width: '10px', height: '10px', borderWidth: '1.5px', borderColor: statusColor, marginRight: '6px' }}></div>
                          {status}
                          {!isCollapsed && <span className={styles.statusCount} style={{ fontSize: '10px' }}>{colTasks.length}</span>}
                        </div>
                        {!isCollapsed && <button className={styles.addBtn} style={{ padding: '0 4px', fontSize: '16px' }} onClick={(e) => { e.stopPropagation(); handleContextMenu(e, 'statusGroup', status); }}>⋯</button>}
                      </div>

                      {colTasks.map(task => (
                        <div
                          key={task.id}
                          className={styles.taskCard}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onContextMenu={(e) => handleContextMenu(e, 'task', task.id)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>{task.title}</div>
                            <button className={styles.addBtn} style={{ padding: '0 4px', fontSize: '16px', marginTop: '-4px' }} onClick={(e) => { e.stopPropagation(); handleContextMenu(e, 'task', task.id); }}>⋯</button>
                          </div>

                          <div className={styles.cardFooter}>
                            <div className={styles.cardFooterIcon} title="Assignee" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>{task.assignee || 'Unassigned'}</span>
                            </div>

                            {task.dueDate && (
                              <div className={styles.cardFooterIcon} title="Due Date">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                {task.dueDate}
                              </div>
                            )}

                            <div className={styles.cardFooterIcon} title="Priority">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={task.priority === 'Urgent' ? '#ef4444' : task.priority === 'High' ? '#f59e0b' : '#3b82f6'} strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                            </div>
                          </div>
                        </div>
                      ))}

                      {(() => {
                        let targetListId = '';
                        if (activeItem.type === 'list') targetListId = activeItem.id;
                        else if (activeItem.type === 'folder') targetListId = lists.find(l => l.parentId === activeItem.id)?.id || '';
                        else if (activeItem.type === 'space') {
                          targetListId = lists.find(l => l.parentId === activeItem.id)?.id || '';
                          if (!targetListId) {
                            const sf = folders.filter(f => f.spaceId === activeItem.id);
                            for (const f of sf) {
                              const fl = lists.find(l => l.parentId === f.id);
                              if (fl) { targetListId = fl.id; break; }
                            }
                          }
                        }

                        return targetListId && status === 'TO DO' ? (
                          <div className={styles.boardAddTask} onClick={() => addTask(targetListId)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Add Task
                          </div>
                        ) : null;
                      })()}
                    </div>
                  );
                })}
              </div>
            )}

            {activeItem && activeView === 'list' && (
              <div className={styles.listViewContainer}>
                {statuses.map(status => {
                  const colTasks = currentTasks.filter(t => t.status === status);
                  const { color: statusColor, bg: statusBg } = getStatusStyles(status);

                  return (
                    <div key={status} className={styles.statusGroup}>
                      <div className={styles.statusGroupHeader} style={{ background: statusBg, color: statusColor }}>
                        {status}
                        <span className={styles.statusCount}>{colTasks.length}</span>
                      </div>

                      <div className={styles.listViewHeader}>
                        <div>Name</div>
                        <div>Assignee</div>
                        <div>Due Date</div>
                        <div>Priority</div>
                        <div></div>
                      </div>

                      {colTasks.map(task => (
                        <div key={task.id} className={styles.listRow}>
                          <div className={styles.taskNameCell} onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}>
                            <div className={styles.statusIconCircle} style={{ borderColor: statusColor }} onClick={(e) => { e.stopPropagation(); handleContextMenu(e, 'statusGroup', task.id); }}>
                              {status === 'COMPLETE' && <svg width="8" height="8" viewBox="0 0 24 24" fill={statusColor}><path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z" /></svg>}
                            </div>
                            <span style={{ color: status === 'COMPLETE' ? '#94a3b8' : 'inherit', textDecoration: status === 'COMPLETE' ? 'line-through' : 'none' }}>
                              {task.title}
                            </span>
                          </div>

                          <div className={styles.cellIcon} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                            <span style={{ fontSize: '13px', color: '#64748b' }}>{task.assignee || 'Unassigned'}</span>
                          </div>

                          <div className={styles.cellIcon} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            {task.dueDate || '-'}
                          </div>

                          <div className={styles.cellIcon} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill={task.priority === 'Urgent' ? '#ef4444' : 'none'} stroke={task.priority === 'Urgent' ? '#ef4444' : task.priority === 'High' ? '#f59e0b' : '#3b82f6'} strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                            {task.priority === 'Urgent' ? (
                              <span style={{ color: '#ef4444', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>Urgent</span>
                            ) : (
                              <span style={{ color: task.priority === 'High' ? '#f59e0b' : '#3b82f6', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{task.priority}</span>
                            )}
                          </div>

                          <div className={styles.cellIcon}>
                            <button className={styles.addBtn} style={{ padding: '0 4px', fontSize: '16px' }} onClick={(e) => { e.stopPropagation(); handleContextMenu(e, 'task', task.id); }}>⋯</button>
                          </div>
                        </div>
                      ))}

                      {(() => {
                        let targetListId = '';
                        if (activeItem.type === 'list') targetListId = activeItem.id;
                        else if (activeItem.type === 'folder') targetListId = lists.find(l => l.parentId === activeItem.id)?.id || '';
                        else if (activeItem.type === 'space') {
                          targetListId = lists.find(l => l.parentId === activeItem.id)?.id || '';
                          if (!targetListId) {
                            const sf = folders.filter(f => f.spaceId === activeItem.id);
                            for (const f of sf) {
                              const fl = lists.find(l => l.parentId === f.id);
                              if (fl) { targetListId = fl.id; break; }
                            }
                          }
                        }

                        return targetListId && status === 'TO DO' ? (
                          <div className={styles.addTaskRow} onClick={() => addTask(targetListId)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Add Task
                          </div>
                        ) : null;
                      })()}
                    </div>
                  );
                })}
              </div>
            )}

            {activeItem && activeView === 'calendar' && (
              <div className={styles.calendarContainer}>
                <div className={styles.calendarHeader}>
                  <div className={styles.calendarHeaderLeft}>

                    <div className={styles.viewDropdownContainer}>
                      <button
                        className={styles.viewDropdownBtn}
                        onClick={(e) => { e.stopPropagation(); setIsViewDropdownOpen(!isViewDropdownOpen); }}
                      >
                        {calendarView.charAt(0).toUpperCase() + calendarView.slice(1)}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '4px' }}>
                          <path d={isViewDropdownOpen ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} />
                        </svg>
                      </button>

                      {isViewDropdownOpen && (
                        <div className={styles.viewDropdown}>
                          <div className={styles.viewDropdownItem} onClick={(e) => { e.stopPropagation(); setCalendarView('month'); setIsViewDropdownOpen(false); }}>Month</div>
                          <div className={styles.viewDropdownItem} onClick={(e) => { e.stopPropagation(); setCalendarView('week'); setIsViewDropdownOpen(false); }}>Week</div>
                          <div className={styles.viewDropdownItem} onClick={(e) => { e.stopPropagation(); setCalendarView('day'); setIsViewDropdownOpen(false); }}>Day</div>
                        </div>
                      )}
                    </div>
                    <div className={styles.dateNav}>
                      <button className={styles.navBtn} onClick={() => {
                        if (calendarView === 'month') setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
                        else if (calendarView === 'week') setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - 7));
                        else setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - 1));
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                      </button>
                      <button className={styles.navBtn} onClick={() => {
                        if (calendarView === 'month') setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
                        else if (calendarView === 'week') setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() + 7));
                        else setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() + 1));
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                      </button>
                    </div>
                    <div className={styles.currentMonth}>
                      {(() => {
                        if (calendarView === 'month') return viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });
                        if (calendarView === 'week') {
                          const start = new Date(viewDate); start.setDate(viewDate.getDate() - viewDate.getDay());
                          const end = new Date(start); end.setDate(start.getDate() + 6);
                          return `${start.toLocaleDateString('default', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                        }
                        return viewDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                      })()}
                    </div>
                  </div>
                </div>

                <div className={styles.calendarBody}>
                  {calendarView === 'month' ? (
                    <div className={styles.calendarGrid}>
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className={styles.weekdayHeader}>{day}</div>
                      ))}

                      {(() => {
                        const days = [];
                        const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
                        const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
                        const startDay = startOfMonth.getDay();

                        for (let i = startDay - 1; i >= 0; i--) {
                          const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), -i);
                          days.push({ date: d, isCurrentMonth: false });
                        }

                        for (let i = 1; i <= endOfMonth.getDate(); i++) {
                          const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), i);
                          days.push({ date: d, isCurrentMonth: true });
                        }

                        const remaining = 42 - days.length;
                        for (let i = 1; i <= remaining; i++) {
                          const d = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, i);
                          days.push({ date: d, isCurrentMonth: false });
                        }

                        return days.map((dayObj, idx) => {
                          const dateStr = dayObj.date.toISOString().split('T')[0];
                          const dayTasks = currentTasks.filter(t => t.dueDate === dateStr);
                          const isToday = new Date().toDateString() === dayObj.date.toDateString();

                          return (
                            <div key={idx} className={`${styles.calendarDay} ${!dayObj.isCurrentMonth ? styles.otherMonth : ''} ${isToday ? styles.todayDay : ''}`}>
                              <div className={styles.dayLabel}>{dayObj.date.getDate()}</div>
                              <div className={styles.dayTasks}>
                                {dayTasks.map(task => {
                                  const { color: statusColor } = getStatusStyles(task.status);
                                  return (
                                    <div
                                      key={task.id}
                                      className={styles.calendarTask}
                                      style={{ borderLeftColor: statusColor }}
                                      onContextMenu={(e) => handleContextMenu(e, 'task', task.id)}
                                    >
                                      {task.title}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  ) : calendarView === 'week' ? (
                    <div className={styles.weekView}>
                      <div className={styles.weekHeader}>
                        <div className={styles.timeGutter}></div>
                        {Array.from({ length: 7 }).map((_, i) => {
                          const d = new Date(viewDate);
                          d.setDate(viewDate.getDate() - viewDate.getDay() + i);
                          const isToday = new Date().toDateString() === d.toDateString();
                          return (
                            <div key={i} className={`${styles.weekDayColumnHeader} ${isToday ? styles.todayHighlight : ''}`}>
                              <span className={styles.weekDayName}>{d.toLocaleDateString('default', { weekday: 'short' })}</span>
                              <span className={styles.weekDayNumber}>{d.getDate()}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className={styles.weekBody}>
                        <div className={styles.timeGutter}>
                          {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className={styles.hourLabel}>{i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}</div>
                          ))}
                        </div>
                        <div className={styles.weekGrid}>
                          {Array.from({ length: 7 }).map((_, i) => {
                            const d = new Date(viewDate);
                            d.setDate(viewDate.getDate() - viewDate.getDay() + i);
                            const dateStr = d.toISOString().split('T')[0];
                            const dayTasks = currentTasks.filter(t => t.dueDate === dateStr);
                            return (
                              <div key={i} className={styles.weekColumn}>
                                <div className={styles.allDaySection}>
                                  {dayTasks.map(task => (
                                    <div key={task.id} className={styles.calendarTask} style={{ borderLeftColor: getStatusStyles(task.status).color }}>
                                      {task.title}
                                    </div>
                                  ))}
                                </div>
                                {Array.from({ length: 24 }).map((_, h) => (
                                  <div key={h} className={styles.hourSlot}></div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.dayView}>
                      <div className={styles.dayHeader}>
                        <div className={styles.timeGutter}></div>
                        <div className={styles.dayColumnHeader}>
                          <span className={styles.weekDayName}>{viewDate.toLocaleDateString('default', { weekday: 'long' })}</span>
                          <span className={styles.weekDayNumber}>{viewDate.getDate()}</span>
                        </div>
                      </div>
                      <div className={styles.dayBody}>
                        <div className={styles.timeGutter}>
                          {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className={styles.hourLabel}>{i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}</div>
                          ))}
                        </div>
                        <div className={styles.dayColumn}>
                          <div className={styles.allDaySection}>
                            {currentTasks.filter(t => t.dueDate === viewDate.toISOString().split('T')[0]).map(task => (
                              <div key={task.id} className={styles.calendarTask} style={{ borderLeftColor: getStatusStyles(task.status).color }}>
                                {task.title}
                              </div>
                            ))}
                          </div>
                          {Array.from({ length: 24 }).map((_, h) => (
                            <div key={h} className={styles.hourSlot}></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeItem && activeView === 'gantt' && (
              <div className={styles.ganttContainer}>
                <div className={styles.ganttSidebar}>
                  <div className={styles.ganttSidebarHeader}>Task Name</div>
                  {currentTasks.map(task => (
                    <div key={task.id} className={styles.ganttSidebarItem}>
                      <div className={styles.statusIconCircle} style={{ borderColor: getStatusStyles(task.status).color, width: '10px', height: '10px', marginRight: '8px' }}></div>
                      {task.title}
                    </div>
                  ))}
                </div>
                <div className={styles.ganttTimeline}>
                  <div className={styles.ganttTimelineHeader}>
                    {Array.from({ length: 30 }).map((_, i) => {
                      const d = new Date(viewDate);
                      d.setDate(viewDate.getDate() + i);
                      return (
                        <div key={i} className={styles.ganttDayColumn}>
                          <div className={styles.ganttDayName}>{d.toLocaleDateString('default', { weekday: 'short' })}</div>
                          <div className={styles.ganttDayNumber}>{d.getDate()}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className={styles.ganttTimelineBody}>
                    {currentTasks.map(task => {
                      const startDate = task.startDate ? new Date(task.startDate) : (task.dueDate ? new Date(task.dueDate) : null);
                      const dueDate = task.dueDate ? new Date(task.dueDate) : (task.startDate ? new Date(task.startDate) : null);

                      let offset = 0;
                      let width = 100; // Default 1 day

                      if (startDate) {
                        const startDiff = startDate.getTime() - viewDate.getTime();
                        offset = Math.floor(startDiff / (1000 * 60 * 60 * 24));
                      }

                      if (startDate && dueDate) {
                        const durationDiff = dueDate.getTime() - startDate.getTime();
                        width = Math.max(100, (Math.floor(durationDiff / (1000 * 60 * 60 * 24)) + 1) * 100);
                      }

                      return (
                        <div key={task.id} className={styles.ganttRow}>
                          {Array.from({ length: 30 }).map((_, i) => (
                            <div key={i} className={styles.ganttDayCell}></div>
                          ))}
                          {(startDate || dueDate) && offset + (width / 100) > 0 && offset < 30 && (
                            <div
                              className={styles.ganttBar}
                              style={{
                                left: `${offset * 100}px`,
                                width: `${width}px`,
                                background: getStatusStyles(task.status).color
                              }}
                              title={`${task.title}${startDate ? ' | Start: ' + task.startDate : ''}${dueDate ? ' | Due: ' + task.dueDate : ''}`}
                            >
                              {task.title}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeItem && activeView === 'table' && (
              <div className={styles.tableViewContainer}>
                <table className={styles.taskTable}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Name</th>
                      <th>Assignee</th>
                      <th>Status</th>
                      <th>Due Date</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentTasks.map((task, index) => (
                      <tr key={task.id}>
                        <td style={{ color: '#94a3b8', fontSize: '11px' }}>{index + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className={styles.statusIconCircle} style={{ borderColor: getStatusStyles(task.status).color, width: '12px', height: '12px' }}></div>
                            {task.title}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600 }}>{task.assignee ? task.assignee[0] : '?'}</div>
                            <span style={{ fontSize: '12px' }}>{task.assignee || 'Unassigned'}</span>
                          </div>
                        </td>
                        <td>
                          <span className={styles.statusBadge} style={{
                            background: getStatusStyles(task.status).color + '20',
                            color: getStatusStyles(task.status).color,
                            border: `1px solid ${getStatusStyles(task.status).color}40`
                          }}>
                            {task.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: '#64748b' }}>
                          {task.dueDate || '-'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: task.priority === 'Urgent' ? '#ef4444' : task.priority === 'High' ? '#f59e0b' : '#64748b' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" strokeWidth="2" /></svg>
                            {task.priority}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeItem && activeView === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Stats Row */}
                <div className={styles.statsRow}>
                  <div className={styles.statCard} style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div className={styles.statValue} style={{ color: '#64748b' }}>{currentTasks.filter(t => !t.assignee).length}</div>
                    <div className={styles.statLabel}>Unassigned</div>
                  </div>
                  <div className={styles.statCard} style={{ background: '#eff6ff', border: '1px solid #dbeafe' }}>
                    <div className={styles.statValue} style={{ color: '#2563eb' }}>{currentTasks.filter(t => t.status === 'IN PROGRESS').length}</div>
                    <div className={styles.statLabel}>In Progress</div>
                  </div>
                  <div className={styles.statCard} style={{ background: '#ecfdf5', border: '1px solid #d1fae5' }}>
                    <div className={styles.statValue} style={{ color: '#10b981' }}>{currentTasks.filter(t => t.status === 'COMPLETE').length}</div>
                    <div className={styles.statLabel}>Completed</div>
                  </div>
                </div>

                {/* Main Dashboard Grid */}
                <div className={styles.dashboardGrid}>
                  {/* Workload by Status */}
                  <div className={styles.dashboardCard}>
                    <div className={styles.cardTitle}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20v-6M6 20V10M18 20V4" /></svg>
                      Workload by Status
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>Distribution of tasks across your workflow</div>
                    <div className={styles.workloadBar}>
                      {statuses.map((status, i) => {
                        const count = currentTasks.filter(t => t.status === status).length;
                        const percentage = currentTasks.length > 0 ? (count / currentTasks.length) * 100 : 0;
                        if (percentage === 0) return null;
                        return (
                          <div
                            key={status}
                            className={styles.workloadSegment}
                            style={{ width: `${percentage}%`, background: getStatusStyles(status).color }}
                            title={`${status}: ${count} tasks`}
                          ></div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '16px' }}>
                      {statuses.slice(0, 4).map(status => (
                        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getStatusStyles(status).color }}></div>
                          {status}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Assignee Workload */}
                  <div className={styles.dashboardCard}>
                    <div className={styles.cardTitle}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                      Open Tasks by Assignee
                    </div>
                    <div className={styles.chartPlaceholder}>
                      {(() => {
                        const assigneeMap: Record<string, number> = {};
                        currentTasks.filter(t => t.status !== 'COMPLETE').forEach(t => {
                          const name = t.assignee || 'Unassigned';
                          assigneeMap[name] = (assigneeMap[name] || 0) + 1;
                        });
                        const entries = Object.entries(assigneeMap).slice(0, 5);
                        const max = Math.max(...entries.map(e => e[1]), 1);

                        return entries.map(([name, count]) => (
                          <div key={name} className={styles.chartBar} style={{ height: `${(count / max) * 100}%`, background: name === 'Unassigned' ? '#cbd5e1' : '#3b82f6' }}>
                            <div className={styles.chartBarValue}>{count}</div>
                            <div className={styles.chartBarLabel}>{name}</div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Overdue Tasks */}
                  <div className={styles.dashboardCard}>
                    <div className={styles.cardTitle}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#ef4444' }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                      Tasks Due or Overdue
                    </div>
                    <div className={styles.dashboardList}>
                      {currentTasks
                        .filter(t => t.dueDate && t.status !== 'COMPLETE' && new Date(t.dueDate) < new Date())
                        .slice(0, 5)
                        .map(task => (
                          <div key={task.id} className={styles.dashboardListItem}>
                            <div className={styles.activityDot} style={{ background: '#ef4444' }}></div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{task.title}</div>
                              <div style={{ fontSize: '11px', color: '#ef4444' }}>Overdue: {task.dueDate}</div>
                            </div>
                            <div className={styles.priorityBadge} style={{ transform: 'scale(0.8)', padding: '2px 6px' }}>{task.priority || 'Normal'}</div>
                          </div>
                        ))
                      }
                      {currentTasks.filter(t => t.dueDate && t.status !== 'COMPLETE' && new Date(t.dueDate) < new Date()).length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ marginBottom: '12px', opacity: 0.5 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                          <div>No overdue tasks!</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Latest Activity */}
                  <div className={styles.dashboardCard}>
                    <div className={styles.cardTitle}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-11.7 8.38 8.38 0 0 1 3.8.9L21 3z" /></svg>
                      Latest Activity
                    </div>
                    <div className={styles.dashboardList}>
                      {currentTasks.slice(0, 5).map((task, i) => (
                        <div key={task.id} className={styles.dashboardListItem}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#64748b' }}>
                            {task.assignee ? task.assignee[0] : 'U'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', color: '#475569' }}>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{task.assignee || 'Someone'}</span> updated task
                              <span style={{ fontWeight: 600, color: '#3b82f6' }}> {task.title}</span>
                            </div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{i + 1}h ago</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeItem && activeView === 'activity' && (
              <div className={styles.activityContainer}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '24px' }}>Activity</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>Today</div>

                <div className={styles.activityList}>
                  {currentTasks.slice(0, 10).map((task, i) => (
                    <div key={task.id} className={styles.activityCard}>
                      <div className={styles.activityCardHeader}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748b' }}></div>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{task.title}</span>
                      </div>
                      <div className={styles.activityCardBody}>
                        <div className={styles.activityRow}>
                          <div className={styles.activityAvatar}>{task.assignee ? task.assignee[0] : 'U'}</div>
                          <div className={styles.activityText}>
                            <span style={{ fontWeight: 600 }}>{task.assignee || 'You'}</span> created this task
                          </div>
                          <div className={styles.activityTime}>{i + 1}h ago</div>
                        </div>
                        {task.priority && (
                          <div className={styles.activityRow}>
                            <div className={styles.activityAvatar}>{task.assignee ? task.assignee[0] : 'U'}</div>
                            <div className={styles.activityText}>
                              <span style={{ fontWeight: 600 }}>{task.assignee || 'You'}</span> set priority to <strong>{task.priority}</strong>
                            </div>
                            <div className={styles.activityTime}>{i + 1}h ago</div>
                          </div>
                        )}
                        {task.dueDate && (
                          <div className={styles.activityRow}>
                            <div className={styles.activityAvatar}>{task.assignee ? task.assignee[0] : 'U'}</div>
                            <div className={styles.activityText}>
                              <span style={{ fontWeight: 600 }}>{task.assignee || 'You'}</span> set the due date to {task.dueDate}
                            </div>
                            <div className={styles.activityTime}>{i + 1}h ago</div>
                          </div>
                        )}
                        <div className={styles.activityRow}>
                          <div className={styles.activityAvatar}>{task.assignee ? task.assignee[0] : 'U'}</div>
                          <div className={styles.activityText}>
                            <span style={{ fontWeight: 600 }}>{task.assignee || 'You'}</span> changed status to <span style={{ color: getStatusStyles(task.status).color, background: getStatusStyles(task.status).bg, padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>{task.status}</span>
                          </div>
                          <div className={styles.activityTime}>{i + 2}h ago</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeItem && activeView === 'workload' && (
              <div className={styles.workloadContainer}>
                <div className={styles.workloadHeader}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Workload</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 500, color: '#475569', outline: 'none' }}>
                      <option>14 days</option>
                      <option>1 Month</option>
                    </select>
                  </div>
                </div>

                <div className={styles.workloadGrid}>
                  <div className={styles.workloadGridHeader}>
                    <div className={styles.workloadAssigneeCol}>Assignee</div>
                    <div className={styles.workloadDatesScroll}>
                      {[...Array(14)].map((_, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() + i);
                        const isToday = i === 0;
                        return (
                          <div key={i} className={styles.workloadDateCol}>
                            <div style={{ fontSize: '10px', color: isToday ? '#2563eb' : '#94a3b8', fontWeight: isToday ? 700 : 500 }}>
                              {['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()]}
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: isToday ? 700 : 600, color: isToday ? '#2563eb' : '#0f172a', background: isToday ? '#eff6ff' : 'transparent', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                              {d.getDate()}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Assignee Rows */}
                  {(() => {
                    const assignees = Array.from(new Set(currentTasks.map(t => t.assignee || 'Unassigned')));
                    if (assignees.length === 0) assignees.push('You', 'Unassigned');

                    return assignees.map(assignee => {
                      const assigneeTasks = currentTasks.filter(t => (t.assignee || 'Unassigned') === assignee && t.dueDate && t.status !== 'COMPLETE');
                      const totalHours = assigneeTasks.length * 2; // Assuming 2h per task as a baseline

                      return (
                        <div key={assignee} className={styles.workloadRow}>
                          <div className={styles.workloadAssigneeCol}>
                            <div className={styles.workloadAvatar}>{assignee[0]}</div>
                            <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px', flex: 1 }}>{assignee}</span>
                            <div style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              {totalHours}h/40h
                            </div>
                          </div>
                          <div className={styles.workloadDatesScroll}>
                            {[...Array(14)].map((_, i) => {
                              const d = new Date();
                              d.setDate(d.getDate() + i);
                              const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

                              const tasksOnDate = assigneeTasks.filter(t => t.dueDate === dateString);
                              const hoursOnDate = tasksOnDate.length * 2;
                              const hasTask = hoursOnDate > 0;

                              return (
                                <div key={i} className={styles.workloadCell}>
                                  <div className={`${styles.workloadCellBox} ${hasTask ? styles.workloadCellBoxActive : ''}`}>
                                    {hoursOnDate}h
                                    {hasTask && <div className={styles.workloadTaskCount}>{tasksOnDate.length}</div>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    });
                  })()}
                </div>
              </div>
            )}

            {activeItem && activeView === 'inbox' && (
              <div className={styles.inboxContainer}>
                <div className={styles.inboxHeader}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>Inbox</h2>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className={styles.filterBtnActive}>Important</button>
                    <button className={styles.filterBtn}>Other</button>
                  </div>
                </div>

                <div className={styles.inboxList}>
                  {currentTasks.filter(t => t.reminder_at).length === 0 ? (
                    <div className={styles.emptyInbox}>
                      <div className={styles.emptyInboxIcon}>📬</div>
                      <h3>Your inbox is empty</h3>
                      <p>All caught up! New reminders and notifications will appear here.</p>
                    </div>
                  ) : (
                    currentTasks.filter(t => t.reminder_at).map(task => (
                      <div key={task.id} className={styles.inboxItem}>
                        <div className={styles.inboxItemStatus} style={{ background: getStatusStyles(task.status).bg }}></div>
                        <div className={styles.inboxItemContent}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{task.status}</span>
                              <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 700 }}>⏰ REMINDER</span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Scheduled for: {new Date(task.reminder_at!).toLocaleString()}</span>
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>{task.title}</div>
                          <div style={{ fontSize: '13px', color: '#64748b' }}>{task.description || 'No description provided.'}</div>
                        </div>
                        <div className={styles.inboxItemActions}>
                          <button className={styles.inboxActionBtn} title="Mark as Done" onClick={() => setTaskReminder(task.id, null as any)}>✓</button>
                          <button className={styles.inboxActionBtn} title="Reschedule" onClick={(e) => { e.stopPropagation(); handleContextMenu(e, 'task', task.id); }}>⏰</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Creation/Rename/Delete/Move/Color Modal */}
      {modalConfig.isOpen && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalContent} style={(modalConfig.type === 'Task' || (modalConfig.type === 'Rename' && modalConfig.targetType === 'task')) ? { maxWidth: '650px', borderRadius: '16px' } : {}} onClick={e => e.stopPropagation()}>
            <form onSubmit={handleModalSubmit}>
              <div className={styles.modalHeader} style={(modalConfig.type === 'Task' || (modalConfig.type === 'Rename' && modalConfig.targetType === 'task')) ? { borderBottom: 'none', paddingBottom: '0' } : {}}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {(modalConfig.type === 'Task' || (modalConfig.type === 'Rename' && modalConfig.targetType === 'task')) ? `${getItemName('list', modalConfig.targetId || '')} • ${modalConfig.type === 'Task' ? 'NEW TASK' : 'EDIT TASK'}` : ''}
                  </span>
                  <div style={{ fontSize: '18px', fontWeight: 700 }}>
                    {modalConfig.type === 'Rename' ? (modalConfig.targetType === 'task' ? 'Edit Task' : `Rename ${modalConfig.targetType}`) :
                      modalConfig.type === 'Delete' ? `Delete ${modalConfig.targetType}` :
                        modalConfig.type === 'Move' ? `Move ${modalConfig.targetType}` :
                          modalConfig.type === 'Color' ? `Choose ${modalConfig.targetType} Color` :
                            modalConfig.type === 'Task' ? 'Create New Task' :
                              `Create a ${modalConfig.type}`}
                  </div>
                </div>
                <button type="button" className={styles.closeBtn} onClick={closeModal}>×</button>
              </div>
              <div className={styles.modalBody}>
                {modalConfig.type === 'Delete' ? (
                  <div style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.5' }}>
                    Are you sure you want to delete this {modalConfig.targetType}? This action cannot be undone and will remove all nested items.
                  </div>
                ) : modalConfig.type === 'Color' ? (
                  <div className={styles.colorPickerRow}>
                    {FOLDER_COLORS.map(c => {
                      const isSelected = modalConfig.targetType === 'space'
                        ? spaces.find(s => s.id === modalConfig.targetId)?.color === c
                        : modalConfig.targetType === 'folder'
                          ? folders.find(f => f.id === modalConfig.targetId)?.color === c
                          : lists.find(l => l.id === modalConfig.targetId)?.color === c;
                      return (
                        <div
                          key={c}
                          className={`${styles.colorCircle} ${isSelected ? styles.colorCircleSelected : ''}`}
                          style={{ background: c }}
                          onClick={() => updateItemColor(modalConfig.targetId!, modalConfig.targetType as 'space' | 'folder' | 'list', c)}
                        />
                      );
                    })}
                  </div>
                ) : modalConfig.type === 'Move' ? (
                  <div>
                    <label className={styles.inputLabel}>Select Destination</label>
                    <select
                      className={styles.selectInput}
                      value={modalConfig.moveTargetId}
                      onChange={(e) => setModalConfig({ ...modalConfig, moveTargetId: e.target.value })}
                      required
                    >
                      <option value="">-- Select a target --</option>
                      {modalConfig.targetType === 'list' && (
                        <optgroup label="Folders">
                          {folders.map(f => {
                            const space = spaces.find(s => s.id === f.spaceId);
                            return <option key={f.id} value={f.id}>{f.name} ({space?.name || 'Unknown Space'})</option>;
                          })}
                        </optgroup>
                      )}
                      {modalConfig.targetType === 'folder' && (
                        <optgroup label="Spaces">
                          {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>
                ) : (modalConfig.type === 'Task' || (modalConfig.type === 'Rename' && modalConfig.targetType === 'task')) ? (
                  <div className={styles.creationModalBody}>
                    <input
                      className={styles.taskTitleInput}
                      placeholder="Task Name"
                      value={modalConfig.inputValue}
                      onChange={e => setModalConfig({ ...modalConfig, inputValue: e.target.value })}
                      autoFocus
                      required
                    />
                    <textarea
                      className={styles.taskDescInput}
                      placeholder="Add description..."
                      value={modalConfig.description}
                      onChange={e => setModalConfig({ ...modalConfig, description: e.target.value })}
                    />

                    <div className={styles.modalActionRow}>
                      <div className={styles.pillBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        <select
                          style={{ border: 'none', background: 'transparent', fontSize: 'inherit', outline: 'none', cursor: 'pointer' }}
                          value={modalConfig.assignee}
                          onChange={e => setModalConfig({ ...modalConfig, assignee: e.target.value })}
                        >
                          <option value="">Assignee</option>
                          <option value="Me">Me</option>
                          <option value="Onboarding Assistant">Assistant</option>
                        </select>
                      </div>

                      <div className={styles.pillBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px', marginRight: '-4px' }}>Start:</span>
                        <input
                          type="date"
                          style={{ border: 'none', background: 'transparent', fontSize: 'inherit', outline: 'none', cursor: 'pointer' }}
                          value={modalConfig.startDate}
                          onChange={e => setModalConfig({ ...modalConfig, startDate: e.target.value })}
                        />
                      </div>

                      <div className={styles.pillBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px', marginRight: '-4px' }}>Due:</span>
                        <input
                          type="date"
                          style={{ border: 'none', background: 'transparent', fontSize: 'inherit', outline: 'none', cursor: 'pointer' }}
                          value={modalConfig.dueDate}
                          onChange={e => setModalConfig({ ...modalConfig, dueDate: e.target.value })}
                        />
                      </div>

                      <div className={styles.pillBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                        <select
                          style={{ border: 'none', background: 'transparent', fontSize: 'inherit', outline: 'none', cursor: 'pointer' }}
                          value={modalConfig.priority}
                          onChange={e => setModalConfig({ ...modalConfig, priority: e.target.value as any })}
                        >
                          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <label className={styles.inputLabel}>Name</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      placeholder={`e.g. ${modalConfig.type === 'Space' ? 'Marketing, Engineering' : 'New ' + modalConfig.type}`}
                      value={modalConfig.inputValue}
                      onChange={(e) => setModalConfig({ ...modalConfig, inputValue: e.target.value })}
                      autoFocus
                    />
                  </>
                )}
              </div>
              <div className={styles.modalFooter}>
                <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                  {modalConfig.type === 'Task' && 'Press Enter to create'}
                  {(modalConfig.type === 'Rename' && modalConfig.targetType === 'task') && 'Press Enter to update'}
                </div>
                <div className={styles.modalFooterRight}>
                  <button type="button" className={styles.cancelBtn} onClick={closeModal}>Cancel</button>
                  <button
                    type="submit"
                    className={styles.submitBtn}
                    style={modalConfig.type === 'Delete' ? { background: '#ef4444' } : {}}
                  >
                    {modalConfig.type === 'Rename' ? (modalConfig.targetType === 'task' ? 'Update Task' : 'Save Changes') :
                      modalConfig.type === 'Delete' ? 'Delete Permanently' :
                        modalConfig.type === 'Move' ? 'Move Item' :
                          modalConfig.type === 'Color' ? 'Close' :
                            modalConfig.type === 'Task' ? 'Create Task' :
                              'Continue'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Context Menu Rendering */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{
            top: (typeof window !== 'undefined' && contextMenu.y + 400 > window.innerHeight) ? contextMenu.y - 400 : contextMenu.y,
            left: (typeof window !== 'undefined' && contextMenu.x + 240 > window.innerWidth) ? contextMenu.x - 240 : contextMenu.x
          }}
        >
          <div className={styles.contextMenuHeader}>
            {contextMenu.type === 'statusGroup' ? `GROUP: ${contextMenu.id.toUpperCase()}` : contextMenu.type === 'task' ? 'TASK OPTIONS' : `${contextMenu.type.toUpperCase()} OPTIONS`}
          </div>

          {contextMenu.type === 'statusGroup' ? (
            <>
              <div className={styles.contextMenuItem} onClick={() => { toggleStatusCollapse(contextMenu.id); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d={collapsedStatuses[contextMenu.id] ? "m15 18-6-6 6-6" : "M18 15l-6-6-6 6"} /></svg>
                {collapsedStatuses[contextMenu.id] ? 'Expand group' : 'Collapse group'}
              </div>
              <div className={styles.contextMenuItem} onClick={() => { closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>
                Archive all in this group
              </div>
              <div className={styles.contextMenuItem} onClick={() => { closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                Automate status
              </div>
              <div className={styles.contextMenuDivider}></div>
              <div className={styles.contextMenuItem} onClick={() => { closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                Select all
              </div>
              <div className={styles.contextMenuItem} onClick={() => { openModal('Rename', contextMenu.id, 'statusGroup'); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                Rename
              </div>
              <div className={styles.contextMenuItem} onClick={() => { closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                Edit statuses
              </div>
            </>
          ) : contextMenu.type === 'task' ? (
            <>
              <div className={styles.contextMenuItem} onMouseEnter={() => setActiveSubMenu(null)} onClick={() => { closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                Favorite
              </div>
              <div className={styles.contextMenuItem} onMouseEnter={() => setActiveSubMenu(null)} onClick={() => { closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                Follow task
              </div>
              <div
                className={styles.contextMenuItem}
                onMouseEnter={() => setActiveSubMenu('remind')}
                style={{ justifyContent: 'space-between', position: 'relative' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  Remind me in Inbox
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>

                {activeSubMenu === 'remind' && (
                  <div className={styles.contextSubMenu} style={{ right: '100%', top: '-100px', marginRight: '2px', width: '450px', display: 'flex' }}>
                    {/* Left: Calendar Column */}
                    <div style={{ flex: 1, borderRight: '1px solid #e2e8f0', padding: '12px 0' }}>
                      <div className={styles.calendarHeaderMini}>
                        <span>May 2026</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span style={{ cursor: 'pointer' }}>&lt;</span>
                          <span style={{ cursor: 'pointer' }}>&gt;</span>
                        </div>
                      </div>
                      <div className={styles.calendarGridMini}>
                        {['S','M','T','W','T','F','S'].map(d => (
                          <div key={d} style={{ fontSize: '9px', fontWeight: 700, textAlign: 'center', color: '#94a3b8', paddingBottom: '4px' }}>{d}</div>
                        ))}
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <div
                            key={day}
                            className={`${styles.calendarDayMini} ${day === 12 ? styles.calendarDayMiniActive : ''}`}
                            onClick={() => {
                              const d = new Date(2026, 4, day, 8, 0);
                              setTaskReminder(contextMenu.id, d);
                              closeContextMenu();
                            }}
                          >
                            {day}
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: '0 12px' }}>
                        <input
                          type="time"
                          defaultValue="08:00"
                          className={styles.dateInputSmall}
                          style={{ marginTop: '8px' }}
                        />
                      </div>
                    </div>

                    {/* Right: Presets Column */}
                    <div style={{ width: '180px', padding: '12px 0' }}>
                      <div className={styles.contextMenuItem} onClick={() => {
                        const d = new Date();
                        d.setMinutes(d.getMinutes() + 20);
                        setTaskReminder(contextMenu.id, d);
                        closeContextMenu();
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        In 20 minutes
                      </div>
                      <div className={styles.contextMenuItem} onClick={() => {
                        const d = new Date();
                        d.setHours(d.getHours() + 2);
                        setTaskReminder(contextMenu.id, d);
                        closeContextMenu();
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        In 2 hours
                      </div>
                      <div className={styles.contextMenuItem} onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(8, 0, 0, 0);
                        setTaskReminder(contextMenu.id, d);
                        closeContextMenu();
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
                        Tomorrow
                      </div>
                      <div className={styles.contextMenuItem} onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 2);
                        d.setHours(8, 0, 0, 0);
                        setTaskReminder(contextMenu.id, d);
                        closeContextMenu();
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        In 2 days
                      </div>
                      <div className={styles.contextMenuItem} onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 7);
                        d.setHours(8, 0, 0, 0);
                        setTaskReminder(contextMenu.id, d);
                        closeContextMenu();
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        Next week
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className={styles.contextMenuDivider}></div>
              <div className={styles.contextMenuItem} onMouseEnter={() => setActiveSubMenu(null)} onClick={() => { openModal('Move', contextMenu.id, 'task'); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                Move to
              </div>
              <div className={styles.contextMenuItem} onMouseEnter={() => setActiveSubMenu(null)} onClick={() => { duplicateTask(contextMenu.id); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                Duplicate
              </div>
              <div className={styles.contextMenuItem} onMouseEnter={() => setActiveSubMenu(null)} onClick={() => { closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>
                Archive
              </div>
              <div className={styles.contextMenuDivider}></div>
              <div className={styles.contextMenuItem} style={{ color: '#ef4444' }} onClick={() => { openModal('Delete', contextMenu.id, 'task'); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                Delete
              </div>
            </>
          ) : (
            <>
              <div className={styles.contextMenuItem} onClick={() => { openModal('Rename', contextMenu.id, contextMenu.type, getItemName(contextMenu.type, contextMenu.id)); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                Rename
              </div>
              <div className={styles.contextMenuItem} onClick={() => { closeContextMenu(); performDuplicate(contextMenu.type as any, contextMenu.id); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                Duplicate
              </div>
              <div className={styles.contextMenuItem} onClick={() => { openModal('Color', contextMenu.id, contextMenu.type); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m19 21-7-7" /><circle cx="7.5" cy="7.5" r="5.5" /><path d="m21 3-4.5 4.5" /></svg>
                Change Color
              </div>
              <div className={styles.contextMenuItem} onClick={() => { openModal('Move', contextMenu.id, contextMenu.type); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                Move to
              </div>
              <div className={styles.contextMenuDivider}></div>
              <div className={styles.contextMenuItem} style={{ color: '#ef4444' }} onClick={() => { openModal('Delete', contextMenu.id, contextMenu.type); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                Delete
              </div>
            </>
          )}
        </div>
      )}
      {/* View Context Menu */}
      {viewContextMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: viewContextMenu.y, left: viewContextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className={styles.contextMenuHeader}>VIEW OPTIONS</div>
          <div className={styles.contextMenuItem} onClick={() => {
            const isPinned = pinnedViewIds.includes(viewContextMenu.view);
            let newPinnedViewIds: string[];
            let newPinnedViews = [...pinnedViews];

            if (isPinned) {
              // Unpin: remove from star list and sort back to default relative to other unpinned
              newPinnedViewIds = pinnedViewIds.filter(id => id !== viewContextMenu.view);
              const defaultOrder = ['list', 'board', 'calendar', 'gantt', 'table'];

              // To unpin while maintaining order: sort the whole list, but keep existing pinned ones at the front
              newPinnedViews = [...pinnedViews].sort((a, b) => {
                const aPinned = newPinnedViewIds.includes(a);
                const bPinned = newPinnedViewIds.includes(b);
                if (aPinned && !bPinned) return -1;
                if (!aPinned && bPinned) return 1;
                if (aPinned && bPinned) return newPinnedViewIds.indexOf(a) - newPinnedViewIds.indexOf(b);
                return defaultOrder.indexOf(a) - defaultOrder.indexOf(b);
              });
            } else {
              // Pin: add to star list and move to start of pinned section
              newPinnedViewIds = [viewContextMenu.view, ...pinnedViewIds];
              newPinnedViews = [viewContextMenu.view, ...pinnedViews.filter(v => v !== viewContextMenu.view)];
            }

            setPinnedViewIds(newPinnedViewIds);
            setPinnedViews(newPinnedViews);
            setViewContextMenu(null);
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={pinnedViewIds.includes(viewContextMenu.view) ? "#f59e0b" : "none"} stroke={pinnedViewIds.includes(viewContextMenu.view) ? "#f59e0b" : "currentColor"} strokeWidth="2"><path d="M12 2L15 8L22 9L17 14L18 21L12 17L6 21L7 14L2 9L9 8L12 2Z" /></svg>
            {pinnedViewIds.includes(viewContextMenu.view) ? 'Unpin view' : 'Pin view'}
          </div>
          <div className={styles.contextMenuDivider}></div>
          <div className={styles.contextMenuItem} style={{ color: '#ef4444' }} onClick={() => {
            const newPinned = pinnedViews.filter(v => v !== viewContextMenu.view);
            setPinnedViews(newPinned);
            if (activeView === viewContextMenu.view && newPinned.length > 0) {
              setActiveView(newPinned[0] as any);
            }
            setViewContextMenu(null);
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
            Delete view
          </div>
        </div>
      )}
    </main>
  );
}
