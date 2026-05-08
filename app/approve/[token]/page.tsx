'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import styles from './approve.module.css';
import { getDisplayImageUrl } from '@/lib/imageUtils';

/** Normalize captions that may contain literal \n strings */
function normalizeCaption(text: string): string {
  if (!text) return text;
  return text.replace(/\\n/g, '\n');
}

interface ClientInfo { id: number; company_name: string; contact_name: string | null; logo_url: string | null; }
interface Task { id: number; title: string; image_url: string; caption: string; status: string; comment_count: number; created_at: string; updated_at: string; }
interface Comment { id: number; author_name: string; comment_text: string; created_at: string; }

function getStatusLabel(s: string): string {
  const m: Record<string, string> = { for_review: 'For Review', approved: 'Approved', for_revision: 'For Revision' };
  return m[s] || s;
}
function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = { for_review: 'badge badge-review', approved: 'badge badge-approved', for_revision: 'badge badge-revision' };
  return <span className={cls[status] || 'badge'}>{getStatusLabel(status)}</span>;
}
function formatDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

/* ── Zoomable Image Modal ── */
function ZoomableImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const displaySrc = getDisplayImageUrl(src);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  function zoom(delta: number) { setScale(s => Math.min(5, Math.max(0.25, s + delta))); }
  function reset() { setScale(1); setPos({ x: 0, y: 0 }); }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 0.15 : -0.15);
  }

  function onMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
    e.preventDefault();
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    setPos({ x: posStart.current.x + e.clientX - dragStart.current.x, y: posStart.current.y + e.clientY - dragStart.current.y });
  }
  function onMouseUp() { dragging.current = false; }

  return (
    <div className={styles.imageOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <button className={styles.imageCloseBtn} onClick={onClose}>✕</button>
      <div className={styles.zoomControls}>
        <button className={styles.zoomBtn} onClick={() => zoom(0.3)} title="Zoom in">＋</button>
        <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
        <button className={styles.zoomBtn} onClick={() => zoom(-0.3)} title="Zoom out">－</button>
        <button className={styles.zoomBtn} onClick={reset} title="Reset zoom" style={{ fontSize: 11 }}>Reset</button>
      </div>
      <div className={styles.imageViewport}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onWheel={onWheel}
        style={{ cursor: scale > 1 ? (dragging.current ? 'grabbing' : 'grab') : 'default', touchAction: 'pinch-zoom' }}
      >
        <img src={displaySrc} alt={alt} className={styles.imagePreviewFull}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transformOrigin: 'center' }}
          draggable={false}
          onError={e => { (e.target as HTMLImageElement).alt = 'Image unavailable — check sharing settings'; }}
        />
      </div>
    </div>
  );
}

/* ── Revision Modal ── */
function RevisionModal({ onSubmit, onCancel }: { onSubmit: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const handleSubmit = () => { if (!text.trim()) { setError('Please add a revision comment.'); return; } onSubmit(text.trim()); };
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={`modal ${styles.revisionModal}`}>
        <div className={styles.revisionModalHeader}>
          <h2 className={styles.revisionModalTitle}>Request Revision</h2>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>✕</button>
        </div>
        <div className={styles.revisionModalBody}>
          <p className={styles.revisionModalHint}>What changes are needed? Your comment is required.</p>
          <textarea ref={ref} value={text} onChange={e => { setText(e.target.value); setError(''); }} placeholder="Describe the changes needed…" rows={4} />
          {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}
        </div>
        <div className={styles.revisionModalFooter}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-warning" onClick={handleSubmit}>Submit Revision</button>
        </div>
      </div>
    </div>
  );
}

/* ── Caption Preview ── */
function CaptionPreview({ text, onSeeMore }: { text: string; onSeeMore: () => void }) {
  const normalized = normalizeCaption(text);
  const isLong = normalized.split('\n').length > 4 || normalized.length > 200;
  const preview = isLong ? normalized.split('\n').slice(0, 3).join('\n').substring(0, 200) : normalized;
  return (
    <div>
      <p className={styles.cardCaption}>{preview}{isLong && '…'}</p>
      {isLong && <button className={styles.seeMoreBtn} onClick={e => { e.stopPropagation(); onSeeMore(); }}>See more</button>}
    </div>
  );
}

