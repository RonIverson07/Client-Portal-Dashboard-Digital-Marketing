'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import styles from './tasks.module.css';
import { getDisplayImageUrl, isGoogleDriveUrl } from '@/lib/imageUtils';

interface Task {
  id: number;
  client_id: number;
  company_name: string;
  title: string;
  image_url: string;
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
  caption: string;
}

const emptyForm: TaskFormData = { client_id: '', title: '', image_url: '', caption: '' };

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
}: {
  task: Task;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
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
        <img src={getDisplayImageUrl(task.image_url)} alt={task.title} className={styles.detailImage}
          onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
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
  
  const [isOverCol, setIsOverCol] = useState<string | null>(null);
  const dragTaskId = useRef<number | null>(null);

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

  async function loadData() {
    try {
      const [taskRes, clientRes] = await Promise.all([
        fetch('/api/admin/tasks', { credentials: 'include' }),
        fetch('/api/admin/clients', { credentials: 'include' }),
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function openCreate() {
    setEditTask(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setForm({ client_id: String(task.client_id), title: task.title, image_url: task.image_url, caption: task.caption });
    setFormError('');
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      const url = editTask ? `/api/admin/tasks/${editTask.id}` : '/api/admin/tasks';
      const method = editTask ? 'PUT' : 'POST';
      const body = editTask
        ? { title: form.title, image_url: form.image_url, caption: form.caption, status: editTask.status }
        : { client_id: Number(form.client_id), title: form.title, image_url: form.image_url, caption: form.caption };

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
      body: JSON.stringify({ title: task.title, image_url: task.image_url, caption: task.caption, status }),
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
        <button className="btn btn-primary" onClick={openCreate}>+ New Task</button>
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
                  <img
                    src={getDisplayImageUrl(task.image_url)}
                    alt={task.title}
                    className={styles.mobileAdminCardImg}
                    onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="45"><rect fill="%23f3f4f6" width="80" height="45"/></svg>'; }}
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
                            <div style={{ position: 'relative', width: '100%', height: 120, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                              <img
                                src={getDisplayImageUrl(task.image_url)}
                                alt={task.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60" viewBox="0 0 80 60"><rect fill="%23f3f4f6" width="80" height="60"/></svg>'; }}
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
              {!editTask && (
                <div className="form-group">
                  <label>Assign to Client *</label>
                  <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} required>
                    <option value="">Select a client…</option>
                    {clients.map(c => <option key={c.id} value={String(c.id)}>{c.company_name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Task Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Instagram Post — Product Launch" required />
              </div>
              <div className="form-group">
                <label>Image URL or Google Drive Link *</label>
                <input value={form.image_url} onChange={e => { setForm(f => ({ ...f, image_url: e.target.value })); setImgPreviewError(false); }} placeholder="https://… or Google Drive share link" required />
                <small style={{ color: 'var(--color-text-muted)', fontSize: 11, lineHeight: 1.5 }}>
                  You can paste a public Google Drive image link here.
                  {isGoogleDriveUrl(form.image_url) && ' Make sure the file is shared as \'Anyone with the link can view.\''}
                </small>
                {form.image_url && (
                  <div style={{ marginTop: 8 }}>
                    {!imgPreviewError ? (
                      <img
                        key={form.image_url}
                        src={getDisplayImageUrl(form.image_url)}
                        alt="Preview"
                        style={{ display: 'block', maxHeight: 160, width: '100%', borderRadius: 6, objectFit: 'cover', border: '1px solid var(--color-border)' }}
                        onError={() => setImgPreviewError(true)}
                      />
                    ) : (
                      <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#b91c1c', lineHeight: 1.5 }}>
                        Image could not load. Make sure the Google Drive file is shared as &ldquo;Anyone with the link can view.&rdquo;
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
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editTask ? 'Save Changes' : 'Create Task'}
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
