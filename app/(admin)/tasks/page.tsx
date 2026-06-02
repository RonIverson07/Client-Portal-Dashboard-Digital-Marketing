'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import styles from './tasks.module.css';
import {
  getDisplayImageUrl,
  isGoogleDriveFolderUrl,
  isGoogleDriveUrl,
} from '@/lib/imageUtils';

interface Task {
  id: number;
  client_id: number;
  company_name: string;
  title: string;
  image_url: string;
  image_urls?: string[] | null;
  caption: string;
  status: string;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

interface Client {
  id: number;
  company_name: string;
}

interface Comment {
  id: number;
  author_name: string;
  comment_text: string;
  created_at: string;
}

interface TaskFormData {
  client_id: string;
  title: string;
  image_url: string;
  image_urls?: string[];
  caption: string;
}

const emptyForm: TaskFormData = { client_id: '', title: '', image_url: '', caption: '' };

function getTaskImages(task: Pick<Task, 'image_url' | 'image_urls'>): string[] {
  const multi = Array.isArray(task.image_urls)
    ? task.image_urls.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : [];
  if (multi.length > 0) return multi;
  return task.image_url ? [task.image_url] : [];
}

function ImageCarousel({
  images,
  alt,
  className,
  initialIndex = 0,
  onIndexChange,
}: {
  images: string[];
  alt: string;
  className: string;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const safeImages = images.filter(Boolean);

  useEffect(() => {
    const clampedIndex = Math.min(Math.max(initialIndex, 0), safeImages.length - 1);
    if (clampedIndex !== index) {
      setIndex(clampedIndex);
      if (clampedIndex !== initialIndex) {
        onIndexChange?.(clampedIndex);
      }
    }
  }, [initialIndex, safeImages.length, index, onIndexChange]);

  useEffect(() => {
    if (index < 0 || index >= safeImages.length) {
      const newIndex = Math.min(Math.max(index, 0), safeImages.length - 1);
      setIndex(newIndex);
      onIndexChange?.(newIndex);
    }
  }, [index, safeImages.length, onIndexChange]);

  const handleIndexChange = (newIndex: number) => {
    setIndex(newIndex);
    onIndexChange?.(newIndex);
  };

  if (safeImages.length === 0) return null;

  const hasNav = safeImages.length > 1;
  const current = safeImages[index] || safeImages[0];

  return (
    <div className={styles.carouselWrap}>
      <img
        src={getDisplayImageUrl(current)}
        alt={alt}
        className={className}
        onError={e => {
          (e.target as HTMLImageElement).src =
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect fill="%23f3f4f6" width="600" height="300"/></svg>';
        }}
      />
      {hasNav && (
        <>
          <button
            type="button"
            className={`${styles.carouselBtn} ${styles.carouselBtnPrev}`}
            onClick={e => {
              e.stopPropagation();
              handleIndexChange((index - 1 + safeImages.length) % safeImages.length);
            }}
            aria-label="Previous image"
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.carouselBtn} ${styles.carouselBtnNext}`}
            onClick={e => {
              e.stopPropagation();
              handleIndexChange((index + 1) % safeImages.length);
            }}
            aria-label="Next image"
          >
            ›
          </button>
          <div className={styles.carouselCount}>
            {index + 1}/{safeImages.length}
          </div>
        </>
      )}
    </div>
  );
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  for_review: { label: 'For Review', cls: 'badge badge-review' },
  approved: { label: 'Approved', cls: 'badge badge-approved' },
  for_revision: { label: 'For Revision', cls: 'badge badge-revision' },
  published: { label: 'Published', cls: 'badge badge-published' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, cls: 'badge' };
  return <span className={s.cls}>{s.label}</span>;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Normalize captions that may contain literal \n strings (from API/test data) */
function normalizeCaption(text: string): string {
  if (!text) return text;
  // Replace literal backslash-n sequences with real newlines
  return text.replace(/\\n/g, '\n');
}

function TaskDetailPanel({
  task,
  onClose,
  onStatusChange,
  initialCarouselIndex = 0,
  onCarouselIndexChange,
}: {
  task: Task;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
  initialCarouselIndex?: number;
  onCarouselIndexChange?: (index: number) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/tasks/${task.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setComments(d.comments || []); setLoadingComments(false); });
  }, [task.id]);

  const statuses = ['for_review', 'approved', 'for_revision', 'published'];

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{task.title}</h2>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>

      <div className={styles.detailContent}>
        <ImageCarousel 
          images={getTaskImages(task)} 
          alt={task.title} 
          className={styles.detailImage} 
          initialIndex={initialCarouselIndex}
          onIndexChange={onCarouselIndexChange}
        />
        
        <div className={styles.detailMeta}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Client</span>
            <span>{task.company_name}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Status</span>
            <select
              value={task.status}
              onChange={e => onStatusChange(task.id, e.target.value)}
              style={{ width: 'auto' }}
            >
              {statuses.map(s => <option key={s} value={s}>{STATUS_MAP[s]?.label}</option>)}
            </select>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Updated</span>
            <span>{formatDate(task.updated_at)}</span>
          </div>
        </div>

        <div>
          <div className={styles.detailLabel} style={{ marginBottom: 6 }}>Caption</div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{normalizeCaption(task.caption)}</p>
        </div>

        <div>
          <div className={styles.detailLabel} style={{ marginBottom: 8 }}>
            Comments ({comments.length})
          </div>
          {loadingComments ? (
            <div className="text-muted">Loading comments…</div>
          ) : comments.length === 0 ? (
            <div className="text-muted" style={{ fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>No comments yet.</div>
          ) : (
            <div className={styles.commentList}>
              {comments.map(c => (
                <div key={c.id} className={styles.comment}>
                  <div className={styles.commentMeta}>
                    <strong>{c.author_name}</strong>
                    <span className="text-muted">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className={styles.commentText}>{c.comment_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TasksContent() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [toast, setToast] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [imgPreviewError, setImgPreviewError] = useState(false);
  const [resolvingFolder, setResolvingFolder] = useState(false);
  const [carouselIndices, setCarouselIndices] = useState<Record<number, number>>({});
  const [syncingClickUp, setSyncingClickUp] = useState(false);
  
  const [isOverCol, setIsOverCol] = useState<string | null>(null);
  const dragTaskId = useRef<number | null>(null);

  async function resolveDriveFolderImages(folderUrl: string): Promise<string[]> {
    const res = await fetch(`/api/drive/folder-images?url=${encodeURIComponent(folderUrl)}`, {
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to read Google Drive folder.');
    return Array.isArray(data.imageUrls) ? data.imageUrls : [];
  }

  const handleDragStart = (e: React.DragEvent, id: number) => {
    dragTaskId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setIsOverCol(status);
  };

  const handleDragLeave = () => {
    setIsOverCol(null);
  };

  const handleDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setIsOverCol(null);
    const id = dragTaskId.current;
    if (!id) return;
    const task = tasks.find(t => t.id === id);
    if (!task || task.status === status) return;
    
    // Auto save status when dropped
    handleStatusChange(id, status);
    dragTaskId.current = null;
  };

  useEffect(() => {
    loadData();
  }, []);

  // Periodic polling: sync Google Drive folder tasks every 30 seconds
  const syncingRef = useRef(false);

  const syncDriveFolders = useRef(async (currentTasks: Task[]) => {
    if (syncingRef.current) return;
    const driveFolderTasks = currentTasks.filter(t => isGoogleDriveFolderUrl(t.image_url));
    if (driveFolderTasks.length === 0) return;

    syncingRef.current = true;
    try {
      for (const task of driveFolderTasks) {
        try {
          const freshImages = await resolveDriveFolderImages(task.image_url);
          if (freshImages.length > 0) {
            const currentImages = Array.isArray(task.image_urls) ? task.image_urls : [];
            const changed =
              freshImages.length !== currentImages.length ||
              freshImages.some((url: string, idx: number) => url !== currentImages[idx]);

            if (changed) {
              setTasks(prev =>
                prev.map(t =>
                  t.id === task.id ? { ...t, image_urls: freshImages } : t
                )
              );
              setSelectedTask(prev =>
                prev?.id === task.id ? { ...prev, image_urls: freshImages } : prev
              );

              // Persist to database
              await fetch(`/api/admin/tasks/${task.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  client_id: task.client_id,
                  title: task.title,
                  image_url: task.image_url,
                  image_urls: freshImages,
                  caption: task.caption,
                  status: task.status,
                }),
              });
            }
          }
        } catch (err) {
          console.error(`Drive sync failed for task ${task.id}:`, err);
        }
      }
    } finally {
      syncingRef.current = false;
    }
  });

  // Run sync on initial load and then every 30 seconds
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    if (tasks.length === 0) return;
    // Initial sync
    syncDriveFolders.current(tasks);
    // Periodic polling
    const interval = setInterval(() => {
      syncDriveFolders.current(tasksRef.current);
    }, 30000);
    return () => clearInterval(interval);
  }, [tasks.length > 0]); // Only re-setup when tasks go from empty to loaded

  async function handleClickUpSync() {
    setSyncingClickUp(true);
    try {
      const res = await fetch('/api/admin/clickup/sync', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Synced with ClickUp!');
        loadData(); // Refresh tasks
      } else {
        showToast(data.error || 'Failed to sync with ClickUp.');
      }
    } catch {
      showToast('Failed to sync with ClickUp.');
    } finally {
      setSyncingClickUp(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function loadData() {
    try {
      const timestamp = new Date().getTime();
      const [taskRes, clientRes] = await Promise.all([
        fetch(`/api/admin/tasks?t=${timestamp}`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/admin/clients?t=${timestamp}`, { credentials: 'include', cache: 'no-store' }),
      ]);
      if (taskRes.status === 401) { router.push('/admin/login'); return; }
      const taskData = await taskRes.json();
      const clientData = await clientRes.json();
      setTasks(taskData.tasks || []);
      setClients(clientData.clients || []);
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }

  const handleCarouselIndexChange = (taskId: number, index: number) => {
    setCarouselIndices(prev => ({ ...prev, [taskId]: index }));
  };

  function openCreate() {
    setEditTask(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setForm({
      client_id: String(task.client_id),
      title: task.title,
      image_url: task.image_url,
      image_urls: Array.isArray(task.image_urls) ? task.image_urls : [],
      caption: task.caption,
    });
    setFormError('');
    setImgPreviewError(false);
    setShowForm(true);
  }

  async function handleImageUrlBlur() {
    const rawUrl = form.image_url.trim();
    if (!isGoogleDriveFolderUrl(rawUrl)) return;

    setFormError('');
    setResolvingFolder(true);
    try {
      const folderImages = await resolveDriveFolderImages(rawUrl);
      if (folderImages.length === 0) {
        setFormError('No public images found in this Google Drive folder.');
        setForm(f => ({ ...f, image_urls: [] }));
        setImgPreviewError(true);
        return;
      }
      setForm(f => ({ ...f, image_urls: folderImages }));
      setImgPreviewError(false);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to read Drive folder images.');
      setForm(f => ({ ...f, image_urls: [] }));
      setImgPreviewError(true);
    } finally {
      setResolvingFolder(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      const rawUrl = form.image_url.trim();
      let resolvedImageUrl = rawUrl;
      let resolvedImageUrls: string[] | undefined = undefined;

      if (isGoogleDriveFolderUrl(rawUrl)) {
        setResolvingFolder(true);
        const folderImages = await resolveDriveFolderImages(rawUrl);
        if (folderImages.length === 0) {
          setFormError('No public images found in this Google Drive folder.');
          return;
        }
        resolvedImageUrls = folderImages;
        resolvedImageUrl = rawUrl; // Store the original folder link
      } else if (Array.isArray(form.image_urls) && form.image_urls.length > 0) {
        resolvedImageUrls = form.image_urls.filter(Boolean);
      }

      const url = editTask ? `/api/admin/tasks/${editTask.id}` : '/api/admin/tasks';
      const method = editTask ? 'PUT' : 'POST';
      const body = editTask
        ? {
            client_id: Number(form.client_id),
            title: form.title,
            image_url: resolvedImageUrl,
            image_urls: resolvedImageUrls,
            caption: form.caption,
            status: editTask.status,
          }
        : {
            client_id: Number(form.client_id),
            title: form.title,
            image_url: resolvedImageUrl,
            image_urls: resolvedImageUrls,
            caption: form.caption,
          };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed to save.'); return; }

      setShowForm(false);
      showToast(editTask ? 'Task updated.' : 'Task created.');
      loadData();
    } catch {
      setFormError('An unexpected error occurred.');
    } finally {
      setResolvingFolder(false);
      setSaving(false);
    }
  }

  async function handleStatusChange(taskId: number, status: string) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const res = await fetch(`/api/admin/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: task.title,
        image_url: task.image_url,
        image_urls: task.image_urls || null,
        caption: task.caption,
        status,
      }),
    });

    if (res.ok) {
      showToast('Status updated.');
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
      if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, status } : null);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setDeleteConfirm(null);
      if (selectedTask?.id === id) setSelectedTask(null);
      showToast('Task deleted.');
      loadData();
    }
  }

  const filteredTasks = tasks.filter(t => {
    if (filterClient && String(t.client_id) !== filterClient) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    return true;
  });

  if (loading) return <div className="loading-state"><div className="spinner" />Loading tasks…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Tasks</h1>
          <p className={styles.pageSubtitle}>{filteredTasks.length} of {tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={handleClickUpSync} disabled={syncingClickUp}>
            {syncingClickUp ? 'Syncing…' : 'Sync with ClickUp'}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>+ New Task</button>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={String(c.id)}>{c.company_name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All Statuses</option>
          <option value="for_review">For Review</option>
          <option value="approved">Approved</option>
          <option value="for_revision">For Revision</option>
          <option value="published">Published</option>
        </select>
      </div>

      <div className={`${styles.contentArea} ${selectedTask ? styles.contentAreaSplit : ''}`}>
        {/* Mobile list — shown below 768px */}
        <div className={styles.mobileAdminList}>
          {filteredTasks.length === 0 ? (
            <div className="empty-state card" style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
              <h3>No tasks found</h3>
              <p>{tasks.length === 0 ? 'Create your first content task.' : 'Try adjusting your filters.'}</p>
            </div>
          ) : (
            <div className={styles.mobileListView}>
              {filteredTasks.map(task => (
                <div key={task.id} className={styles.mobileAdminCard} onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}>
                  <ImageCarousel 
                          images={getTaskImages(task)} 
                          alt={task.title} 
                          className={styles.mobileAdminCardImg}
                          initialIndex={carouselIndices[task.id] || 0}
                          onIndexChange={(index) => handleCarouselIndexChange(task.id, index)}
                        />
                  <div className={styles.mobileAdminCardBody}>
                    <div className={styles.mobileAdminCardRow}>
                      <StatusBadge status={task.status} />
                      <span className={styles.mobileAdminCardMeta}>{formatDate(task.updated_at)}</span>
                    </div>
                    <div className={styles.mobileAdminCardRow}>
                      <span className={styles.mobileAdminCardTitle}>{task.title}</span>
                    </div>
                    <span className={styles.taskClient}>{task.company_name}</span>
                    <p className={styles.mobileAdminCardCaption}>{normalizeCaption(task.caption)}</p>
                    <div className={styles.mobileAdminCardActions} onClick={e => e.stopPropagation()}>
                      <select
                        className={styles.mobileStatusSelect}
                        value={task.status}
                        onChange={e => handleStatusChange(task.id, e.target.value)}
                      >
                        <option value="for_review">For Review</option>
                        <option value="approved">Approved</option>
                        <option value="for_revision">For Revision</option>
                        <option value="published">Published</option>
                      </select>
                      <button className="btn btn-ghost btn-sm" style={{ minHeight: 40, padding: '0 12px' }} onClick={() => openEdit(task)}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ minHeight: 40, padding: '0 12px' }} onClick={() => setDeleteConfirm(task.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kanban Board — desktop only */}
        <div className={styles.board}>
          {[
            { id: 'for_review', label: 'For Review', cls: styles.colReview },
            { id: 'approved', label: 'Approved', cls: styles.colApproved },
            { id: 'for_revision', label: 'For Revision', cls: styles.colRevision },
            { id: 'published', label: 'Published', cls: styles.colPublished }
          ].map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);
            const isOver = isOverCol === col.id;
            
            return (
              <div
                key={col.id}
                className={`${styles.boardCol} ${col.cls} ${isOver ? styles.boardColOver : ''}`}
                onDragOver={e => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, col.id)}
              >
                <div className={styles.colHeader}>
                  <div className={styles.colLabel}>{col.label}</div>
                  <div className={styles.colCount}>{colTasks.length}</div>
                </div>
                <div className={styles.colCards}>
                  {colTasks.length === 0 ? (
                    <div className={`${styles.colEmpty} ${isOver ? styles.colEmptyOver : ''}`}>Drop here</div>
                  ) : (
                    <>
                      {colTasks.map(task => (
                        <div
                          key={task.id}
                          className={`card ${styles.taskCard} ${selectedTask?.id === task.id ? styles.taskCardSelected : ''}`}
                          onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                          draggable
                          onDragStart={e => handleDragStart(e, task.id)}
                        >
                          <div className={styles.taskCardInner} style={{ flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)' }}>
                            <div style={{ position: 'relative', width: '100%', minHeight: 120, borderRadius: 'var(--radius-sm)', overflow: 'visible' }}>
                              <ImageCarousel
                                images={getTaskImages(task)}
                                alt={task.title}
                                className={styles.boardCardImage}
                                initialIndex={carouselIndices[task.id] || 0}
                                onIndexChange={(index) => handleCarouselIndexChange(task.id, index)}
                              />
                            </div>
                            <div className={styles.taskInfo} style={{ width: '100%' }}>
                              <span className={styles.taskClient} style={{ display: 'block', marginBottom: 4 }}>{task.company_name}</span>
                              <div className={styles.taskTitle} style={{ whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: 6 }}>{task.title}</div>
                              <p className={styles.taskCaption}>{normalizeCaption(task.caption)}</p>
                              <div className={styles.taskFooter} style={{ marginTop: 8 }}>
                                <span className="text-muted" style={{ fontSize: 11 }}>{task.comment_count} comment{task.comment_count !== 1 ? 's' : ''} · {formatDate(task.updated_at)}</span>
                                <div className={styles.taskCardActions} onClick={e => e.stopPropagation()}>
                                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(task)} style={{ padding: '0 6px', fontSize: 11, minHeight: 24, height: 24 }}>Edit</button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(task.id)} style={{ padding: '0 6px', fontSize: 11, minHeight: 24, height: 24 }}>Delete</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {isOver && <div className={styles.dropPlaceholder} />}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onStatusChange={handleStatusChange}
            initialCarouselIndex={carouselIndices[selectedTask.id] || 0}
            onCarouselIndexChange={(index) => handleCarouselIndexChange(selectedTask.id, index)}
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal">
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editTask ? 'Edit Task' : 'New Task'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Close</button>
            </div>
            <form onSubmit={handleSave} className={styles.modalBody}>
              {formError && <div className="alert alert-error">{formError}</div>}
              <div className="form-group">
                <label>Assign to Client *</label>
                <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} required>
                  <option value="">Select a client…</option>
                  {clients.map(c => <option key={c.id} value={String(c.id)}>{c.company_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Task Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Instagram Post — Product Launch" required />
              </div>
              <div className="form-group">
                <label>Image URL or Google Drive Link *</label>
                <input
                  value={form.image_url}
                  onChange={e => {
                    setForm(f => ({ ...f, image_url: e.target.value, image_urls: [] }));
                    setImgPreviewError(false);
                  }}
                  onBlur={handleImageUrlBlur}
                  placeholder="https://… , Google Drive file link, or Drive folder link"
                  required
                />
                <small style={{ color: 'var(--color-text-muted)', fontSize: 11, lineHeight: 1.5 }}>
                  Works with single image links and Google Drive folder links.
                  {isGoogleDriveUrl(form.image_url) && " Make sure it is shared as 'Anyone with the link can view.'"}
                </small>
                {resolvingFolder && (
                  <div className="text-muted" style={{ marginTop: 8, fontSize: 12 }}>
                    Reading Google Drive folder images...
                  </div>
                )}
                {form.image_url && (
                  <div style={{ marginTop: 8 }}>
                    {!imgPreviewError ? (
                      <ImageCarousel
                        images={
                          Array.isArray(form.image_urls) && form.image_urls.length > 0
                            ? form.image_urls
                            : [form.image_url]
                        }
                        alt="Preview"
                        className={styles.formPreviewImage}
                      />
                    ) : (
                      <div style={{ padding: '12px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                        <strong>Note:</strong> Preview could not load. Check your Google Drive sharing and that the folder contains public image files.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Caption *</label>
                <textarea value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="Write the post caption here…" rows={4} required />
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || resolvingFolder}>
                  {resolvingFolder ? 'Reading folder…' : saving ? 'Saving…' : editTask ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm !== null && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Delete Task?</h2>
            </div>
            <div className={styles.modalBody}>
              <p style={{ marginBottom: 'var(--space-5)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                This will permanently delete the task and all its comments.
              </p>
              <div className={styles.modalFooter}>
                <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm!)}>Delete Task</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-container">
          <div className="toast toast-success">{toast}</div>
        </div>
      )}
    </div>
  );
}

export default function AdminTasksPage() {
  return (
    <Suspense fallback={<div className="loading-state"><div className="spinner" />Loading…</div>}>
      <TasksContent />
    </Suspense>
  );
}