/* ── Task Detail Modal ── */
function TaskDetailModal({ task, token, onClose, onStatusChange, onCommentAdded }: {
  task: Task; token: string; onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
  onCommentAdded: (id: number) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showImg, setShowImg] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);
  const [statusLoading, setStatusLoading] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const displayImg = getDisplayImageUrl(task.image_url);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showRevModal && !showImg) onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, showRevModal, showImg]);

  useEffect(() => {
    fetch(`/api/approve/${token}/tasks/${task.id}/comments`)
      .then(r => r.json()).then(d => { setComments(d.comments || []); setLoadingComments(false); });
  }, [task.id, token]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  async function doStatusUpdate(status: string, commentTxt?: string) {
    await fetch(`/api/approve/${token}/tasks/${task.id}`, { 
      method: 'PATCH', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ status, comment: commentTxt }) 
    });
    
    onStatusChange(task.id, status);
    if (commentTxt) { 
      onCommentAdded(task.id); 
      fetch(`/api/approve/${token}/tasks/${task.id}/comments`).then(r => r.json()).then(d => setComments(d.comments || [])); 
    }
  }

  async function handleApprove() { setStatusLoading('approved'); await doStatusUpdate('approved'); showToast('Approved ✓'); setStatusLoading(null); }
  async function handleRevisionSubmit(text: string) { setShowRevModal(false); setStatusLoading('for_revision'); await doStatusUpdate('for_revision', text); showToast('Revision requested ✓'); setStatusLoading(null); }
  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/approve/${token}/tasks/${task.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author_name: 'Client', comment_text: commentText.trim() }) });
    if (res.ok) { const data = await res.json(); setComments(prev => [...prev, data.comment]); onCommentAdded(task.id); setCommentText(''); showToast('Comment added.'); }
    setSubmitting(false);
  }

  const s = task.status;
  return (
    <>
      <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={`modal ${styles.detailModal}`}>
          <div className={styles.detailModalHeader}>
            <div><StatusBadge status={s} /><h2 className={styles.detailModalTitle}>{task.title}</h2></div>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
          </div>
          <div className={styles.detailModalBody}>
            <div className={styles.detailImgWrap} onClick={() => setShowImg(true)}>
              <img src={displayImg} alt={task.title} className={styles.detailImg}
                onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect fill="%23f3f4f6" width="600" height="300"/><text fill="%239ca3af" font-family="sans-serif" font-size="13" x="50%" y="50%" text-anchor="middle" dy=".3em">Image unavailable — check sharing settings</text></svg>'; }} />
              <div className={styles.detailImgHint}>🔍 Click to enlarge</div>
            </div>
            <div>
              <div className={styles.sectionLabel}>Caption</div>
              <p className={styles.captionFull}>{normalizeCaption(task.caption)}</p>
            </div>
            <div className={styles.detailActions}>
              {s !== 'approved' && <button className="btn btn-success" onClick={handleApprove} disabled={statusLoading !== null}>{statusLoading === 'approved' ? 'Approving…' : '✓ Approve'}</button>}
              {s !== 'for_revision' && <button className="btn btn-warning" onClick={() => setShowRevModal(true)} disabled={statusLoading !== null}>Request Revision</button>}
              {s === 'approved' && <span className={styles.approvedNote}>✓ This item is approved</span>}
              {s === 'for_revision' && <span className={styles.revisionNote}>Revision requested</span>}
            </div>
            <div>
              <div className={styles.sectionLabel}>Comments ({comments.length})</div>
              {loadingComments ? <div className="text-muted">Loading…</div> : comments.length === 0 ? <div className={styles.noComments}>No comments yet.</div> : (
                <div className={styles.commentList}>
                  {comments.map(c => (
                    <div key={c.id} className={styles.comment}>
                      <div className={styles.commentMeta}><strong>{c.author_name}</strong><span className="text-muted text-xs">{new Date(c.created_at).toLocaleString()}</span></div>
                      <p className={styles.commentText}>{c.comment_text}</p>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAddComment} className={styles.commentForm}>
                <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a comment…" rows={2} />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-ghost btn-sm" disabled={!commentText.trim() || submitting}>{submitting ? 'Adding…' : 'Add Comment'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      {showImg && <ZoomableImageModal src={task.image_url} alt={task.title} onClose={() => setShowImg(false)} />}
      {showRevModal && <RevisionModal onSubmit={handleRevisionSubmit} onCancel={() => setShowRevModal(false)} />}
      {toast && <div className="toast-container"><div className="toast toast-success">{toast}</div></div>}
    </>
  );
}

/* ── Approval Card ── */
function ApprovalCard({ task, token, onStatusChange, onCommentAdded, onOpenDetail, onOpenImage, onDragStart }: {
  task: Task; token: string;
  onStatusChange: (id: number, status: string) => void;
  onCommentAdded: (id: number) => void;
  onOpenDetail: (task: Task) => void;
  onOpenImage: (task: Task) => void;
  onDragStart: (e: React.DragEvent, taskId: number) => void;
}) {
  const [showRevModal, setShowRevModal] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const isDragging = useRef(false);
  const displayImg = getDisplayImageUrl(task.image_url);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  async function handleApprove(e: React.MouseEvent) {
    e.stopPropagation();
    setLoading('approved');
    await fetch(`/api/approve/${token}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
    onStatusChange(task.id, 'approved');
    showToast('Approved ✓');
    setLoading(null);
  }

  async function handleRevisionSubmit(text: string) {
    setShowRevModal(false);
    setLoading('for_revision');
    await fetch(`/api/approve/${token}/tasks/${task.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author_name: 'Client', comment_text: text }) });
    await fetch(`/api/approve/${token}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'for_revision' }) });
    onStatusChange(task.id, 'for_revision');
    onCommentAdded(task.id);
    showToast('Revision requested ✓');
    setLoading(null);
  }

  const s = task.status;
  return (
    <>
      <div className={styles.card} draggable
        onDragStart={e => { isDragging.current = true; onDragStart(e, task.id); }}
        onDragEnd={() => { setTimeout(() => { isDragging.current = false; }, 50); }}
        onClick={() => { if (!isDragging.current) onOpenDetail(task); }}
      >
        <div className={styles.cardImgWrap} onClick={e => { e.stopPropagation(); onOpenImage(task); }} title="Click to enlarge">
          <img src={displayImg} alt={task.title} className={styles.cardImg}
            onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><rect fill="%23f3f4f6" width="400" height="220"/><text fill="%239ca3af" font-family="sans-serif" font-size="13" x="50%" y="50%" text-anchor="middle" dy=".3em">Image unavailable</text></svg>'; }} />
          <div className={styles.cardImgOverlay}><span style={{ fontSize: '20px' }}>🔍</span></div>
          <div className={styles.dragHint}>⠿ Drag to move</div>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.cardTopRow}><StatusBadge status={s} /><span className={styles.cardMeta}>{task.comment_count > 0 && `${task.comment_count} comment${task.comment_count !== 1 ? 's' : ''} · `}{formatDate(task.updated_at)}</span></div>
          <h3 className={styles.cardTitle}>{task.title}</h3>
          <CaptionPreview text={task.caption} onSeeMore={() => onOpenDetail(task)} />
          <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
            {s === 'for_review' && (
              <>
                <button className={`btn btn-success ${styles.actionBtn}`} onClick={handleApprove} disabled={loading !== null}>{loading === 'approved' ? '…' : '✓ Approve'}</button>
                <button className={`btn btn-warning ${styles.actionBtnSecondary}`} onClick={e => { e.stopPropagation(); setShowRevModal(true); }} disabled={loading !== null}>Request Revision</button>
              </>
            )}
            {s === 'approved' && (
              <>
                <span className={styles.approvedNote}>✓ Approved</span>
                <button className={`btn btn-warning btn-sm ${styles.actionBtnSecondary}`} style={{ flex: 'none', padding: '0 12px' }} onClick={e => { e.stopPropagation(); setShowRevModal(true); }} disabled={loading !== null}>Request Revision</button>
              </>
            )}
            {s === 'for_revision' && (
              <>
                <span className={styles.revisionNote}>Revision requested</span>
                <button className={`btn btn-success btn-sm ${styles.actionBtn}`} style={{ flex: 'none', padding: '0 12px' }} onClick={handleApprove} disabled={loading !== null}>{loading === 'approved' ? '…' : 'Approve'}</button>
              </>
            )}
          </div>
        </div>
      </div>
      {showRevModal && <RevisionModal onSubmit={handleRevisionSubmit} onCancel={() => setShowRevModal(false)} />}
      {toast && <div className="toast-container"><div className="toast toast-success">{toast}</div></div>}
    </>
  );
}

/* ── Kanban Board ── */
function KanbanBoard({ tasks, token, onStatusChange, onCommentAdded, onOpenDetail, onOpenImage }: {
  tasks: Task[]; token: string;
  onStatusChange: (id: number, status: string) => void;
  onCommentAdded: (id: number) => void;
  onOpenDetail: (task: Task) => void;
  onOpenImage: (task: Task) => void;
}) {
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [pendingRevision, setPendingRevision] = useState<{ taskId: number } | null>(null);
  const dragTaskId = useRef<number | null>(null);
  const columns = [
    { key: 'for_review', label: 'For Review', cls: styles.colReview },
    { key: 'approved', label: 'Approved', cls: styles.colApproved },
    { key: 'for_revision', label: 'For Revision', cls: styles.colRevision },
  ];

  function handleDragStart(e: React.DragEvent, taskId: number) { dragTaskId.current = taskId; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(taskId)); }
  function handleDragOver(e: React.DragEvent, colKey: string) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(colKey); }
  function handleDragLeave(e: React.DragEvent) { const related = e.relatedTarget as Node | null; if (related && (e.currentTarget as HTMLElement).contains(related)) return; setDragOverCol(null); }

  async function handleDrop(e: React.DragEvent, colKey: string) {
    e.preventDefault(); e.stopPropagation(); setDragOverCol(null);
    const taskId = dragTaskId.current; if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === colKey) return;
    if (colKey === 'for_revision') { setPendingRevision({ taskId }); }
    else { await fetch(`/api/approve/${token}/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: colKey }) }); onStatusChange(taskId, colKey); }
    dragTaskId.current = null;
  }

  async function handleRevisionFromDrop(text: string) {
    if (!pendingRevision) return;
    const { taskId } = pendingRevision; setPendingRevision(null);
    await fetch(`/api/approve/${token}/tasks/${taskId}`, { 
      method: 'PATCH', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ status: 'for_revision', comment: text }) 
    });
    onStatusChange(taskId, 'for_revision');
    onCommentAdded(taskId);
  }

  return (
    <>
      <div className={styles.board}>
        {columns.map(col => {
          const colTasks = tasks.filter(t => t.status === col.key);
          const isOver = dragOverCol === col.key;
          return (
            <div key={col.key} className={`${styles.boardCol} ${isOver ? styles.boardColOver : ''}`}
              onDragOver={e => handleDragOver(e, col.key)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, col.key)}>
              <div className={`${styles.colHeader} ${col.cls}`}>
                <span className={styles.colLabel}>{col.label}</span>
                <span className={styles.colCount}>{colTasks.length}</span>
              </div>
              <div className={styles.colCards}>
                {colTasks.length === 0 ? (
                  <div className={`${styles.colEmpty} ${isOver ? styles.colEmptyOver : ''}`}>Drop here</div>
                ) : (
                  <>{colTasks.map(task => <ApprovalCard key={task.id} task={task} token={token} onStatusChange={onStatusChange} onCommentAdded={onCommentAdded} onOpenDetail={onOpenDetail} onOpenImage={onOpenImage} onDragStart={handleDragStart} />)}{isOver && <div className={styles.dropPlaceholder} />}</>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {pendingRevision && <RevisionModal onSubmit={handleRevisionFromDrop} onCancel={() => { setPendingRevision(null); dragTaskId.current = null; }} />}
    </>
  );
}

/* ── Mobile List ── */
function MobileList({ tasks, token, onStatusChange, onCommentAdded, onOpenDetail, onOpenImage }: {
  tasks: Task[]; token: string;
  onStatusChange: (id: number, status: string) => void;
  onCommentAdded: (id: number) => void;
  onOpenDetail: (task: Task) => void;
  onOpenImage: (task: Task) => void;
}) {
  const tabs = [
    { key: 'for_review', label: 'For Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'for_revision', label: 'For Revision' },
  ];
  const firstWithTasks = tabs.find(t => tasks.some(tk => tk.status === t.key))?.key || 'for_review';
  const [activeTab, setActiveTab] = useState(firstWithTasks);
  const [showRevModal, setShowRevModal] = useState(false);
  const [revTaskId, setRevTaskId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  async function handleApprove(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    setLoadingId(task.id);
    await fetch(`/api/approve/${token}/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
    onStatusChange(task.id, 'approved');
    showToast('Approved ✓');
    setLoadingId(null);
    setActiveTab('approved');
  }

  async function handleRevisionSubmit(text: string) {
    if (!revTaskId) return;
    setShowRevModal(false);
    setLoadingId(revTaskId);
    await fetch(`/api/approve/${token}/tasks/${revTaskId}`, { 
      method: 'PATCH', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ status: 'for_revision', comment: text }) 
    });
    onStatusChange(revTaskId, 'for_revision');
    onCommentAdded(revTaskId);
    showToast('Revision requested ✓');
    setLoadingId(null);
    setRevTaskId(null);
    setActiveTab('for_revision');
  }

  const shown = tasks.filter(t => t.status === activeTab);
  return (
    <>
      <div className={styles.mobileTabs}>
        {tabs.map(tab => {
          const count = tasks.filter(t => t.status === tab.key).length;
          return (
            <button key={tab.key}
              className={`${styles.mobileTab} ${activeTab === tab.key ? styles.mobileTabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {count > 0 && <span className={styles.mobileTabBadge}>{count}</span>}
            </button>
          );
        })}
      </div>
      <div className={styles.mobileTaskList}>
        {shown.length === 0 ? (
          <div className={styles.mobileEmptyState}>No items in this status.</div>
        ) : shown.map(task => {
          const s = task.status;
          const displayImg = getDisplayImageUrl(task.image_url);
          return (
            <div key={task.id} className={styles.mobileCard} onClick={() => onOpenDetail(task)}>
              <div className={styles.mobileCardImgWrap}>
                <img src={displayImg} alt={task.title} className={styles.mobileCardImg}
                  onError={e => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><rect fill="%23f3f4f6" width="400" height="220"/><text fill="%239ca3af" font-family="sans-serif" font-size="13" x="50%" y="50%" text-anchor="middle" dy=".3em">Image unavailable</text></svg>'; }}
                />
                <button className={styles.mobileCardEnlargeBtn} onClick={e => { e.stopPropagation(); onOpenImage(task); }} title="Enlarge image">🔍</button>
              </div>
              <div className={styles.mobileCardBody}>
                <div className={styles.mobileCardTopRow}>
                  <StatusBadge status={s} />
                  <span className={styles.mobileCardMeta}>{task.comment_count > 0 && `${task.comment_count} comment${task.comment_count !== 1 ? 's' : ''} · `}{formatDate(task.updated_at)}</span>
                </div>
                <h3 className={styles.mobileCardTitle}>{task.title}</h3>
                <p className={styles.mobileCardCaption}>{normalizeCaption(task.caption)}</p>
                <div className={styles.mobileCardActions} onClick={e => e.stopPropagation()}>
                  {s === 'for_review' && <>
                    <button className={`btn btn-success ${styles.actionBtn}`} onClick={e => handleApprove(e, task)} disabled={loadingId === task.id}>{loadingId === task.id ? '…' : '✓ Approve'}</button>
                    <button className={`btn btn-warning ${styles.actionBtnSecondary}`} onClick={e => { e.stopPropagation(); setRevTaskId(task.id); setShowRevModal(true); }} disabled={loadingId === task.id}>Request Revision</button>
                  </>}
                  {s === 'approved' && <>
                    <span className={styles.mobileApprovedNote}>✓ Approved</span>
                    <button className={`btn btn-warning btn-sm ${styles.actionBtnSecondary}`} style={{ flex: 'none', padding: '0 12px' }} onClick={e => { e.stopPropagation(); setRevTaskId(task.id); setShowRevModal(true); }}>Request Revision</button>
                  </>}
                  {s === 'for_revision' && <>
                    <span className={styles.mobileRevisionNote}>Revision requested</span>
                    <button className={`btn btn-success btn-sm ${styles.actionBtn}`} style={{ flex: 'none', padding: '0 12px' }} onClick={e => handleApprove(e, task)} disabled={loadingId === task.id}>Approve</button>
                  </>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {showRevModal && revTaskId !== null && <RevisionModal onSubmit={handleRevisionSubmit} onCancel={() => { setShowRevModal(false); setRevTaskId(null); }} />}
      {toast && <div className="toast-container"><div className="toast toast-success">{toast}</div></div>}
    </>
  );
}

/* ── Main Page ── */
export default function ApprovalPage() {
  const params = useParams();
  const token = params.token as string;
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [previewTask, setPreviewTask] = useState<Task | null>(null);

  const loadData = useCallback(() => {
    const ts = Date.now();
    fetch(`/api/approve/${token}?t=${ts}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('Invalid'); return r.json(); })
      .then(d => { 
        console.log('DEBUG FRONTEND: Received tasks:', d.tasks);
        setClient(d.client); 
        setTasks(d.tasks || []); 
      })
      .catch(() => setError('This approval link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  // Fetch on mount
  useEffect(() => { loadData(); }, [loadData]);

  // Re-fetch when user navigates back to the tab or switches focus
  useEffect(() => {
    const onFocus = () => loadData();
    const onVisible = () => { if (document.visibilityState === 'visible') loadData(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadData]);

  const handleStatusChange = useCallback((id: number, status: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    setDetailTask(prev => prev?.id === id ? { ...prev, status } : prev);
  }, []);
  const handleCommentAdded = useCallback((id: number) => { setTasks(prev => prev.map(t => t.id === id ? { ...t, comment_count: t.comment_count + 1 } : t)); }, []);

  if (loading) return <div className={styles.loadingScreen}><div className="loading-state"><div className="spinner" />Loading your approval board…</div></div>;
  if (error) return <div className={styles.loadingScreen}><div style={{ textAlign: 'center', maxWidth: 400 }}><h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Link not found</h1><p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>{error}</p></div></div>;

  const logoUrl = client?.logo_url ? getDisplayImageUrl(client.logo_url) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerTop}>
            {logoUrl ? (
              <img src={logoUrl} alt={client?.company_name} className={styles.clientLogo}
                onError={e => { const el = e.target as HTMLImageElement; el.style.display = 'none'; el.insertAdjacentHTML('afterend', `<div class="${styles.clientName}">${client?.company_name}</div>`); }} />
            ) : (
              <div className={styles.clientName}>{client?.company_name}</div>
            )}
            <h1 className={styles.boardTitle}>Content Approval Board</h1>
          </div>
          <p className={styles.instruction}>Review each item, then approve it or request changes. Drag cards between columns to update status.</p>
        </div>
      </header>
      <main className={styles.main}>
        {tasks.length === 0 ? (
          <div className="empty-state"><h3>No items yet</h3><p>Content will appear here once it&apos;s been assigned for review.</p></div>
        ) : (
          <>
            <div className={styles.desktopBoard}>
              <KanbanBoard tasks={tasks} token={token} onStatusChange={handleStatusChange} onCommentAdded={handleCommentAdded} onOpenDetail={setDetailTask} onOpenImage={setPreviewTask} />
            </div>
            <div className={styles.mobileView}>
              <MobileList tasks={tasks} token={token} onStatusChange={handleStatusChange} onCommentAdded={handleCommentAdded} onOpenDetail={setDetailTask} onOpenImage={setPreviewTask} />
            </div>
          </>
        )}
      </main>
      {detailTask && <TaskDetailModal task={detailTask} token={token} onClose={() => setDetailTask(null)} onStatusChange={handleStatusChange} onCommentAdded={handleCommentAdded} />}
      {previewTask && <ZoomableImageModal src={previewTask.image_url} alt={previewTask.title} onClose={() => setPreviewTask(null)} />}
    </div>
  );
}
