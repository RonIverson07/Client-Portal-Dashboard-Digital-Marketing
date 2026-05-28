'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './spaces.module.css';
import { SpaceMindMapView } from '@/components/spaces/SpaceMindMapView';
import { loadMindMapParents, saveMindMapParent, isMindMapBranchTask } from '@/lib/mindMapParents';
import {
  distributeTaskHours,
  formatWorkloadHours,
  sumHoursInRange,
  toDateKey,
} from '@/lib/workloadUtils';
import { TaskImageCarousel } from '@/components/TaskImageCarousel';
import { isGoogleDriveFolderUrl, isGoogleDriveUrl, getDisplayImageUrl } from '@/lib/imageUtils';
import { getTaskImages } from '@/lib/taskImages';

type TaskCoverMode = 'none' | 'image' | 'drive';

type SpaceView = 'board' | 'list' | 'calendar' | 'gantt' | 'table' | 'dashboard' | 'activity' | 'workload' | 'inbox' | 'archived' | 'team' | 'mindmap';

const getViewLabel = (view: string) => {
  if (view === 'mindmap') return 'Mind Map';
  return view.charAt(0).toUpperCase() + view.slice(1);
};

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
  is_archived?: boolean;
  is_favorite?: boolean;
  parentTaskId?: string | null;
  is_mind_map_step?: boolean;
  timeEstimateHours?: number | null;
  coverImageUrl?: string | null;
  imageUrls?: string[] | null;
}

interface ActivityLog {
  id: string;
  task_id: string;
  action_type: string;
  previous_value?: string;
  new_value?: string;
  user_type: string;
  created_at: string;
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

// Returns a local YYYY-MM-DD string (avoids UTC timezone shift from toISOString)
const localDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Returns true if a task should appear on the given date (covers startDate–dueDate range)
const calendarTaskInRange = (task: { startDate?: string; dueDate?: string }, dateStr: string) => {
  const start = task.startDate;
  const due = task.dueDate;
  if (start && due) return dateStr >= start && dateStr <= due;
  if (start) return dateStr === start;
  if (due) return dateStr === due;
  return false;
};

const formatAssignee = (name: string | undefined) => {
  if (!name) return 'Unassigned';
  if (name === 'Onboarding Assistant') return 'Assistant';
  return name;
};

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<SpaceTask[]>([]);
  const [statuses, setStatuses] = useState(['TO DO', 'PLANNING', 'IN PROGRESS', 'AT RISK', 'UPDATE REQUIRED', 'ON HOLD', 'COMPLETE', 'CANCELLED']);

  // Selection state
  const [activeItem, setActiveItem] = useState<{ type: 'space' | 'folder' | 'list', id: string } | null>(null);
  const [activeView, setActiveView] = useState<SpaceView>('list');
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<number>(new Date().getDate());
  const [manualTime, setManualTime] = useState<string>('08:00');
  
  // Reset calendar when opening context menu
  useEffect(() => {
    if (contextMenu) {
      const today = new Date();
      setCalendarMonth(today.getMonth());
      setCalendarYear(today.getFullYear());
      setCalendarSelectedDay(today.getDate());
      setManualTime('08:00');
    }
  }, [contextMenu]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Update current time every second to auto-refresh reminders
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);
  const [workloadRange, setWorkloadRange] = useState(14);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [tableAssigneeFilter, setTableAssigneeFilter] = useState<string>('All');
  const [tableStatusFilter, setTableStatusFilter] = useState<string>('All');
  const [tablePriorityFilter, setTablePriorityFilter] = useState<string>('All');
  const [listStatusFilter, setListStatusFilter] = useState<string>('All');
  const [listSearchQuery, setListSearchQuery] = useState<string>('');
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>('');
  const [workloadSearchQuery, setWorkloadSearchQuery] = useState<string>('');
  const [draggedTask, setDraggedTask] = useState<SpaceTask | null>(null);
  const [hoveredWorkloadCell, setHoveredWorkloadCell] = useState<{ assignee: string; date: string } | null>(null);
  const [backlogOpen, setBacklogOpen] = useState<boolean>(false);
  const [backlogSearchQuery, setBacklogSearchQuery] = useState<string>('');
  const [activeBacklogTab, setActiveBacklogTab] = useState<string>('Unscheduled');
  const [backlogSortBy, setBacklogSortBy] = useState<string>('All Priority');
  const [followedTaskIds, setFollowedTaskIds] = useState<string[]>([]);
  const [dismissedActivityIds, setDismissedActivityIds] = useState<string[]>([]);
  const [mindMapParents, setMindMapParents] = useState<Record<string, string>>({});
  const [uploadingCover, setUploadingCover] = useState(false);
  const [resolvingCoverFolder, setResolvingCoverFolder] = useState(false);
  const [coverPreviewError, setCoverPreviewError] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [carouselIndices, setCarouselIndices] = useState<Record<string, number>>({});
  const [isFullScreenPreviewOpen, setIsFullScreenPreviewOpen] = useState(false);
  const [fullScreenPreviewImages, setFullScreenPreviewImages] = useState<string[]>([]);
  const [fullScreenPreviewIndex, setFullScreenPreviewIndex] = useState(0);

  const handleCarouselIndexChange = (taskId: string, index: number) => {
    setCarouselIndices(prev => ({ ...prev, [taskId]: index }));
  };

  const openFullScreenPreview = (images: string[], index: number) => {
    console.log('openFullScreenPreview called with', { images, index });
    setFullScreenPreviewImages(images);
    setFullScreenPreviewIndex(index);
    setIsFullScreenPreviewOpen(true);
  };

  const closeFullScreenPreview = () => {
    setIsFullScreenPreviewOpen(false);
  };

  // Checklist state
  type ChecklistItem = { id: string; text: string; done: boolean; _pending?: boolean };
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  // tracks the task id currently open in the modal (for Edit Task saves)
  const editingTaskIdRef = useRef<string | null>(null);

  const [expandedTeamStatuses, setExpandedTeamStatuses] = useState<Record<string, boolean>>({});

  // Confirmation dialog state (replaces native confirm())
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

  const showConfirmDialog = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: () => { } });
  };

  const tabsScrollRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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
      const savedFollowed = localStorage.getItem('followed_task_ids');
      if (savedFollowed) {
        try {
          setFollowedTaskIds(JSON.parse(savedFollowed));
        } catch (e) {
          console.error('Failed to load followed tasks', e);
        }
      }
      const savedDismissed = localStorage.getItem('dismissed_activity_ids');
      if (savedDismissed) {
        try {
          const parsed = JSON.parse(savedDismissed);
          if (Array.isArray(parsed)) {
            setDismissedActivityIds(parsed);
          }
        } catch (e) {
          console.error('Failed to load dismissed activities', e);
        }
      }
      setMindMapParents(loadMindMapParents());
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (isHydrated && typeof window !== 'undefined') {
      const config = { pinnedViews, pinnedViewIds, activeView };
      localStorage.setItem('spaces_view_config', JSON.stringify(config));
      localStorage.setItem('followed_task_ids', JSON.stringify(followedTaskIds));
      localStorage.setItem('dismissed_activity_ids', JSON.stringify(dismissedActivityIds));
    }
  }, [pinnedViews, pinnedViewIds, activeView, followedTaskIds, dismissedActivityIds, isHydrated]);

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

  const mapTask = (
    t: any,
    parentOverride?: string | null,
    parents?: Record<string, string>
  ): SpaceTask => {
    const parentLinks = parents ?? mindMapParents;
    const parentTaskId =
      t.parent_task_id ?? t.parentTaskId ?? parentOverride ?? parentLinks[t.id] ?? null;
    return {
      ...t,
      listId: t.list_id || t.listId,
      dueDate: t.due_date || t.dueDate,
      startDate: t.start_date || t.startDate,
      timeEstimateHours:
        t.time_estimate_hours != null
          ? Number(t.time_estimate_hours)
          : t.timeEstimateHours != null
            ? Number(t.timeEstimateHours)
            : null,
      is_archived: t.is_archived || false,
      parentTaskId,
      is_mind_map_step: !!(t.is_mind_map_step || parentTaskId || parentLinks[t.id]),
      coverImageUrl: (t.cover_image_url ?? t.coverImageUrl ?? null) as string | null,
      imageUrls: (() => {
        const raw = t.image_urls ?? t.imageUrls;
        return Array.isArray(raw)
          ? raw.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim())
          : null;
      })(),
    };
  };

  /** Persist local mind-map parent links to DB (no deletes). */
  const syncMindMapBranchesToDb = async (mappedTasks: SpaceTask[], parents: Record<string, string>) => {
    const patches: { id: string; parent_task_id: string; is_mind_map_step: boolean }[] = [];

    for (const [childId, parentId] of Object.entries(parents)) {
      const t = mappedTasks.find(x => x.id === childId);
      if (!t) continue;
      if (t.parentTaskId === parentId && t.is_mind_map_step) continue;
      patches.push({ id: childId, parent_task_id: parentId, is_mind_map_step: true });
    }

    for (const t of mappedTasks) {
      if (t.parentTaskId && !t.is_mind_map_step) {
        patches.push({ id: t.id, parent_task_id: t.parentTaskId, is_mind_map_step: true });
      }
    }

    const unique = new Map(patches.map(p => [p.id, p]));
    await Promise.allSettled(
      Array.from(unique.values()).map(p =>
        fetch('/api/admin/project-tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        })
      )
    );
  };

  const fetchData = async () => {
    setLoading(true);
    const parents = loadMindMapParents();
    setMindMapParents(parents);
    try {
      const [hierarchyRes, tasksRes, logsRes] = await Promise.all([
        fetch('/api/admin/spaces'),
        fetch('/api/admin/project-tasks'),
        fetch('/api/admin/activity-logs')
      ]);

      if (hierarchyRes.ok && tasksRes.ok) {
        const hierarchy = await hierarchyRes.json();
        const taskData = await tasksRes.json();
        const logsData = logsRes.ok ? await logsRes.json() : { logs: [] };

        setSpaces(hierarchy.spaces || []);
        setActivityLogs(logsData.logs || []);

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

        let mappedTasks = (taskData.tasks || []).map((t: any) => mapTask(t, null, parents));
        await syncMindMapBranchesToDb(mappedTasks, parents);
        mappedTasks = mappedTasks.map((t: SpaceTask) => {
          const parentTaskId = t.parentTaskId ?? parents[t.id] ?? null;
          return {
            ...t,
            parentTaskId,
            is_mind_map_step: isMindMapBranchTask(
              { id: t.id, parentTaskId, is_mind_map_step: t.is_mind_map_step },
              parents
            ),
          };
        });
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

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/admin/activity-logs');
      if (res.ok) {
        const data = await res.json();
        setActivityLogs(data.logs || []);
      }
    } catch (e) { console.error('Failed to fetch logs', e); }
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

  const isOverdue = (dueDateStr: string | null | undefined): boolean => {
    if (!dueDateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let dueDate: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) {
      const [y, m, d] = dueDateStr.split('-').map(Number);
      dueDate = new Date(y, m - 1, d);
    } else {
      const [m, d, y] = dueDateStr.split(/[/-]/).map(Number);
      dueDate = new Date(y, m - 1, d);
    }
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'Space' | 'Folder' | 'List' | 'Task' | 'Rename' | 'Delete' | 'Move' | 'Color' | 'Archive';
    targetId?: string;
    targetType?: 'space' | 'folder' | 'list' | 'statusGroup' | 'task';
    inputValue: string;
    moveTargetId?: string;
    description: string;
    assignee: string;
    dueDate: string;
    startDate: string;
    timeEstimate: string;
    coverImageUrl: string;
    coverImageUrls: string[];
    coverMode: TaskCoverMode;
    priority: 'Urgent' | 'High' | 'Normal' | 'Low' | 'Clear';
  }>({
    isOpen: false,
    type: 'Space',
    inputValue: '',
    description: '',
    assignee: '',
    dueDate: '',
    startDate: '',
    timeEstimate: '',
    coverImageUrl: '',
    coverImageUrls: [],
    coverMode: 'none',
    priority: 'Normal',
  });

  const openModal = (type: 'Space' | 'Folder' | 'List' | 'Task' | 'Rename' | 'Delete' | 'Move' | 'Color' | 'Archive', targetId?: string, targetType?: 'space' | 'folder' | 'list' | 'statusGroup' | 'task', initialValue: string = '', initialData: any = {}) => {
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
      timeEstimate: (() => {
        const raw = initialData.timeEstimateHours ?? initialData.time_estimate_hours;
        if (raw === null || raw === undefined || raw === '') return '';
        const num = Number(raw);
        return Number.isFinite(num) ? String(num) : '';
      })(),
      priority: initialData.priority || 'Normal',
      coverImageUrl: String(initialData.coverImageUrl ?? initialData.cover_image_url ?? '').trim(),
      coverImageUrls: (() => {
        const raw = initialData.imageUrls ?? initialData.image_urls;
        return Array.isArray(raw)
          ? raw.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim())
          : [];
      })(),
      coverMode: (() => {
        const url = String(initialData.coverImageUrl ?? initialData.cover_image_url ?? '').trim();
        const gallery = Array.isArray(initialData.imageUrls ?? initialData.image_urls)
          ? (initialData.imageUrls ?? initialData.image_urls).filter(
              (x: unknown) => typeof x === 'string' && !!String(x).trim()
            )
          : [];
        if (!url && gallery.length === 0) return 'none' as TaskCoverMode;
        if (gallery.length > 0 || isGoogleDriveUrl(url)) return 'drive';
        return 'image';
      })(),
    });
    setCoverPreviewError(false);
    setChecklistItems([]);
    setChecklistInput('');
    // Load checklist items if editing an existing task
    if (type === 'Rename' && targetType === 'task' && targetId) {
      editingTaskIdRef.current = targetId;
      setLoadingChecklist(true);
      fetch(`/api/admin/checklist?task_id=${encodeURIComponent(targetId)}`)
        .then(r => r.json())
        .then(d => {
          if (d.items) {
            setChecklistItems(d.items.map((i: any) => ({ id: i.id, text: i.text, done: i.done })));
          }
        })
        .catch(() => { })
        .finally(() => setLoadingChecklist(false));
    } else {
      editingTaskIdRef.current = null;
    }
  };

  const closeModal = () => {
    setModalConfig({ ...modalConfig, isOpen: false });
    setUploadingCover(false);
    setResolvingCoverFolder(false);
    setCoverPreviewError(false);
    setChecklistItems([]);
    setChecklistInput('');
    editingTaskIdRef.current = null;
  };

  const addChecklistItem = async () => {
    const text = checklistInput.trim();
    if (!text) return;
    const taskId = editingTaskIdRef.current;
    if (taskId) {
      // Edit Task — persist immediately
      const res = await fetch('/api/admin/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, text, position: checklistItems.length }),
      });
      const saved = await res.json();
      if (res.ok) {
        setChecklistItems(prev => [...prev, { id: saved.id, text: saved.text, done: saved.done }]);
      } else {
        showToast(saved.error || 'Failed to add item', 'error');
      }
    } else {
      // Add Task — store locally with a temp id; will be saved after task is created
      setChecklistItems(prev => [...prev, { id: `_tmp_${Date.now()}`, text, done: false, _pending: true }]);
    }
    setChecklistInput('');
  };

  const toggleChecklistItem = async (id: string) => {
    const item = checklistItems.find(i => i.id === id);
    if (!item) return;
    const newDone = !item.done;
    setChecklistItems(prev => prev.map(i => i.id === id ? { ...i, done: newDone } : i));
    if (!item._pending) {
      await fetch('/api/admin/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, done: newDone }),
      });
    }
  };

  const deleteChecklistItem = async (id: string) => {
    const item = checklistItems.find(i => i.id === id);
    setChecklistItems(prev => prev.filter(i => i.id !== id));
    if (item && !item._pending) {
      await fetch(`/api/admin/checklist?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    }
  };

  const updateChecklistItemText = (id: string, text: string) => {
    setChecklistItems(prev => prev.map(i => i.id === id ? { ...i, text } : i));
  };

  const saveChecklistItemText = async (id: string, text: string) => {
    const item = checklistItems.find(i => i.id === id);
    if (!item || item._pending) return;
    await fetch('/api/admin/checklist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, text }),
    });
  };

  const handleCoverFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file', 'error');
      return;
    }

    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'requests');

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setModalConfig(prev => ({
        ...prev,
        coverMode: 'image',
        coverImageUrl: data.url,
        coverImageUrls: [],
      }));
      setCoverPreviewError(false);
      showToast('Image attached');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      showToast(message, 'error');
    } finally {
      setUploadingCover(false);
      if (coverFileInputRef.current) coverFileInputRef.current.value = '';
    }
  };

  const setCoverMode = (mode: TaskCoverMode) => {
    setModalConfig(prev => ({
      ...prev,
      coverMode: mode,
      coverImageUrl: mode === 'none' || mode !== prev.coverMode ? '' : prev.coverImageUrl,
      coverImageUrls: mode === 'none' || mode !== prev.coverMode ? [] : prev.coverImageUrls,
    }));
    setCoverPreviewError(false);
  };

  async function resolveDriveFolderImages(folderUrl: string): Promise<string[]> {
    const res = await fetch(`/api/admin/drive/folder-images?url=${encodeURIComponent(folderUrl)}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load folder images');
    return Array.isArray(data.imageUrls) ? data.imageUrls : [];
  }

  async function handleCoverDriveBlur() {
    const rawUrl = modalConfig.coverImageUrl.trim();
    if (!isGoogleDriveFolderUrl(rawUrl)) return;

    setResolvingCoverFolder(true);
    setCoverPreviewError(false);
    try {
      const folderImages = await resolveDriveFolderImages(rawUrl);
      if (folderImages.length === 0) {
        setModalConfig(prev => ({ ...prev, coverImageUrls: [] }));
        setCoverPreviewError(true);
        showToast('No public images found in this Google Drive folder.', 'error');
        return;
      }
      setModalConfig(prev => ({ ...prev, coverImageUrls: folderImages }));
      setCoverPreviewError(false);
    } catch (err: unknown) {
      setModalConfig(prev => ({ ...prev, coverImageUrls: [] }));
      setCoverPreviewError(true);
      const message = err instanceof Error ? err.message : 'Failed to read Drive folder';
      showToast(message, 'error');
    } finally {
      setResolvingCoverFolder(false);
    }
  }

  const getModalCoverImages = (): string[] => {
    const gallery = modalConfig.coverImageUrls.filter(Boolean);
    if (gallery.length > 0) return gallery;
    const single = modalConfig.coverImageUrl.trim();
    return single ? [single] : [];
  };

  const resolveMindMapDefaultListId = (): string | null => {
    if (!activeItem) return null;
    if (activeItem.type === 'list') return activeItem.id;
    const existingList = lists.find(l => l.parentId === activeItem.id);
    if (existingList) return existingList.id;
    if (activeItem.type === 'space') {
      const sf = folders.filter(f => f.spaceId === activeItem.id);
      for (const f of sf) {
        const fl = lists.find(l => l.parentId === f.id);
        if (fl) return fl.id;
      }
    }
    return null;
  };

  const handleMindMapTaskOpen = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) openModal('Rename', task.id, 'task', task.title, task);
  };

  const handleMindMapCreateTask = async (
    listId: string,
    title: string,
    parentTaskId?: string | null
  ): Promise<{ ok: boolean; taskId?: string }> => {
    const trimmed = title.trim();
    if (!trimmed) return { ok: false };
    try {
      const body: Record<string, unknown> = {
        list_id: listId,
        title: trimmed,
        status: 'TO DO',
      };
      if (parentTaskId) {
        body.parent_task_id = parentTaskId;
        body.is_mind_map_step = true;
      }

      const res = await fetch('/api/admin/project-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to create task', 'error');
        return { ok: false };
      }

      const newItem = await res.json();
      const taskId = String(newItem.id);
      if (parentTaskId) {
        setMindMapParents(saveMindMapParent(taskId, parentTaskId));
      }

      const mapped = mapTask(newItem, parentTaskId ?? null);
      setTasks(prev => [...prev, mapped]);
      fetchLogs();
      showToast(parentTaskId ? 'Mind map step added' : 'Task added');
      return { ok: true, taskId };
    } catch {
      showToast('Failed to create task', 'error');
      return { ok: false };
    }
  };

  const handleMindMapDeleteTask = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    const taskName = task?.title || 'this task';
    showConfirmDialog(
      'Delete Task',
      `Are you sure you want to delete "${taskName}"? This action cannot be undone.`,
      async () => {
        closeConfirmDialog();
        try {
          const res = await fetch(`/api/admin/project-tasks?id=${encodeURIComponent(taskId)}`, { method: 'DELETE' });
          if (!res.ok) {
            const err = await res.json();
            showToast(err.error || 'Failed to delete task', 'error');
            return;
          }
          performDelete('task', taskId);
          showToast('Task deleted');
        } catch {
          showToast('Failed to delete task', 'error');
        }
      }
    );
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const {
      type,
      targetId,
      targetType,
      inputValue,
      moveTargetId,
      description,
      assignee,
      dueDate,
      startDate,
      timeEstimate,
      coverImageUrl,
      coverImageUrls,
      coverMode,
      priority,
    } = modalConfig;
    const isEditTask = type === 'Rename' && targetType === 'task';
    let resolvedCoverUrl: string | null = null;
    let resolvedImageUrls: string[] | null = null;

    if (isEditTask && coverMode !== 'none' && coverImageUrl.trim()) {
      const rawUrl = coverImageUrl.trim();
      const gallery = coverImageUrls.filter(Boolean);

      if (coverMode === 'drive' && isGoogleDriveFolderUrl(rawUrl)) {
        let images = gallery;
        if (images.length === 0) {
          try {
            images = await resolveDriveFolderImages(rawUrl);
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to read Drive folder';
            showToast(message, 'error');
            return;
          }
        }
        if (images.length === 0) {
          showToast('No public images found in this Google Drive folder.', 'error');
          return;
        }
        resolvedImageUrls = images;
        resolvedCoverUrl = images[0];
      } else if (gallery.length > 1) {
        resolvedImageUrls = gallery;
        resolvedCoverUrl = gallery[0];
      } else {
        resolvedCoverUrl = rawUrl;
        resolvedImageUrls = null;
      }
    } else if (isEditTask && coverMode === 'none') {
      resolvedCoverUrl = null;
      resolvedImageUrls = null;
    }
    const parsedTimeEstimate = timeEstimate.trim() ? parseFloat(timeEstimate) : null;
    const timeEstimateHours =
      parsedTimeEstimate != null && !isNaN(parsedTimeEstimate) && parsedTimeEstimate > 0
        ? parsedTimeEstimate
        : null;

    try {
      if (type === 'Delete' && targetId && targetType) {
        let idsToDelete = targetId;
        if (targetType === 'task' && selectedTaskIds.has(targetId) && selectedTaskIds.size > 1) {
          idsToDelete = Array.from(selectedTaskIds).join(',');
        }

        const url = targetType === 'task' ? `/api/admin/project-tasks?id=${idsToDelete}` : `/api/admin/spaces?id=${targetId}&type=${targetType}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (res.ok) {
          performDelete(targetType, idsToDelete);
          showToast(`${targetType.charAt(0).toUpperCase() + targetType.slice(1)}${idsToDelete.includes(',') ? 's' : ''} deleted successfully`);
          if (targetType === 'task' && idsToDelete.includes(',')) clearSelection();
          closeModal();
        } else {
          const err = await res.json();
          console.error('Delete failed:', err);
          alert(`Failed to delete: ${err.error || 'Unknown error'}`);
        }
        return;
      }

      if (type === 'Archive' && targetId) {
        const isGroup = targetType === 'statusGroup';
        await archiveTasks(targetId, isGroup);
        closeModal();
        return;
      }

      if (type === 'Move' && targetId && targetType && moveTargetId) {
        const url = targetType === 'task' ? '/api/admin/project-tasks' : '/api/admin/spaces';
        const body: any = { id: targetId };

        if (targetType === 'task') {
          const statuses = ['TO DO', 'PLANNING', 'IN PROGRESS', 'AT RISK', 'UPDATE REQUIRED', 'COMPLETE'];
          if (statuses.includes(moveTargetId)) {
            body.status = moveTargetId;
          } else {
            body.list_id = moveTargetId;
          }
        } else {
          body.type = targetType;
          body.parent_id = moveTargetId;
        }

        const res = await fetch(url, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        if (res.ok) {
          const updated = await res.json();
          if (targetType === 'list') {
            setLists(lists.map(l => l.id === targetId ? updated : l));
            showToast('List moved successfully');
          } else if (targetType === 'task') {
            setTasks(tasks.map(t => t.id === targetId ? mapTask(updated) : t));
            showToast('Task moved successfully');
            fetchLogs();
          }
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
          showToast('Space created successfully');
        }
      } else if (type === 'Folder' && targetId) {
        const res = await fetch('/api/admin/spaces', {
          method: 'POST',
          body: JSON.stringify({ type: 'folder', space_id: targetId, name: inputValue, color: FOLDER_COLORS[0] })
        });
        if (res.ok) {
          const newItem = await res.json();
          setFolders([...folders, { ...newItem, spaceId: newItem.space_id }]);
          showToast('Folder created successfully');
        }
      } else if (type === 'List' && targetId) {
        const res = await fetch('/api/admin/spaces', {
          method: 'POST',
          body: JSON.stringify({ type: 'list', parent_id: targetId, name: inputValue })
        });
        if (res.ok) {
          const newItem = await res.json();
          setLists([...lists, { ...newItem, parentId: newItem.parent_id }]);
          showToast('List created successfully');
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            list_id: actualListId,
            title: inputValue,
            status: 'TO DO',
            description,
            assignee,
            due_date: dueDate || null,
            start_date: startDate || null,
            time_estimate_hours: timeEstimateHours,
            priority
          })
        });
        if (res.ok) {
          const newItem = await res.json();
          const mapped = mapTask(newItem);
          setTasks([...tasks, { ...mapped, timeEstimateHours: mapped.timeEstimateHours ?? timeEstimateHours }]);
          // Persist any checklist items added before the task existed
          if (checklistItems.length > 0) {
            await Promise.allSettled(
              checklistItems.map((item, idx) =>
                fetch('/api/admin/checklist', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ task_id: newItem.id, text: item.text, position: idx }),
                })
              )
            );
          }
          showToast('Task created successfully');
          fetchLogs();
          closeModal();
        } else {
          const err = await res.json().catch(() => ({}));
          const msg = String(err.error || 'Failed to create task');
          showToast(
            msg.includes('time_estimate_hours')
              ? 'Add time_estimate_hours column in Supabase (see time_estimate_hours.sql), then try again.'
              : msg.includes('cover_image_url')
                ? 'Add cover_image_url column in Supabase (see cover_image_url.sql), then try again.'
                : msg.includes('image_urls')
                  ? 'Add image_urls column in Supabase (see project_task_image_urls.sql), then try again.'
                  : msg,
            'error'
          );
        }
        return;
      } else if (type === 'Rename' && targetId && targetType) {
        const url = targetType === 'task' ? '/api/admin/project-tasks' : '/api/admin/spaces';
        const body: any = { id: targetId };
        if (targetType === 'task') {
          body.title = inputValue;
          body.description = description;
          body.assignee = assignee;
          body.due_date = dueDate || null;
          body.start_date = startDate || null;
          body.time_estimate_hours = timeEstimateHours;
          body.priority = priority;
          body.cover_image_url = resolvedCoverUrl;
          body.image_urls = resolvedImageUrls;
        } else {
          body.type = targetType;
          body.name = inputValue;
        }
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          const updated = await res.json();
          if (targetType === 'space') {
            setSpaces(spaces.map(s => s.id === targetId ? updated : s));
            showToast('Space renamed successfully');
          } else if (targetType === 'folder') {
            setFolders(folders.map(f => f.id === targetId ? { ...updated, spaceId: updated.space_id } : f));
            showToast('Folder renamed successfully');
          } else if (targetType === 'list') {
            setLists(lists.map(l => l.id === targetId ? { ...updated, parentId: updated.parent_id } : l));
            showToast('List renamed successfully');
          } else if (targetType === 'task') {
            setTasks(tasks.map(t => {
              if (t.id !== targetId) return t;
              const mapped = mapTask(updated);
              return {
                ...mapped,
                timeEstimateHours: mapped.timeEstimateHours ?? timeEstimateHours,
                coverImageUrl: mapped.coverImageUrl ?? resolvedCoverUrl,
                imageUrls: mapped.imageUrls ?? resolvedImageUrls,
              };
            }));
            showToast('Task updated successfully');
            fetchLogs();
          }
          closeModal();
        } else {
          const err = await res.json().catch(() => ({}));
          const msg = String(err.error || 'Failed to update task');
          showToast(
            msg.includes('time_estimate_hours')
              ? 'Add time_estimate_hours column in Supabase (see time_estimate_hours.sql), then try again.'
              : msg.includes('cover_image_url')
                ? 'Add cover_image_url column in Supabase (see cover_image_url.sql), then try again.'
                : msg.includes('image_urls')
                  ? 'Add image_urls column in Supabase (see project_task_image_urls.sql), then try again.'
                  : msg,
            'error'
          );
        }
        return;
      }

      closeModal();
    } catch (e) {
      console.error('Modal submit error:', e);
    }
  };

  const toggleFollowTask = (taskId: string) => {
    const isFollowed = followedTaskIds.includes(taskId);
    let newFollowed: string[];
    if (isFollowed) {
      newFollowed = followedTaskIds.filter(id => id !== taskId);
      showToast('Stopped following task');
    } else {
      newFollowed = [...followedTaskIds, taskId];
      showToast('Following task');
    }
    setFollowedTaskIds(newFollowed);
  };

  const dismissActivity = (logId: string) => {
    setDismissedActivityIds(prev => prev.includes(logId) ? prev : [...prev, logId]);
    showToast('Activity cleared from Inbox');
  };

  const toggleFavorite = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const newValue = !task.is_favorite;

    // Update local state
    setTasks(tasks.map(t => t.id === taskId ? { ...t, is_favorite: newValue } : t));

    try {
      const res = await fetch('/api/admin/project-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, is_favorite: newValue })
      });
      if (!res.ok) throw new Error('Failed');
      showToast(newValue ? 'Added to favorites' : 'Removed from favorites');
    } catch (e) {
      setTasks(tasks.map(t => t.id === taskId ? { ...t, is_favorite: !newValue } : t));
      showToast('Failed to update favorite', 'error');
    }
  };

  const performDelete = (type: 'space' | 'folder' | 'list' | 'statusGroup' | 'task', idOrIds: string) => {
    const ids = idOrIds.split(',');

    if (type === 'space') {
      const id = ids[0];
      setSpaces(spaces.filter(s => s.id !== id));
      setFolders(folders.filter(f => f.spaceId !== id));
      setLists(lists.filter(l => l.parentId !== id));
    } else if (type === 'folder') {
      const id = ids[0];
      setFolders(folders.filter(f => f.id !== id));
      setLists(lists.filter(l => l.parentId !== id));
    } else if (type === 'list') {
      const id = ids[0];
      setLists(lists.filter(l => l.id !== id));
      setTasks(tasks.filter(t => t.listId !== id));
    } else if (type === 'task') {
      setTasks(tasks.filter(t => !ids.includes(t.id)));
    }
    if (ids.includes(activeItem?.id || '')) setActiveItem(null);
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
          time_estimate_hours: task.timeEstimateHours ?? null,
          cover_image_url: task.coverImageUrl ?? null,
          image_urls: task.imageUrls?.length ? task.imageUrls : null,
          priority: task.priority || 'Normal'
        })
      });
      if (res.ok) {
        const newItem = await res.json();
        setTasks(prev => [...prev, mapTask(newItem)]);
        fetchLogs();
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
        fetchLogs();
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
    fetchLogs();
  };

  // Expand/Collapse State
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedItems(prev => ({ ...prev, [id]: prev[id] === false ? true : false }));
  };

  const isExpanded = (id: string) => expandedItems[id] !== false;

  const setTaskReminder = async (taskId: string, date: Date | null) => {
    const reminderAt = date ? date.toISOString() : null;

    // Support bulk updates if the target task is part of a selection
    const idsToUpdate = (selectedTaskIds.has(taskId) && selectedTaskIds.size > 1)
      ? Array.from(selectedTaskIds)
      : [taskId];

    console.log(`Setting reminder for tasks:`, idsToUpdate, `Date:`, reminderAt);

    const results = await Promise.all(idsToUpdate.map(id =>
      fetch('/api/admin/project-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, reminder_at: reminderAt })
      })
    ));

    const allOk = results.every(res => res.ok);

    if (allOk) {
      // Update local state for all updated tasks
      setTasks(prev => prev.map(t => idsToUpdate.includes(t.id) ? { ...t, reminder_at: reminderAt || undefined } : t));

      const msg = idsToUpdate.length > 1
        ? `Reminders set for ${idsToUpdate.length} tasks!`
        : 'Reminder set successfully!';

      console.log(`Bulk update success: ${msg}`);
      showToast(msg);

      if (idsToUpdate.length > 1) clearSelection();
    } else {
      console.error('Failed to set some reminders', results);
      showToast('Error: Could not save one or more reminders.', 'error');
    }
  };

  // Context Menu Handlers

  const handleContextMenu = (e: React.MouseEvent, type: 'space' | 'folder' | 'list' | 'statusGroup' | 'task', id: string, initialSubMenu?: 'remind' | null, extra?: any) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('ContextMenu Triggered:', type, id);
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, extra });
    setActiveSubMenu(initialSubMenu || null);
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setActiveSubMenu(null);
  };

  const archiveTasks = async (targetId: string, isGroup: boolean = false) => {
    let idsToArchive: string[] = [];

    if (isGroup) {
      // Archive all tasks in the status group (targetId is the status name)
      idsToArchive = currentTasks.filter(t => t.status === targetId && !t.is_archived).map(t => t.id);
    } else {
      // Archive single task or current selection
      idsToArchive = (selectedTaskIds.has(targetId) && selectedTaskIds.size > 1)
        ? Array.from(selectedTaskIds)
        : [targetId];
    }

    if (idsToArchive.length === 0) return;

    try {
      const results = await Promise.all(idsToArchive.map(id =>
        fetch('/api/admin/project-tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, is_archived: true })
        })
      ));

      if (results.every(r => r.ok)) {
        setTasks(prev => prev.map(t => idsToArchive.includes(t.id) ? { ...t, is_archived: true } : t));
        showToast(idsToArchive.length > 1 ? `${idsToArchive.length} tasks archived` : 'Task archived');
        clearSelection();
        fetchLogs();
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to archive tasks', 'error');
    }
  };

  const unarchiveTask = async (taskId: string) => {
    try {
      const res = await fetch('/api/admin/project-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, is_archived: false })
      });

      if (res.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_archived: false } : t));
        showToast('Task restored');
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to restore task', 'error');
    }
  };

  const [collapsedStatuses, setCollapsedStatuses] = useState<Record<string, boolean>>({});
  const toggleStatusCollapse = (status: string) => {
    setCollapsedStatuses((prev: Record<string, boolean>) => ({ ...prev, [status]: !prev[status] }));
  };

  const selectAllInGroup = (status: string) => {
    const groupTaskIds = currentTasks.filter(t => t.status === status).map(t => t.id);
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      groupTaskIds.forEach(id => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelectedTaskIds(new Set());

  // Get current tasks to display
  let currentTasks: SpaceTask[] = [];

  if (activeItem) {
    if (activeItem.type === 'list') {
      currentTasks = tasks.filter(t => t.listId === activeItem.id && (activeView === 'archived' ? t.is_archived : !t.is_archived));
    } else if (activeItem.type === 'folder') {
      const folderLists = lists.filter(l => l.parentId === activeItem.id).map(l => l.id);
      currentTasks = tasks.filter(t => folderLists.includes(t.listId) && (activeView === 'archived' ? t.is_archived : !t.is_archived));
    } else if (activeItem.type === 'space') {
      const spaceFolders = folders.filter(f => f.spaceId === activeItem.id).map(f => f.id);
      const spaceLists = lists.filter(l => l.parentId === activeItem.id || spaceFolders.includes(l.parentId)).map(l => l.id);
      currentTasks = tasks.filter(t => spaceLists.includes(t.listId) && (activeView === 'archived' ? t.is_archived : !t.is_archived));
    }
  }

  // Hide mind-map branches from list/board/etc. — data stays in DB for the mind map
  if (activeView !== 'mindmap') {
    currentTasks = currentTasks.filter(t => !isMindMapBranchTask(t, mindMapParents));
  }

  // Sort: Favorites first
  currentTasks.sort((a, b) => {
    if (!!a.is_favorite === !!b.is_favorite) return 0;
    return a.is_favorite ? -1 : 1;
  });

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

  const getTaskPath = (task: SpaceTask): string => {
    if (!task.listId) return '';
    const list = lists.find(l => l.id === task.listId);
    if (!list) return '';
    const pathParts: string[] = [list.name];
    if (list.parentId) {
      const folder = folders.find(f => f.id === list.parentId);
      if (folder) {
        pathParts.unshift(folder.name);
        const space = spaces.find(s => s.id === folder.spaceId);
        if (space) {
          pathParts.unshift(space.name);
        }
      } else {
        const space = spaces.find(s => s.id === list.parentId);
        if (space) {
          pathParts.unshift(space.name);
        }
      }
    }
    return pathParts.join(' > ');
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  return (
    <div className={styles.container} onClick={() => { setIsViewDropdownOpen(false); setIsAddViewDropdownOpen(false); setViewContextMenu(null); setContextMenu(null); }}>
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
                          onDragOver={(e) => {
                            e.preventDefault();
                            const folderLists = lists.filter(l => l.parentId === folder.id);
                            if (folderLists.length === 1) {
                              e.dataTransfer.dropEffect = 'move';
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggedTask) {
                              const folderLists = lists.filter(l => l.parentId === folder.id);
                              if (folderLists.length === 1) {
                                const targetList = folderLists[0];
                                setTasks(prev => prev.map(t => 
                                  t.id === draggedTask.id ? { ...t, listId: targetList.id } : t
                                ));
                                fetch('/api/admin/project-tasks', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: draggedTask.id, list_id: targetList.id })
                                }).then(() => fetchLogs());
                              }
                            }
                            setDraggedTask(null);
                          }}
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
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (draggedTask) {
                                    setTasks(prev => prev.map(t => 
                                      t.id === draggedTask.id ? { ...t, listId: list.id } : t
                                    ));
                                    fetch('/api/admin/project-tasks', {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: draggedTask.id, list_id: list.id })
                                    }).then(() => fetchLogs());
                                  }
                                  setDraggedTask(null);
                                }}
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
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedTask) {
                            setTasks(prev => prev.map(t => 
                              t.id === draggedTask.id ? { ...t, listId: list.id } : t
                            ));
                            fetch('/api/admin/project-tasks', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: draggedTask.id, list_id: list.id })
                            }).then(() => fetchLogs());
                          }
                          setDraggedTask(null);
                        }}
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
                {(() => {
                  const dropdownReminderItems = tasks.filter(t => t.reminder_at && new Date(t.reminder_at).getTime() <= currentTime).map(task => {
                    const taskPath = getTaskPath(task);
                    return {
                      id: `reminder-${task.id}`,
                      type: 'reminder',
                      time: new Date(task.reminder_at!).getTime(),
                      title: task.title,
                      subtitle: '⏰ REMINDER',
                      description: `Scheduled for: ${new Date(task.reminder_at!).toLocaleDateString()}${taskPath ? ` • In: ${taskPath}` : ''}`,
                    };
                  });

                  const followedTaskIdsInView = tasks.filter(t => followedTaskIds.includes(t.id)).map(t => t.id);
                  const followedActivityLogs = activityLogs.filter(log =>
                    followedTaskIdsInView.includes(log.task_id) && !dismissedActivityIds.includes(log.id)
                  );

                  const dropdownActivityItems = followedActivityLogs.map(log => {
                    const task = tasks.find(t => t.id === log.task_id);
                    const taskPath = task ? getTaskPath(task) : '';
                    let changeDescription = '';
                    if (log.action_type === 'creation') {
                      changeDescription = `Task created`;
                    } else if (log.action_type === 'status_change') {
                      changeDescription = `Moved from "${log.previous_value || 'None'}" to "${log.new_value}"`;
                    } else if (log.action_type === 'list_id_change') {
                      const oldListName = lists.find(l => l.id === log.previous_value)?.name || 'Unknown List';
                      const newListName = lists.find(l => l.id === log.new_value)?.name || 'Unknown List';
                      changeDescription = `Moved from "${oldListName}" to "${newListName}"`;
                    } else if (log.action_type === 'archive') {
                      changeDescription = `Archived`;
                    } else if (log.action_type === 'unarchive') {
                      changeDescription = `Restored`;
                    } else {
                      const field = log.action_type.replace('_change', '');
                      changeDescription = `${field.charAt(0).toUpperCase() + field.slice(1)} updated`;
                    }

                    return {
                      id: `activity-${log.id}`,
                      type: 'activity',
                      time: new Date(log.created_at).getTime(),
                      title: task ? task.title : 'Unknown Task',
                      subtitle: `📢 UPDATE`,
                      description: `${changeDescription}${taskPath ? ` • In: ${taskPath}` : ''}`,
                    };
                  });

                  const dropdownCombinedItems = [...dropdownReminderItems, ...dropdownActivityItems].sort((a, b) => b.time - a.time);

                  return (
                    <>
                      <button
                        className={styles.notificationBtn}
                        onClick={(e) => { e.stopPropagation(); setIsNotificationOpen(!isNotificationOpen); }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                        {dropdownCombinedItems.length > 0 && (
                          <span className={styles.notificationBadge}>{dropdownCombinedItems.length}</span>
                        )}
                      </button>

                      {isNotificationOpen && (
                        <div className={styles.notificationDropdown} onClick={(e) => e.stopPropagation()}>
                          <div className={styles.notificationDropdownHeader}>
                            <span>Notifications</span>
                            <button onClick={() => setIsNotificationOpen(false)}>✕</button>
                          </div>
                          <div className={styles.notificationDropdownList}>
                            {dropdownCombinedItems.length === 0 ? (
                              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                                No new notifications
                              </div>
                            ) : (
                              dropdownCombinedItems.slice(0, 5).map(item => (
                                <div key={item.id} className={styles.notificationSmallItem} onClick={() => { setActiveView('inbox'); setIsNotificationOpen(false); }} style={{ cursor: 'pointer' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '10px', color: item.type === 'reminder' ? '#2563eb' : '#10b981', fontWeight: 700 }}>{item.subtitle}</span>
                                    <span style={{ fontSize: '9px', color: '#94a3b8' }}>{new Date(item.time).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                                  </div>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{item.title}</div>
                                  <div style={{ fontSize: '11px', color: '#64748b' }}>{item.description}</div>
                                </div>
                              ))
                            )}
                          </div>
                          <div className={styles.notificationDropdownFooter}>
                            <button onClick={() => { setActiveView('inbox'); setIsNotificationOpen(false); }}>View All in Inbox</button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {activeItem && (
              <div className={styles.viewTabs} style={{ marginTop: 'auto', marginBottom: '-1px' }}>
                <div
                  ref={tabsScrollRef}
                  className={styles.tabsScrollArea}
                  onWheel={(e) => {
                    if (tabsScrollRef.current && e.deltaY !== 0) {
                      tabsScrollRef.current.scrollLeft += e.deltaY;
                    }
                  }}
                >
                  {pinnedViews.map(view => {
                    const isPinned = pinnedViewIds.includes(view);

                    const icon = view === 'list' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg> :
                      view === 'board' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg> :
                        view === 'calendar' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> :
                          view === 'gantt' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><path d="M3 7h18M3 12h10M3 17h14" /></svg> :
                            view === 'activity' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> :
                              view === 'workload' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><path d="M4 10h16" /><path d="M10 4v16" /></svg> :
                                view === 'inbox' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg> :
                                  view === 'archived' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg> :
                                    view === 'team' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> :
                                      view === 'mindmap' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><circle cx="12" cy="12" r="3" /><circle cx="5" cy="8" r="2" /><circle cx="19" cy="8" r="2" /><circle cx="5" cy="16" r="2" /><circle cx="19" cy="16" r="2" /><line x1="9.5" y1="10" x2="7" y2="9" /><line x1="14.5" y1="10" x2="17" y2="9" /><line x1="9.5" y1="14" x2="7" y2="15" /><line x1="14.5" y1="14" x2="17" y2="15" /></svg> :
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>;

                    const label = getViewLabel(view);

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

                {true && (
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
                              <div className={styles.addViewItem} onClick={() => { setActiveView('team'); setPinnedViews(prev => prev.includes('team') ? prev : [...prev, 'team']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Team</div>
                                  <div className={styles.addViewSub}>Visualize team workload & stats</div>
                                </div>
                              </div>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('archived'); setPinnedViews(prev => prev.includes('archived') ? prev : [...prev, 'archived']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#f1f5f9', color: '#64748b' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Archived</div>
                                  <div className={styles.addViewSub}>View & restore hidden tasks</div>
                                </div>
                              </div>
                              <div className={styles.addViewItem} onClick={() => { setActiveView('mindmap'); setPinnedViews(prev => prev.includes('mindmap') ? prev : [...prev, 'mindmap']); setIsAddViewDropdownOpen(false); }}>
                                <div className={styles.addViewIcon} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><circle cx="5" cy="8" r="2" /><circle cx="19" cy="8" r="2" /><circle cx="5" cy="16" r="2" /><circle cx="19" cy="16" r="2" /><line x1="9.5" y1="10" x2="7" y2="9" /><line x1="14.5" y1="10" x2="17" y2="9" /><line x1="9.5" y1="14" x2="7" y2="15" /><line x1="14.5" y1="14" x2="17" y2="15" /></svg>
                                </div>
                                <div className={styles.addViewText}>
                                  <div className={styles.addViewTitle}>Mind Map</div>
                                  <div className={styles.addViewSub}>Map lists & tasks in a tree</div>
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

          <div
            className={styles.dataArea}
            style={{
              padding: activeView === 'mindmap' ? 0 : undefined,
              overflow: activeView === 'mindmap' ? 'hidden' : undefined,
              display: activeView === 'mindmap' ? 'flex' : undefined,
              flexDirection: activeView === 'mindmap' ? 'column' : undefined,
            }}
          >
            {activeItem && activeView === 'mindmap' && (
              <SpaceMindMapView
                activeType={activeItem.type}
                activeId={activeItem.id}
                rootLabel={getItemName(activeItem.type, activeItem.id) || 'Untitled'}
                lists={lists}
                folders={folders}
                tasks={currentTasks.map(t => ({
                  id: t.id,
                  listId: t.listId,
                  title: t.title,
                  status: t.status,
                  priority: t.priority,
                  parentTaskId: t.parentTaskId ?? mindMapParents[t.id] ?? null,
                }))}
                getStatusStyles={getStatusStyles}
                onTaskOpen={handleMindMapTaskOpen}
                onCreateTask={handleMindMapCreateTask}
                onDeleteTask={handleMindMapDeleteTask}
                defaultListId={resolveMindMapDefaultListId()}
                parentOverrides={mindMapParents}
              />
            )}

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
                          className={`${styles.taskCard} ${selectedTaskIds.has(task.id) ? styles.taskCardSelected : ''}`}
                          draggable
                          onClick={(e) => {
                            e.stopPropagation();
                            if (selectedTaskIds.size > 0) {
                              // In selection mode: toggle this task's selection
                              setSelectedTaskIds(prev => {
                                const next = new Set(prev);
                                if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                                return next;
                              });
                            } else {
                              openModal('Rename', task.id, 'task', task.title, task);
                            }
                          }}
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onContextMenu={(e) => handleContextMenu(e, 'task', task.id)}
                        >
                          {getTaskImages(task).length > 0 && (
                            <div className={styles.taskCardCover}>
                              <TaskImageCarousel
                                images={getTaskImages(task)}
                                alt=""
                                className={styles.taskCardCoverImg}
                              />
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {task.title}
                              {task.is_favorite && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2L15 8L22 9L17 14L18 21L12 17L6 21L7 14L2 9L9 8L12 2Z" /></svg>
                              )}
                            </div>
                            <button className={styles.addBtn} style={{ padding: '0 4px', fontSize: '16px', marginTop: '-4px' }} onClick={(e) => { e.stopPropagation(); handleContextMenu(e, 'task', task.id); }}>⋯</button>
                          </div>

                          {task.description && (
                            <div className={styles.taskCardDescription} title={task.description}>
                              {task.description}
                            </div>
                          )}

                          <div className={styles.cardFooter}>
                            <div className={styles.cardFooterIcon} title="Assignee" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>{formatAssignee(task.assignee)}</span>
                            </div>

                            {task.dueDate && (
                              <div className={styles.cardFooterIcon} title="Due Date" style={{ color: isOverdue(task.dueDate) ? '#ef4444' : 'inherit' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                <span style={{ color: isOverdue(task.dueDate) ? '#ef4444' : 'inherit', fontWeight: isOverdue(task.dueDate) ? 600 : 'normal' }}>
                                  {task.dueDate}
                                </span>
                              </div>
                            )}

                            <div className={styles.cardFooterIcon} title="Priority" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill={task.priority === 'Urgent' ? '#ef4444' : 'none'} stroke={task.priority === 'Urgent' ? '#ef4444' : task.priority === 'High' ? '#f59e0b' : '#3b82f6'} strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: task.priority === 'Urgent' ? '#ef4444' : task.priority === 'High' ? '#f59e0b' : '#3b82f6', textTransform: 'uppercase' }}>
                                {task.priority}
                              </span>
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
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '300px', position: 'relative' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '12px', color: '#94a3b8' }}>
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      className={styles.filterSelect}
                      value={listSearchQuery}
                      onChange={e => setListSearchQuery(e.target.value)}
                      style={{ paddingLeft: '36px' }}
                    />
                  </div>
                  <select
                    className={styles.filterSelect}
                    value={listStatusFilter}
                    onChange={e => setListStatusFilter(e.target.value)}
                    style={{ width: '160px' }}
                  >
                    <option value="All">All Statuses</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className={styles.listViewContainer}>

                  {statuses.filter(s => listStatusFilter === 'All' || s === listStatusFilter).map(status => {
                    const colTasks = currentTasks.filter(t => t.status === status).filter(t => 
                      t.title.toLowerCase().includes(listSearchQuery.toLowerCase()) ||
                      (t.description && t.description.toLowerCase().includes(listSearchQuery.toLowerCase())) ||
                      (t.assignee && t.assignee.toLowerCase().includes(listSearchQuery.toLowerCase()))
                    );
                    const { color: statusColor, bg: statusBg } = getStatusStyles(status);

                    return (
                      <div 
                        key={status} 
                        className={styles.statusGroup}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedTask && draggedTask.status !== status) {
                            setTasks(prev => prev.map(t => 
                              t.id === draggedTask.id ? { ...t, status } : t
                            ));
                            fetch('/api/admin/project-tasks', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: draggedTask.id, status })
                            }).then(() => fetchLogs());
                          }
                          setDraggedTask(null);
                        }}
                      >
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
                          <div 
                            key={task.id} 
                            className={styles.listRow}
                            draggable
                            onDragStart={(e) => {
                              setDraggedTask(task);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setDraggedTask(null)}
                            style={{ 
                              opacity: draggedTask?.id === task.id ? 0.5 : 1, 
                              cursor: 'grab' 
                            }}
                          >
                            <div className={styles.taskNameCell} onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}>
                              <div className={styles.statusIconCircle} style={{ borderColor: statusColor }} onClick={(e) => { e.stopPropagation(); handleContextMenu(e, 'statusGroup', status); }}>
                                {status === 'COMPLETE' && <svg width="8" height="8" viewBox="0 0 24 24" fill={statusColor}><path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z" /></svg>}
                              </div>
                              <span style={{ color: status === 'COMPLETE' ? '#94a3b8' : 'inherit', textDecoration: status === 'COMPLETE' ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {task.title}
                                {task.is_favorite && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2L15 8L22 9L17 14L18 21L12 17L6 21L7 14L2 9L9 8L12 2Z" /></svg>
                                )}
                              </span>
                            </div>

                            <div className={styles.cellIcon} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                              <span style={{ fontSize: '13px', color: '#64748b' }}>{formatAssignee(task.assignee)}</span>
                            </div>

                            <div className={styles.cellIcon} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: isOverdue(task.dueDate) ? '#ef4444' : 'inherit' }} onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                              <span style={{ color: isOverdue(task.dueDate) ? '#ef4444' : 'inherit', fontWeight: isOverdue(task.dueDate) ? 600 : 'normal' }}>
                                {task.dueDate || '-'}
                              </span>
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
              </>
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
                    <div className={styles.calendarMonthContainer}>
                      <div className={styles.calendarWeekdayHeaders}>
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                          <div key={day} className={styles.weekdayHeader}>{day}</div>
                        ))}
                      </div>
                      <div className={styles.calendarWeeksBody}>
                        {(() => {
                          const days: { date: Date; isCurrentMonth: boolean }[] = [];
                          const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
                          const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
                          const startDay = startOfMonth.getDay();
                          for (let i = startDay - 1; i >= 0; i--) {
                            days.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth(), -i), isCurrentMonth: false });
                          }
                          for (let i = 1; i <= endOfMonth.getDate(); i++) {
                            days.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth(), i), isCurrentMonth: true });
                          }
                          const remaining = 42 - days.length;
                          for (let i = 1; i <= remaining; i++) {
                            days.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, i), isCurrentMonth: false });
                          }
                          const weeks: { date: Date; isCurrentMonth: boolean }[][] = [];
                          for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
                          const todayStr = new Date().toDateString();

                          return weeks.map((week, weekIdx) => {
                            const weekStart = localDateStr(week[0].date);
                            const weekEnd = localDateStr(week[6].date);

                            const weekTasks = currentTasks.filter(task => {
                              const s = task.startDate || task.dueDate;
                              const e = task.dueDate || task.startDate;
                              if (!s || !e) return false;
                              return s <= weekEnd && e >= weekStart;
                            });

                            // Greedy slot assignment to stack non-overlapping bars
                            type SlotEntry = { startCol: number; endCol: number; slot: number };
                            const slotEntries: SlotEntry[] = [];
                            const taskSlots: Record<string, number> = {};
                            weekTasks.forEach(task => {
                              const ts = task.startDate || task.dueDate || '';
                              const te = task.dueDate || task.startDate || '';
                              const scIdx = ts < weekStart ? 0 : week.findIndex(d => localDateStr(d.date) === ts);
                              const ecIdx = te > weekEnd ? 6 : week.findIndex(d => localDateStr(d.date) === te);
                              const startCol = scIdx < 0 ? 0 : scIdx;
                              const endCol = ecIdx < 0 ? 6 : ecIdx;
                              let slot = 0;
                              while (slotEntries.some(e => e.slot === slot && !(e.endCol < startCol || e.startCol > endCol))) slot++;
                              slotEntries.push({ startCol, endCol, slot });
                              taskSlots[task.id] = slot;
                            });

                            const numSlots = weekTasks.length > 0 ? Math.max(...Object.values(taskSlots)) + 1 : 0;
                            const rowMinHeight = Math.max(110, 36 + numSlots * 26 + 8);

                            return (
                              <div key={weekIdx} className={styles.calendarWeekRow} style={{ minHeight: rowMinHeight }}>
                                {week.map((dayObj, dayIdx) => {
                                  const isToday = todayStr === dayObj.date.toDateString();
                                  return (
                                    <div key={dayIdx} className={`${styles.calendarDayCell} ${!dayObj.isCurrentMonth ? styles.otherMonthCell : ''} ${isToday ? styles.todayDayCell : ''}`}>
                                      <div className={`${styles.dayLabel} ${isToday ? styles.todayLabel : ''}`}>
                                        {dayObj.date.getDate()}
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className={styles.calendarSpanBarsLayer}>
                                  {weekTasks.map(task => {
                                    const { color: statusColor } = getStatusStyles(task.status);
                                    const ts = task.startDate || task.dueDate || '';
                                    const te = task.dueDate || task.startDate || '';
                                    const scIdx = ts < weekStart ? 0 : week.findIndex(d => localDateStr(d.date) === ts);
                                    const ecIdx = te > weekEnd ? 6 : week.findIndex(d => localDateStr(d.date) === te);
                                    const startCol = scIdx < 0 ? 0 : scIdx;
                                    const endCol = ecIdx < 0 ? 6 : ecIdx;
                                    const spanCols = endCol - startCol + 1;
                                    const slot = taskSlots[task.id] || 0;
                                    const isStart = ts >= weekStart;
                                    const isEnd = te <= weekEnd;
                                    return (
                                      <div
                                        key={task.id}
                                        className={styles.calendarSpanBar}
                                        style={{
                                          left: `calc(${(startCol / 7) * 100}% + ${isStart ? 3 : 0}px)`,
                                          width: `calc(${(spanCols / 7) * 100}% - ${isStart ? 6 : 3}px)`,
                                          top: `${32 + slot * 26}px`,
                                          background: statusColor + '18',
                                          borderLeft: isStart ? `3px solid ${statusColor}` : 'none',
                                          borderRadius: isStart && isEnd ? '4px' : isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : '0',
                                          color: statusColor,
                                        }}
                                        onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}
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
                    </div>
                  ) : calendarView === 'week' ? (
                    <div className={styles.calendarMonthContainer}>
                      <div className={styles.calendarWeekdayHeaders}>
                        {Array.from({ length: 7 }).map((_, i) => {
                          const d = new Date(viewDate);
                          d.setDate(viewDate.getDate() - viewDate.getDay() + i);
                          const isToday = new Date().toDateString() === d.toDateString();
                          return (
                            <div key={i} className={`${styles.weekdayHeader} ${isToday ? styles.todayHighlight : ''}`}>
                              <span>{d.toLocaleDateString('default', { weekday: 'short' })}</span>
                              <span className={isToday ? styles.todayLabel : ''}>{d.getDate()}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className={styles.calendarWeeksBody}>
                        {(() => {
                          const days: { date: Date }[] = [];
                          for (let i = 0; i < 7; i++) {
                            const d = new Date(viewDate);
                            d.setDate(viewDate.getDate() - viewDate.getDay() + i);
                            days.push({ date: d });
                          }
                          const weekStart = localDateStr(days[0].date);
                          const weekEnd = localDateStr(days[6].date);

                          const weekTasks = currentTasks.filter(task => {
                            const s = task.startDate || task.dueDate;
                            const e = task.dueDate || task.startDate;
                            if (!s || !e) return false;
                            return s <= weekEnd && e >= weekStart;
                          });

                          type SlotEntry = { startCol: number; endCol: number; slot: number };
                          const slotEntries: SlotEntry[] = [];
                          const taskSlots: Record<string, number> = {};
                          weekTasks.forEach(task => {
                            const ts = task.startDate || task.dueDate || '';
                            const te = task.dueDate || task.startDate || '';
                            const scIdx = ts < weekStart ? 0 : days.findIndex(d => localDateStr(d.date) === ts);
                            const ecIdx = te > weekEnd ? 6 : days.findIndex(d => localDateStr(d.date) === te);
                            const startCol = scIdx < 0 ? 0 : scIdx;
                            const endCol = ecIdx < 0 ? 6 : ecIdx;
                            let slot = 0;
                            while (slotEntries.some(e => e.slot === slot && !(e.endCol < startCol || e.startCol > endCol))) slot++;
                            slotEntries.push({ startCol, endCol, slot });
                            taskSlots[task.id] = slot;
                          });

                          const numSlots = weekTasks.length > 0 ? Math.max(...Object.values(taskSlots)) + 1 : 0;
                          const rowMinHeight = Math.max(110, 36 + numSlots * 26 + 8);

                          return (
                            <div key="week" className={styles.calendarWeekRow} style={{ minHeight: rowMinHeight }}>
                              {days.map((dayObj, dayIdx) => {
                                const isToday = new Date().toDateString() === dayObj.date.toDateString();
                                return (
                                  <div key={dayIdx} className={`${styles.calendarDayCell} ${isToday ? styles.todayDayCell : ''}`}>
                                    <div className={`${styles.dayLabel} ${isToday ? styles.todayLabel : ''}`}>
                                      {dayObj.date.getDate()}
                                    </div>
                                  </div>
                                );
                              })}
                              <div className={styles.calendarSpanBarsLayer}>
                                {weekTasks.map(task => {
                                  const { color: statusColor } = getStatusStyles(task.status);
                                  const ts = task.startDate || task.dueDate || '';
                                  const te = task.dueDate || task.startDate || '';
                                  const scIdx = ts < weekStart ? 0 : days.findIndex(d => localDateStr(d.date) === ts);
                                  const ecIdx = te > weekEnd ? 6 : days.findIndex(d => localDateStr(d.date) === te);
                                  const startCol = scIdx < 0 ? 0 : scIdx;
                                  const endCol = ecIdx < 0 ? 6 : ecIdx;
                                  const spanCols = endCol - startCol + 1;
                                  const slot = taskSlots[task.id] || 0;
                                  const isStart = ts >= weekStart;
                                  const isEnd = te <= weekEnd;
                                  return (
                                    <div
                                      key={task.id}
                                      className={styles.calendarSpanBar}
                                      style={{
                                        left: `calc(${(startCol / 7) * 100}% + ${isStart ? 3 : 0}px)`,
                                        width: `calc(${(spanCols / 7) * 100}% - ${isStart ? 6 : 3}px)`,
                                        top: `${32 + slot * 26}px`,
                                        background: statusColor + '18',
                                        borderLeft: isStart ? `3px solid ${statusColor}` : 'none',
                                        borderRadius: isStart && isEnd ? '4px' : isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : '0',
                                        color: statusColor,
                                      }}
                                      onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}
                                      onContextMenu={(e) => handleContextMenu(e, 'task', task.id)}
                                    >
                                      {task.title}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.calendarMonthContainer}>
                      <div className={styles.calendarWeekdayHeaders}>
                        {(() => {
                          const isToday = new Date().toDateString() === viewDate.toDateString();
                          return (
                            <div className={`${styles.weekdayHeader} ${isToday ? styles.todayHighlight : ''}`} style={{ gridColumn: '1 / 8' }}>
                              <span>{viewDate.toLocaleDateString('default', { weekday: 'long' })}</span>
                              <span className={isToday ? styles.todayLabel : ''}>{viewDate.getDate()}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className={styles.calendarWeeksBody}>
                        {(() => {
                          const days: { date: Date }[] = [{ date: new Date(viewDate) }];
                          const dayStart = localDateStr(viewDate);
                          const dayEnd = localDateStr(viewDate);

                          const dayTasks = currentTasks.filter(task => {
                            const s = task.startDate || task.dueDate;
                            const e = task.dueDate || task.startDate;
                            if (!s || !e) return false;
                            return s <= dayEnd && e >= dayStart;
                          });

                          type SlotEntry = { startCol: number; endCol: number; slot: number };
                          const slotEntries: SlotEntry[] = [];
                          const taskSlots: Record<string, number> = {};
                          dayTasks.forEach(task => {
                            const startCol = 0;
                            const endCol = 0;
                            let slot = 0;
                            while (slotEntries.some(e => e.slot === slot && !(e.endCol < startCol || e.startCol > endCol))) slot++;
                            slotEntries.push({ startCol, endCol, slot });
                            taskSlots[task.id] = slot;
                          });

                          const numSlots = dayTasks.length > 0 ? Math.max(...Object.values(taskSlots)) + 1 : 0;
                          const rowMinHeight = Math.max(110, 36 + numSlots * 26 + 8);

                          return (
                            <div key="day" className={styles.calendarWeekRow} style={{ minHeight: rowMinHeight }}>
                              {days.map((dayObj, dayIdx) => {
                                const isToday = new Date().toDateString() === dayObj.date.toDateString();
                                return (
                                  <div key={dayIdx} className={`${styles.calendarDayCell} ${isToday ? styles.todayDayCell : ''}`} style={{ gridColumn: '1 / 8' }}>
                                    <div className={`${styles.dayLabel} ${isToday ? styles.todayLabel : ''}`}>
                                      {dayObj.date.getDate()}
                                    </div>
                                  </div>
                                );
                              })}
                              <div className={styles.calendarSpanBarsLayer}>
                                {dayTasks.map(task => {
                                  const { color: statusColor } = getStatusStyles(task.status);
                                  const slot = taskSlots[task.id] || 0;
                                  return (
                                    <div
                                      key={task.id}
                                      className={styles.calendarSpanBar}
                                      style={{
                                        left: `calc(0% + 3px)`,
                                        width: `calc(100% - 6px)`,
                                        top: `${32 + slot * 26}px`,
                                        background: statusColor + '18',
                                        borderLeft: `3px solid ${statusColor}`,
                                        borderRadius: '4px',
                                        color: statusColor,
                                      }}
                                      onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}
                                      onContextMenu={(e) => handleContextMenu(e, 'task', task.id)}
                                    >
                                      {task.title}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
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
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', gap: '12px', padding: '0 0 16px 0' }}>
                  <select
                    value={tableAssigneeFilter}
                    onChange={e => setTableAssigneeFilter(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: '#fff', cursor: 'pointer', color: '#1e293b' }}
                  >
                    <option value="All">All Assignees</option>
                    {Array.from(new Set(tasks.map(t => formatAssignee(t.assignee)))).map(a => <option key={a} value={a}>{a}</option>)}
                  </select>

                  <select
                    value={tableStatusFilter}
                    onChange={e => setTableStatusFilter(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: '#fff', cursor: 'pointer', color: '#1e293b' }}
                  >
                    <option value="All">All Statuses</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <select
                    value={tablePriorityFilter}
                    onChange={e => setTablePriorityFilter(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', background: '#fff', cursor: 'pointer', color: '#1e293b' }}
                  >
                    <option value="All">All Priorities</option>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

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
                      {currentTasks.filter(task => {
                        if (tableAssigneeFilter !== 'All' && formatAssignee(task.assignee) !== tableAssigneeFilter) return false;
                        if (tableStatusFilter !== 'All' && task.status !== tableStatusFilter) return false;
                        if (tablePriorityFilter !== 'All' && (task.priority || 'Normal') !== tablePriorityFilter) return false;
                        return true;
                      }).map((task, index) => (
                        <tr key={task.id} style={{ cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => openModal('Rename', task.id, 'task', task.title, task)} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          <td style={{ color: '#94a3b8', fontSize: '11px' }}>{index + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className={styles.statusIconCircle} style={{ borderColor: getStatusStyles(task.status).color, width: '12px', height: '12px' }}></div>
                              {task.title}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600 }}>
                                {task.assignee ? formatAssignee(task.assignee)[0] : '?'}
                              </div>
                              <span style={{ fontSize: '12px' }}>{formatAssignee(task.assignee)}</span>
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
                          const name = formatAssignee(t.assignee);
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
                            {task.assignee ? formatAssignee(task.assignee)[0] : 'U'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', color: '#475569' }}>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{formatAssignee(task.assignee) || 'Someone'}</span> updated task
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

            {activeItem && activeView === 'team' && (
              <div className={styles.teamContainer}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '280px', position: 'relative' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '12px', color: '#94a3b8' }}>
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search team members..."
                      className={styles.filterSelect}
                      value={teamSearchQuery}
                      onChange={e => setTeamSearchQuery(e.target.value)}
                      style={{ paddingLeft: '36px', width: '100%' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                  {(() => {
                    const members = Array.from(new Set(currentTasks.map(t => formatAssignee(t.assignee))));
                    const sortedMembers = members.sort((a, b) => {
                      if (a === 'Unassigned') return -1;
                      if (b === 'Unassigned') return 1;
                      return a.localeCompare(b);
                    }).filter(member => 
                      member.toLowerCase().includes(teamSearchQuery.toLowerCase())
                    );

                    return sortedMembers.map(member => {
                      const memberTasks = currentTasks.filter(t => formatAssignee(t.assignee) === member);
                      const done = memberTasks.filter(t => t.status === 'COMPLETE').length;
                      const notDone = memberTasks.length - done;
                      const progress = memberTasks.length > 0 ? (done / memberTasks.length) * 100 : 0;

                      return (
                        <div key={member} className={styles.memberCard}>
                          <div className={styles.memberHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div className={styles.memberAvatar} style={{
                                background: member === 'Unassigned' ? '#f1f5f9' : `hsl(${member.length * 40 % 360}, 70%, 90%)`,
                                color: member === 'Unassigned' ? '#64748b' : `hsl(${member.length * 40 % 360}, 70%, 40%)`
                              }}>
                                {member === 'Unassigned' ? '?' : member.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </div>
                              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{member}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                            </div>
                          </div>

                          <div className={styles.memberBody}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                              <div style={{ display: 'flex', gap: '24px' }}>
                                <div>
                                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{notDone}</div>
                                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Not done</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>{done}</div>
                                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Done</div>
                                </div>
                              </div>
                              <div style={{ position: 'relative', width: '56px', height: '56px' }}>
                                <svg width="56" height="56" viewBox="0 0 36 36">
                                  <circle cx="18" cy="18" r="16" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                                  <circle cx="18" cy="18" r="16" fill="none" stroke={progress === 100 ? '#10b981' : '#2563eb'} strokeWidth="3" strokeDasharray={`${progress} 100`} transform="rotate(-90 18 18)" strokeLinecap="round" />
                                </svg>
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>
                                  {Math.round(progress)}%
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {statuses.filter(s => s !== 'COMPLETE').map(status => {
                                const statusTasks = memberTasks.filter(t => t.status === status);
                                if (statusTasks.length === 0) return null;
                                const expandedKey = `${member}-${status}`;
                                const isExpanded = expandedTeamStatuses[expandedKey];

                                return (
                                  <div key={status} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div
                                      className={styles.memberStatusRow}
                                      style={{ cursor: 'pointer' }}
                                      onClick={() => setExpandedTeamStatuses(prev => ({ ...prev, [expandedKey]: !prev[expandedKey] }))}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#94a3b8', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                                          <path d="m9 18 6-6-6-6" />
                                        </svg>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: getStatusStyles(status).color }}></div>
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{status}</span>
                                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>({statusTasks.length})</span>
                                      </div>
                                    </div>

                                    {isExpanded && (
                                      <div style={{ paddingLeft: '26px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {statusTasks.map(task => (
                                          <div
                                            key={task.id}
                                            className={styles.teamTaskItem}
                                            onClick={(e) => { e.stopPropagation(); openModal('Rename', task.id, 'task', task.title, task); }}
                                          >
                                            <div
                                              className={styles.teamTaskIcon}
                                              style={{ color: getStatusStyles(status).color }}
                                            />
                                            <span className={styles.teamTaskTitle}>{task.title}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {activeItem && activeView === 'activity' && (
              <div className={styles.activityContainer}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '24px' }}>Activity</div>

                {(() => {
                  const filteredLogs = activityLogs.filter(log => currentTasks.some(t => t.id === log.task_id));

                  if (filteredLogs.length === 0) {
                    return (
                      <div className={styles.emptyInbox}>
                        <div className={styles.emptyInboxIcon}>📋</div>
                        <h3>No activity in this {activeItem.type} yet</h3>
                        <p>Actions like moving tasks or changing statuses within this {activeItem.type} will appear here.</p>
                      </div>
                    );
                  }

                  // 1. Group by Date (Today, Yesterday, Older)
                  const dateGroups: Record<string, Record<string, ActivityLog[]>> = {};

                  const getGroupKey = (dateStr: string) => {
                    const d = new Date(dateStr);
                    const today = new Date();
                    const yesterday = new Date();
                    yesterday.setDate(today.getDate() - 1);

                    if (d.toDateString() === today.toDateString()) return 'Today';
                    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
                    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                  };

                  filteredLogs.forEach(log => {
                    const groupKey = getGroupKey(log.created_at);
                    if (!dateGroups[groupKey]) dateGroups[groupKey] = {};
                    if (!dateGroups[groupKey][log.task_id]) dateGroups[groupKey][log.task_id] = [];
                    dateGroups[groupKey][log.task_id].push(log);
                  });

                  const timeAgo = (date: string) => {
                    return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                  };

                  return Object.entries(dateGroups).map(([dateLabel, taskGroups]) => (
                    <div key={dateLabel} style={{ marginBottom: '32px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                        {dateLabel}
                      </div>

                      {Object.entries(taskGroups).map(([taskId, logs]) => {
                        const task = tasks.find(t => t.id === taskId);
                        const taskTitle = task ? task.title : 'Deleted Task';
                        const listName = task ? (lists.find(l => l.id === task.listId)?.name || 'General') : 'N/A';

                        return (
                          <div key={taskId} className={styles.activityCard} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: task ? '#94a3b8' : '#ef4444' }}></div>
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '15px' }}>{taskTitle}</span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b', marginLeft: '16px', marginTop: '2px' }}>{listName}</div>
                            </div>

                            <div style={{ padding: '8px 0' }}>
                              {logs.map(log => (
                                <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', transition: 'background 0.2s ease' }} className={styles.activityLogRow}>
                                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#475569' }}>
                                    {log.user_type === 'admin' ? 'Me' : 'U'}
                                  </div>
                                  <div style={{ flex: 1, fontSize: '13px', color: '#334155' }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{log.user_type === 'admin' ? 'You' : 'User'}</span>
                                    {log.action_type === 'creation' && <> created this task</>}
                                    {log.action_type === 'status_change' && (
                                      <> changed status from <strong style={{ color: '#64748b' }}>{log.previous_value}</strong> to <span style={{ color: getStatusStyles(log.new_value!).color, background: getStatusStyles(log.new_value!).bg, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, marginLeft: '4px' }}>{log.new_value}</span></>
                                    )}
                                    {log.action_type === 'archive' && <> archived this task</>}
                                    {log.action_type === 'unarchive' && <> restored this task</>}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                    {dateLabel === 'Today' || dateLabel === 'Yesterday' ? `${dateLabel} at ${timeAgo(log.created_at)}` : timeAgo(log.created_at)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            )}

            {activeItem && activeView === 'workload' && (
              <div className={styles.workloadContainer}>
                <div className={styles.workloadHeader}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Workload</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setBacklogOpen(!backlogOpen)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: backlogOpen ? '1px solid #2563eb' : '1px solid #e2e8f0',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: backlogOpen ? '#2563eb' : '#475569',
                        background: backlogOpen ? '#eff6ff' : 'white',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                      </svg>
                      Backlog
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '280px', position: 'relative' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '12px', color: '#94a3b8' }}>
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                      <input
                        type="text"
                        placeholder="Search assignees..."
                        className={styles.filterSelect}
                        value={workloadSearchQuery}
                        onChange={e => setWorkloadSearchQuery(e.target.value)}
                        style={{ paddingLeft: '36px', width: '100%' }}
                      />
                    </div>
                    <select
                      value={workloadRange}
                      onChange={(e) => setWorkloadRange(parseInt(e.target.value))}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 500, color: '#475569', outline: 'none' }}
                    >
                      <option value={14}>14 days</option>
                      <option value={30}>1 Month</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                  <div className={styles.workloadGrid} style={{ flex: backlogOpen ? 3 : 1 }}>
                  <div className={styles.workloadGridHeader}>
                    <div className={styles.workloadAssigneeCol}>Assignee</div>
                    {[...Array(workloadRange)].map((_, i) => {
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

                  {/* Assignee Rows */}
                  {(() => {
                    const rangeStart = new Date();
                    rangeStart.setHours(0, 0, 0, 0);

                    const assignees = Array.from(new Set(currentTasks.map(t => formatAssignee(t.assignee))));
                    if (assignees.length === 0) assignees.push('You', 'Unassigned');

                    return assignees.filter(assignee => 
                      assignee.toLowerCase().includes(workloadSearchQuery.toLowerCase())
                    ).map(assignee => {
                      const assigneeTasks = currentTasks.filter(
                        t => formatAssignee(t.assignee) === assignee && t.status !== 'COMPLETE'
                      );
                      const taskDistributions = assigneeTasks.map(t => ({
                        task: t,
                        dist: distributeTaskHours(t),
                      }));
                      const workloadTasks = taskDistributions.filter(td => Object.keys(td.dist).length > 0);
                      const totalHours = workloadTasks.reduce(
                        (sum, td) => sum + sumHoursInRange(td.dist, rangeStart, workloadRange),
                        0
                      );

                      return (
                        <div key={assignee} className={styles.workloadRow}>
                          <div className={styles.workloadAssigneeCol}>
                            <div className={styles.workloadAvatar}>{assignee[0]}</div>
                            <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px', flex: 1 }}>{assignee}</span>
                            <div style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              {formatWorkloadHours(totalHours)}/40h
                            </div>
                          </div>
                          {[...Array(workloadRange)].map((_, i) => {
                            const d = new Date(rangeStart);
                            d.setDate(d.getDate() + i);
                            const dateString = toDateKey(d);

                            const tasksOnDate = workloadTasks.filter(
                              td => (td.dist[dateString] ?? 0) > 0
                            );
                            const hoursOnDate = Math.round(
                              tasksOnDate.reduce((sum, td) => sum + (td.dist[dateString] ?? 0), 0) * 10
                            ) / 10;
                            const hasTask = hoursOnDate > 0;

                            return (
                              <div key={i} className={styles.workloadCell} style={{ position: 'relative' }}>
                                <div 
                                  className={`${styles.workloadCellBox} ${hasTask ? styles.workloadCellBoxActive : ''}`}
                                  onMouseEnter={() => setHoveredWorkloadCell({ assignee, date: dateString })}
                                  onMouseLeave={() => setHoveredWorkloadCell(null)}
                                >
                                  {formatWorkloadHours(hoursOnDate)}
                                  {hasTask && <div className={styles.workloadTaskCount}>{tasksOnDate.length}</div>}
                                </div>
                                {hoveredWorkloadCell?.assignee === assignee && hoveredWorkloadCell?.date === dateString && (
                                  <div style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    marginBottom: '8px',
                                    background: '#0f172a',
                                    color: 'white',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    whiteSpace: 'nowrap',
                                    zIndex: 100,
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                  }}>
                                    {hasTask ? (
                                      tasksOnDate.map((td, idx) => (
                                        <div key={idx}>{td.task.title}</div>
                                      ))
                                    ) : (
                                      <div>Nothing scheduled</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    });
                  })()}
                </div>

                {backlogOpen && (
                  <div style={{
                    width: '420px',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{
                      padding: '16px',
                      borderBottom: '1px solid #e2e8f0',
                      background: '#f8fafc'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Tasks</div>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: '#64748b', flexWrap: 'wrap' }}>
                        {['Unscheduled', 'No estimate', 'Overdue', 'Unassigned'].map(tab => (
                          <div
                            key={tab}
                            onClick={() => setActiveBacklogTab(tab)}
                            style={{
                              fontWeight: activeBacklogTab === tab ? 600 : 500,
                              color: activeBacklogTab === tab ? '#0f172a' : '#64748b',
                              borderBottom: activeBacklogTab === tab ? '2px solid #0f172a' : '2px solid transparent',
                              paddingBottom: '8px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              flexShrink: 0
                            }}
                          >
                            {tab}
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '12px', position: 'relative' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.35-4.35" />
                        </svg>
                        <input
                          type="text"
                          placeholder="Search tasks..."
                          value={backlogSearchQuery}
                          onChange={e => setBacklogSearchQuery(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            paddingLeft: '36px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <select
                          value={backlogSortBy}
                          onChange={e => setBacklogSortBy(e.target.value)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: '#0f172a',
                            outline: 'none',
                            background: '#f8fafc',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <option value="All Priority">All Priority</option>
                          <option value="Urgent">Urgent</option>
                          <option value="High">High</option>
                          <option value="Normal">Normal</option>
                          <option value="Low">Low</option>
                          <option value="Clear">Clear</option>
                        </select>
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b' }}>
                        {(() => {
                          const rangeStart = new Date();
                          rangeStart.setHours(0,0,0,0);
                          const rangeEnd = new Date();
                          rangeEnd.setDate(rangeEnd.getDate() + workloadRange);
                          
                          let filtered = currentTasks.filter(task => {
                            const matchesSearch = task.title.toLowerCase().includes(backlogSearchQuery.toLowerCase());
                            const normalizedStatus = task.status.toUpperCase();
                            const isCompleted = normalizedStatus.includes('COMPLETE') || normalizedStatus.includes('DONE');
                            return matchesSearch && !isCompleted;
                          });
                          
                          if (activeBacklogTab === 'Unscheduled') {
                            filtered = filtered.filter(task => {
                              const missingStart = !task.startDate;
                              const missingDue = !task.dueDate;
                              
                              if (missingStart || missingDue) {
                                return true;
                              }
                              
                              const start = new Date(task.startDate!);
                              const due = new Date(task.dueDate!);
                              
                              const taskStartsAfterRange = start > rangeEnd;
                              const taskEndsBeforeRange = due < rangeStart;
                              
                              return taskStartsAfterRange || taskEndsBeforeRange;
                            });
                          } else if (activeBacklogTab === 'Overdue') {
                            filtered = filtered.filter(task => 
                              task.dueDate && new Date(task.dueDate) < rangeStart
                            );
                          } else if (activeBacklogTab === 'No estimate') {
                            filtered = filtered.filter(task => 
                              !task.timeEstimateHours || task.timeEstimateHours === 0
                            );
                          } else if (activeBacklogTab === 'Unassigned') {
                            filtered = filtered.filter(task => 
                              !task.assignee || task.assignee.trim() === ''
                            );
                          }
                          
                          if (backlogSortBy !== 'All Priority') {
                            filtered = filtered.filter(task => task.priority === backlogSortBy);
                          }
                          
                          return `${filtered.length} tasks`;
                        })()}
                      </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
                      {(() => {
                        const rangeStart = new Date();
                        rangeStart.setHours(0,0,0,0);
                        const rangeEnd = new Date();
                        rangeEnd.setDate(rangeEnd.getDate() + workloadRange);
                        
                        let filteredTasks = currentTasks.filter(task => {
                          const matchesSearch = task.title.toLowerCase().includes(backlogSearchQuery.toLowerCase());
                          const normalizedStatus = task.status.toUpperCase();
                          const isCompleted = normalizedStatus.includes('COMPLETE') || normalizedStatus.includes('DONE');
                          return matchesSearch && !isCompleted;
                        });
                        
                        if (activeBacklogTab === 'Unscheduled') {
                          filteredTasks = filteredTasks.filter(task => {
                            const missingStart = !task.startDate;
                            const missingDue = !task.dueDate;
                            
                            if (missingStart || missingDue) {
                              return true;
                            }
                            
                            const start = new Date(task.startDate!);
                            const due = new Date(task.dueDate!);
                            
                            const taskStartsAfterRange = start > rangeEnd;
                            const taskEndsBeforeRange = due < rangeStart;
                            
                            return taskStartsAfterRange || taskEndsBeforeRange;
                          });
                        } else if (activeBacklogTab === 'Overdue') {
                          filteredTasks = filteredTasks.filter(task => 
                            task.dueDate && new Date(task.dueDate) < rangeStart
                          );
                        } else if (activeBacklogTab === 'No estimate') {
                          filteredTasks = filteredTasks.filter(task => 
                            !task.timeEstimateHours || task.timeEstimateHours === 0
                          );
                        } else if (activeBacklogTab === 'Unassigned') {
                          filteredTasks = filteredTasks.filter(task => 
                            !task.assignee || task.assignee.trim() === ''
                          );
                        }
                        
                        if (backlogSortBy !== 'All Priority') {
                          filteredTasks = filteredTasks.filter(task => task.priority === backlogSortBy);
                        }

                        const priorityOrder = ['Urgent', 'High', 'Normal', 'Low', 'Clear'];
                        const sortedTasks = [...filteredTasks].sort((a, b) => {
                          const indexA = priorityOrder.indexOf(a.priority || 'Normal');
                          const indexB = priorityOrder.indexOf(b.priority || 'Normal');
                          return indexA - indexB;
                        });
                        
                        return sortedTasks.map(task => (
                          <div key={task.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 0',
                            borderBottom: '1px solid #f1f5f9',
                            cursor: 'pointer'
                          }} onClick={() => openModal('Rename', task.id, 'task', task.title, task)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                            </svg>
                            <div style={{ fontSize: '14px', color: '#0f172a', fontWeight: 500 }}>{task.title}</div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}

            {activeItem && activeView === 'inbox' && (
              <div className={styles.inboxContainer}>
                <div className={styles.inboxHeader}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>Inbox</h2>
                </div>

                <div className={styles.inboxList}>
                  {(() => {
                    const reminderItems = tasks.filter(t => t.reminder_at && new Date(t.reminder_at).getTime() <= currentTime).map(task => {
                      const taskPath = getTaskPath(task);
                      return {
                        id: `reminder-${task.id}`,
                        taskId: task.id,
                        type: 'reminder',
                        time: new Date(task.reminder_at!).getTime(),
                        status: task.status,
                        subtitle: '⏰ REMINDER',
                        badgeColor: '#2563eb',
                        title: task.title,
                        description: `${task.description || 'No description provided.'}${taskPath ? `\nIn: ${taskPath}` : ''}`,
                        dateLabel: `Scheduled for: ${new Date(task.reminder_at!).toLocaleString()}`,
                        onClear: () => setTaskReminder(task.id, null),
                        showOptions: true,
                      };
                    });

                    const followedTaskIdsInView = tasks.filter(t => followedTaskIds.includes(t.id)).map(t => t.id);
                    const followedActivityLogs = activityLogs.filter(log =>
                      followedTaskIdsInView.includes(log.task_id) && !dismissedActivityIds.includes(log.id)
                    );

                    const activityItems = followedActivityLogs.map(log => {
                      const task = tasks.find(t => t.id === log.task_id);
                      const taskPath = task ? getTaskPath(task) : '';
                      let changeDescription = '';
                      if (log.action_type === 'creation') {
                        changeDescription = `Task created with status: ${log.new_value}`;
                      } else if (log.action_type === 'status_change') {
                        changeDescription = `Status updated from "${log.previous_value || 'None'}" to "${log.new_value}"`;
                      } else if (log.action_type === 'list_id_change') {
                        const oldListName = lists.find(l => l.id === log.previous_value)?.name || 'Unknown List';
                        const newListName = lists.find(l => l.id === log.new_value)?.name || 'Unknown List';
                        changeDescription = `Moved from "${oldListName}" to "${newListName}"`;
                      } else if (log.action_type === 'archive') {
                        changeDescription = `Task was archived`;
                      } else if (log.action_type === 'unarchive') {
                        changeDescription = `Task was restored from archive`;
                      } else {
                        const field = log.action_type.replace('_change', '');
                        const capitalizedField = field.charAt(0).toUpperCase() + field.slice(1);
                        changeDescription = `${capitalizedField} updated from "${log.previous_value || ''}" to "${log.new_value || ''}"`;
                      }

                      return {
                        id: `activity-${log.id}`,
                        taskId: log.task_id,
                        type: 'activity',
                        time: new Date(log.created_at).getTime(),
                        status: task ? task.status : 'TO DO',
                        subtitle: `📢 UPDATE: ${log.action_type.toUpperCase().replace('_', ' ')}`,
                        badgeColor: '#10b981',
                        title: task ? task.title : 'Unknown Task',
                        description: `${changeDescription}${taskPath ? `\nIn: ${taskPath}` : ''}`,
                        dateLabel: `Activity at: ${new Date(log.created_at).toLocaleString()}`,
                        onClear: () => dismissActivity(log.id),
                        showOptions: false,
                      };
                    });

                    const combinedItems = [...reminderItems, ...activityItems].sort((a, b) => b.time - a.time);

                    if (combinedItems.length === 0) {
                      return (
                        <div className={styles.emptyInbox}>
                          <div className={styles.emptyInboxIcon}>📬</div>
                          <h3>Your inbox is empty</h3>
                          <p>All caught up! New reminders and followed task updates will appear here.</p>
                        </div>
                      );
                    }

                    return combinedItems.map(item => (
                      <div key={item.id} className={styles.inboxItem}>
                        <div className={styles.inboxItemStatus} style={{ background: getStatusStyles(item.status).bg }}></div>
                        <div className={styles.inboxItemContent}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{item.status}</span>
                              <span style={{ fontSize: '11px', color: item.badgeColor, fontWeight: 700 }}>{item.subtitle}</span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{item.dateLabel}</span>
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>{item.title}</div>
                          <div style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'pre-line' }}>{item.description}</div>
                        </div>
                        <div className={styles.inboxItemActions}>
                          <button className={styles.inboxActionBtn} title="Dismiss" onClick={item.onClear}>✓</button>
                          {item.showOptions && (
                            <button className={styles.inboxActionBtn} title="Options" onClick={(e) => { e.stopPropagation(); handleContextMenu(e, 'task', item.taskId, 'remind'); }}>⋯</button>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {activeView === 'archived' && (
              <div className={styles.dataArea} style={{ background: 'white' }}>
                <div style={{ padding: '0 24px 24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Archived Tasks</h2>
                  <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Tasks in this list are hidden from your active workspace. You can restore them at any time.</p>

                  <div className={styles.inboxList}>
                    {currentTasks.length === 0 ? (
                      <div className={styles.emptyInbox}>
                        <div className={styles.emptyInboxIcon}>📁</div>
                        <h3>No archived tasks</h3>
                        <p>Archive tasks to keep your views clean and organized.</p>
                      </div>
                    ) : (
                      currentTasks.map(task => (
                        <div key={task.id} className={styles.inboxItem}>
                          <div className={styles.inboxItemStatus} style={{ background: getStatusStyles(task.status).bg }}></div>
                          <div className={styles.inboxItemContent}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{task.status}</span>
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>📦 ARCHIVED</span>
                              </div>
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>{task.title}</div>
                          </div>
                          <div className={styles.archivedItemActions}>
                            <button
                              className={styles.restoreBtn}
                              onClick={() => unarchiveTask(task.id)}
                            >
                              Restore Task
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', marginTop: '4px' }}>
                    {modalConfig.type === 'Rename' ? (modalConfig.targetType === 'task' ? 'Edit Task' : `Rename ${modalConfig.targetType}`) :
                      modalConfig.type === 'Delete' ? `Delete ${modalConfig.targetType}` :
                        modalConfig.type === 'Archive' ? (
                          modalConfig.targetType === 'statusGroup' ? 'Archive Status Group' :
                            (selectedTaskIds.size > 1 && selectedTaskIds.has(modalConfig.targetId!)) ? `Archive ${selectedTaskIds.size} Selected Tasks` :
                              'Archive Task'
                        ) :
                          modalConfig.type === 'Move' ? `Move ${modalConfig.targetType}` :
                            modalConfig.type === 'Color' ? `Choose ${modalConfig.targetType} Color` :
                              modalConfig.type === 'Task' ? 'Create New Task' :
                                `Create a ${modalConfig.type}`}
                  </div>
                </div>
                <button type="button" className={styles.closeBtn} onClick={closeModal}>×</button>
              </div>
              <div className={`${styles.modalBody} ${(modalConfig.type === 'Task' || (modalConfig.type === 'Rename' && modalConfig.targetType === 'task')) ? styles.taskModalBody : ''}`}>
                {modalConfig.type === 'Delete' ? (
                  <div style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.5' }}>
                    {modalConfig.targetType === 'task' ? (
                      (selectedTaskIds.size > 1 && selectedTaskIds.has(modalConfig.targetId!))
                        ? `Are you sure you want to delete the ${selectedTaskIds.size} selected tasks? This action is permanent and cannot be undone.`
                        : `Are you sure you want to delete this task? It will be permanently removed and cannot be restored.`
                    ) : (
                      `Are you sure you want to delete this ${modalConfig.targetType}? This action is permanent and will remove all nested items within it.`
                    )}
                  </div>
                ) : modalConfig.type === 'Archive' ? (
                  <div style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.5' }}>
                    {modalConfig.targetType === 'statusGroup' ? (
                      `Are you sure you want to archive all active tasks under status "${modalConfig.targetId}"?`
                    ) : (selectedTaskIds.size > 1 && selectedTaskIds.has(modalConfig.targetId!)) ? (
                      `Are you sure you want to archive the ${selectedTaskIds.size} selected tasks?`
                    ) : (
                      `Are you sure you want to archive this task?`
                    )}
                    <br /><br />
                    You can easily view and restore them at any time from the <strong>Archived</strong> view tab.
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
                      {modalConfig.targetType === 'task' && (
                        <>
                          <optgroup label="Change Status">
                            {['TO DO', 'PLANNING', 'IN PROGRESS', 'AT RISK', 'UPDATE REQUIRED', 'COMPLETE'].map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Move to List">
                            {lists.map(l => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </optgroup>
                        </>
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
                        <input
                          list="assignee-options"
                          placeholder="Assignee"
                          style={{ border: 'none', background: 'transparent', fontSize: 'inherit', outline: 'none', cursor: 'text', flex: 1, colorScheme: 'light' }}
                          value={modalConfig.assignee}
                          onChange={e => setModalConfig({ ...modalConfig, assignee: e.target.value })}
                        />
                        <datalist id="assignee-options">
                          {Array.from(new Set(['Me', 'Assistant', ...tasks.map(t => t.assignee).filter(Boolean)])).map(assignee => (
                            <option key={assignee} value={assignee} />
                          ))}
                        </datalist>
                      </div>

                      <div className={styles.pillBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px', marginRight: '-4px' }}>Start:</span>
                        <input
                          type="date"
                          style={{ border: 'none', background: 'transparent', fontSize: 'inherit', outline: 'none', cursor: 'pointer', flex: 1 }}
                          value={modalConfig.startDate}
                          onChange={e => setModalConfig({ ...modalConfig, startDate: e.target.value })}
                        />
                      </div>

                      <div className={styles.pillBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px', marginRight: '-4px' }}>Due:</span>
                        <input
                          type="date"
                          style={{ border: 'none', background: 'transparent', fontSize: 'inherit', outline: 'none', cursor: 'pointer', flex: 1 }}
                          value={modalConfig.dueDate}
                          onChange={e => setModalConfig({ ...modalConfig, dueDate: e.target.value })}
                        />
                      </div>

                      <div className={styles.pillBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                        <select
                          style={{ border: 'none', background: 'transparent', fontSize: 'inherit', outline: 'none', cursor: 'pointer', flex: 1 }}
                          value={modalConfig.priority}
                          onChange={e => setModalConfig({ ...modalConfig, priority: e.target.value as any })}
                        >
                          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>

                      <div className={styles.pillBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px', marginRight: '-4px' }}>Estimate:</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="Hours"
                          style={{ border: 'none', background: 'transparent', fontSize: 'inherit', outline: 'none', flex: 1, width: '60px' }}
                          value={modalConfig.timeEstimate}
                          onChange={e => setModalConfig({ ...modalConfig, timeEstimate: e.target.value })}
                        />
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>h</span>
                      </div>
                    </div>

                    {/* Checklist */}
                    <div className={styles.checklistSection}>
                      <div className={styles.checklistLabel}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                        Checklist
                        {checklistItems.length > 0 && (
                          <span className={styles.checklistProgress}>
                            {checklistItems.filter(i => i.done).length}/{checklistItems.length}
                          </span>
                        )}
                      </div>

                      {checklistItems.length > 0 && (
                        <div className={styles.checklistProgressBar}>
                          <div
                            className={styles.checklistProgressFill}
                            style={{ width: `${(checklistItems.filter(i => i.done).length / checklistItems.length) * 100}%` }}
                          />
                        </div>
                      )}

                      <div className={styles.checklistItems}>
                        {checklistItems.map(item => (
                          <div key={item.id} className={`${styles.checklistItem} ${item.done ? styles.checklistItemDone : ''}`}>
                            <div
                              className={`${styles.checklistCheckbox} ${item.done ? styles.checklistCheckboxChecked : ''}`}
                              onClick={() => toggleChecklistItem(item.id)}
                            >
                              {item.done && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <input
                              type="text"
                              className={`${styles.checklistItemText} ${item.done ? styles.checklistItemTextDone : ''}`}
                              value={item.text}
                              onChange={e => updateChecklistItemText(item.id, e.target.value)}
                              onBlur={e => saveChecklistItemText(item.id, e.target.value)}
                            />
                            <button
                              type="button"
                              className={styles.checklistDeleteBtn}
                              onClick={() => deleteChecklistItem(item.id)}
                              title="Remove item"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className={styles.checklistAddRow}>
                        <input
                          type="text"
                          className={styles.checklistAddInput}
                          placeholder="Add a checklist item…"
                          value={checklistInput}
                          onChange={e => setChecklistInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                        />
                        <button type="button" className={styles.checklistAddBtn} onClick={addChecklistItem}>
                          + Add
                        </button>
                      </div>
                    </div>

                    {modalConfig.type === 'Rename' && modalConfig.targetType === 'task' && (
                      <div className={styles.taskCoverSection}>
                        <div className={styles.taskCoverLabel}>Attach image</div>
                        <div className={styles.taskCoverModeRow}>
                          <button
                            type="button"
                            className={`${styles.taskCoverModeBtn} ${modalConfig.coverMode === 'image' ? styles.taskCoverModeBtnActive : ''}`}
                            onClick={() => setCoverMode('image')}
                          >
                            Attach image
                          </button>
                          <button
                            type="button"
                            className={`${styles.taskCoverModeBtn} ${modalConfig.coverMode === 'drive' ? styles.taskCoverModeBtnActive : ''}`}
                            onClick={() => setCoverMode('drive')}
                          >
                            Google Drive link
                          </button>
                          {modalConfig.coverMode !== 'none' && (
                            <button
                              type="button"
                              className={styles.taskCoverRemoveBtn}
                              onClick={() => setCoverMode('none')}
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        {modalConfig.coverMode === 'image' && (
                          <div className={styles.taskCoverPanel}>
                            <input
                              ref={coverFileInputRef}
                              type="file"
                              accept="image/*"
                              className={styles.taskCoverFileInput}
                              onChange={handleCoverFileUpload}
                            />
                            <button
                              type="button"
                              className={styles.taskCoverUploadBtn}
                              disabled={uploadingCover}
                              onClick={() => coverFileInputRef.current?.click()}
                            >
                              {uploadingCover ? 'Uploading…' : modalConfig.coverImageUrl ? 'Replace image' : 'Choose image'}
                            </button>
                          </div>
                        )}

                        {modalConfig.coverMode === 'drive' && (
                          <div className={styles.taskCoverPanel}>
                            <input
                              type="url"
                              className={styles.taskCoverDriveInput}
                              placeholder="https://drive.google.com/file/d/… or …/folders/…"
                              value={modalConfig.coverImageUrl}
                              onChange={e => {
                                setModalConfig(prev => ({
                                  ...prev,
                                  coverImageUrl: e.target.value,
                                  coverImageUrls: [],
                                }));
                                setCoverPreviewError(false);
                              }}
                              onBlur={() => void handleCoverDriveBlur()}
                              disabled={resolvingCoverFolder}
                            />
                            <p className={styles.taskCoverHint}>
                              Paste a public Google Drive image or folder link (Anyone with the link can view).
                              {resolvingCoverFolder ? ' Loading folder images…' : ''}
                            </p>
                          </div>
                        )}

                        {modalConfig.coverMode !== 'none' && getModalCoverImages().length > 0 && (
                          <div className={styles.taskCoverPreviewWrap}>
                            {!coverPreviewError ? (
                              <TaskImageCarousel
                                images={getModalCoverImages()}
                                alt="Cover preview"
                                className={styles.taskCoverPreviewImg}
                                showEnlargeHint={true}
                                onImageClick={(index) => openFullScreenPreview(getModalCoverImages(), index)}
                              />
                            ) : (
                              <div className={styles.taskCoverPreviewError}>
                                Preview unavailable — check the link or sharing settings.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
                    style={
                      modalConfig.type === 'Delete' ? { background: '#ef4444' } :
                        modalConfig.type === 'Archive' ? { background: '#2563eb' } :
                          {}
                    }
                  >
                    {modalConfig.type === 'Rename' ? (modalConfig.targetType === 'task' ? 'Update Task' : 'Save Changes') :
                      modalConfig.type === 'Delete' ? 'Delete Permanently' :
                        modalConfig.type === 'Archive' ? (
                          modalConfig.targetType === 'statusGroup' ? 'Archive Group' :
                            (selectedTaskIds.size > 1 && selectedTaskIds.has(modalConfig.targetId!)) ? `Archive ${selectedTaskIds.size} Tasks` :
                              'Archive Task'
                        ) :
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
              <div className={styles.contextMenuItem} onClick={() => { openModal('Archive', contextMenu.id, 'statusGroup'); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>
                Archive all in this group
              </div>
              <div className={styles.contextMenuDivider}></div>
              <div className={styles.contextMenuItem} onClick={() => { selectAllInGroup(contextMenu.id); closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                Select all
              </div>

              <div className={styles.contextMenuItem} onClick={() => { closeContextMenu(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                Edit statuses
              </div>
            </>
          ) : contextMenu.type === 'task' ? (
            <>
              <div
                className={styles.contextMenuItem}
                onMouseEnter={() => setActiveSubMenu(null)}
                onClick={activeView === 'inbox' ? undefined : () => { toggleFavorite(contextMenu.id); closeContextMenu(); }}
                style={activeView === 'inbox' ? { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={tasks.find(t => t.id === contextMenu.id)?.is_favorite ? "#f59e0b" : "none"} stroke={tasks.find(t => t.id === contextMenu.id)?.is_favorite ? "#f59e0b" : "currentColor"} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                {tasks.find(t => t.id === contextMenu.id)?.is_favorite ? 'Remove from favorites' : 'Favorite'}
              </div>
              <div
                className={styles.contextMenuItem}
                onMouseEnter={() => setActiveSubMenu(null)}
                onClick={() => { toggleFollowTask(contextMenu.id); closeContextMenu(); }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill={followedTaskIds.includes(contextMenu.id) ? "#3b82f6" : "none"}
                  stroke={followedTaskIds.includes(contextMenu.id) ? "#3b82f6" : "currentColor"}
                  strokeWidth="2"
                >
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {followedTaskIds.includes(contextMenu.id) ? 'Unfollow task' : 'Follow task'}
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
                  <div className={styles.contextSubMenu} style={{ right: '100%', top: '-100px', marginRight: '2px', width: '450px', display: 'flex' }} onClick={e => e.stopPropagation()}>
                    {/* Left: Calendar Column */}
                    <div style={{ flex: 1, borderRight: '1px solid #e2e8f0', padding: '12px 0' }}>
                      <div className={styles.calendarHeaderMini}>
                        <span>{new Date(calendarYear, calendarMonth).toLocaleDateString('default', { month: 'long', year: 'numeric' })}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span 
                            style={{ cursor: 'pointer', userSelect: 'none' }} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setCalendarMonth(prev => prev === 0 ? 11 : prev - 1);
                              if (calendarMonth === 0) setCalendarYear(prev => prev - 1);
                            }}
                          >
                            &lt;
                          </span>
                          <span 
                            style={{ cursor: 'pointer', userSelect: 'none' }} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setCalendarMonth(prev => prev === 11 ? 0 : prev + 1);
                              if (calendarMonth === 11) setCalendarYear(prev => prev + 1);
                            }}
                          >
                            &gt;
                          </span>
                        </div>
                      </div>
                      <div className={styles.calendarGridMini}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                          <div key={d} style={{ fontSize: '9px', fontWeight: 700, textAlign: 'center', color: '#94a3b8', paddingBottom: '4px' }}>{d}</div>
                        ))}
                        {(() => {
                          const now = new Date();
                          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                          const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay();
                          
                          const calendarDays: JSX.Element[] = [];
                          
                          // Add empty cells for days before the first day of the month
                          for (let i = 0; i < firstDayOfMonth; i++) {
                            calendarDays.push(<div key={`empty-${i}`} style={{ visibility: 'hidden' }} />);
                          }
                          
                          // Add days of the month
                          for (let day = 1; day <= daysInMonth; day++) {
                            const date = new Date(calendarYear, calendarMonth, day);
                            const isPast = date < todayStart;
                            const isSelected = calendarSelectedDay === day;
                            
                            calendarDays.push(
                              <div
                                key={day}
                                className={`${styles.calendarDayMini} ${isSelected ? styles.calendarDayMiniActive : ''}`}
                                style={{
                                  opacity: isPast ? 0.4 : 1,
                                  cursor: isPast ? 'not-allowed' : 'pointer'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isPast) {
                                    setCalendarSelectedDay(day);
                                  }
                                }}
                              >
                                {day}
                              </div>
                            );
                          }
                          
                          return calendarDays;
                        })()}
                      </div>
                      <div style={{ padding: '0 12px', display: 'flex', gap: '8px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="time"
                          value={manualTime}
                          className={styles.dateInputSmall}
                          style={{ marginTop: '8px', flex: 1 }}
                          min={(function() {
                            const now = new Date();
                            const selectedDate = new Date(calendarYear, calendarMonth, calendarSelectedDay);
                            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                            if (selectedDate.getTime() === today.getTime()) {
                              return now.toTimeString().slice(0, 5);
                            }
                            return '';
                          })()}
                          onChange={(e) => setManualTime(e.target.value)}
                        />
                        <button
                          style={{ marginTop: '8px', padding: '4px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => {
                            const now = new Date();
                            const d = new Date(calendarYear, calendarMonth, calendarSelectedDay);
                            const [h, m] = manualTime.split(':');
                            d.setHours(parseInt(h), parseInt(m), 0, 0);
                            
                            if (d < now) {
                              showToast('Please select a future date and time!', 'error');
                              return;
                            }
                            
                            setTaskReminder(contextMenu.id, d);
                            closeContextMenu();
                          }}
                        >
                          Set
                        </button>
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
              <div
                className={styles.contextMenuItem}
                onMouseEnter={() => setActiveSubMenu(null)}
                onClick={activeView === 'inbox' ? undefined : () => { duplicateTask(contextMenu.id); closeContextMenu(); }}
                style={activeView === 'inbox' ? { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                Duplicate
              </div>
              <div
                className={styles.contextMenuItem}
                onMouseEnter={() => setActiveSubMenu(null)}
                onClick={activeView === 'inbox' ? undefined : () => { openModal('Archive', contextMenu.id, 'task'); closeContextMenu(); }}
                style={activeView === 'inbox' ? { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
              >
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

      {/* Confirmation Dialog (replaces native confirm()) */}
      {confirmDialog.isOpen && (
        <div className={styles.modalOverlay} onClick={closeConfirmDialog} style={{ zIndex: 1100 }}>
          <div className={styles.modalContent} style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div className={styles.modalTitle} style={{ fontSize: '16px' }}>{confirmDialog.title}</div>
              </div>
              <button type="button" className={styles.closeBtn} onClick={closeConfirmDialog}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ color: '#64748b', fontSize: '14px', lineHeight: '1.6' }}>
                {confirmDialog.message}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <div></div>
              <div className={styles.modalFooterRight}>
                <button type="button" className={styles.cancelBtn} onClick={closeConfirmDialog}>Cancel</button>
                <button
                  type="button"
                  className={styles.submitBtn}
                  style={{ background: '#ef4444' }}
                  onClick={confirmDialog.onConfirm}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Image Preview */}
      {isFullScreenPreviewOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            cursor: 'pointer'
          }} 
          onClick={closeFullScreenPreview}
        >
          <button 
            style={{
              position: 'absolute',
              top: 24,
              right: 24,
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: 32,
              cursor: 'pointer',
              zIndex: 100000
            }}
            onClick={(e) => {
              e.stopPropagation();
              closeFullScreenPreview();
            }}
          >
            ×
          </button>
          
          {fullScreenPreviewImages.length > 1 && (
            <>
              <button 
                style={{
                  position: 'absolute',
                  left: 24,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15,23,42,0.7)',
                  border: 'none',
                  color: 'white',
                  fontSize: 24,
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  zIndex: 100000
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFullScreenPreviewIndex(prev => 
                    (prev - 1 + fullScreenPreviewImages.length) % fullScreenPreviewImages.length
                  );
                }}
              >
                ‹
              </button>
              <button 
                style={{
                  position: 'absolute',
                  right: 24,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15,23,42,0.7)',
                  border: 'none',
                  color: 'white',
                  fontSize: 24,
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  zIndex: 100000
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setFullScreenPreviewIndex(prev => 
                    (prev + 1) % fullScreenPreviewImages.length
                  );
                }}
              >
                ›
              </button>
            </>
          )}
          
          <img 
            src={getDisplayImageUrl(fullScreenPreviewImages[fullScreenPreviewIndex])}
            alt="Full screen preview"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              cursor: 'default'
            }}
            onClick={(e) => e.stopPropagation()}
          />
          
          {fullScreenPreviewImages.length > 1 && (
            <div style={{
              position: 'absolute',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'white',
              background: 'rgba(15,23,42,0.7)',
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 14
            }}>
              {fullScreenPreviewIndex + 1} / {fullScreenPreviewImages.length}
            </div>
          )}
        </div>
      )}

      {/* Success/Error Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
}
