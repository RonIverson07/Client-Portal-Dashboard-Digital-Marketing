'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import styles from './requests.module.css';
import { getDisplayImageUrl } from '@/lib/imageUtils';
import { supabase } from '@/lib/supabase';

interface ContentRequest {
  id: number;
  client_id: number;
  company_name: string;
  title: string;
  description: string;
  image_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Client {
  id: number;
  company_name: string;
}

function formatDate(d: string) {
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RequestsContent() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<ContentRequest[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ client_id: '', title: '', description: '', image_url: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [imgPreviewError, setImgPreviewError] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [reqRes, clientRes] = await Promise.all([
        fetch('/api/admin/requests', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/clients', { credentials: 'include', cache: 'no-store' }),
      ]);
      if (reqRes.status === 401) { router.push('/admin/login'); return; }
      const reqData = await reqRes.json();
      const clientData = await clientRes.json();
      setRequests(reqData.requests || []);
      setClients(clientData.clients || []);
      if (reqData.requests?.length > 0 && !selectedId) {
        setSelectedId(reqData.requests[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const filteredRequests = requests.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase()) || 
                         r.company_name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterStatus === 'all' || r.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const selectedRequest = requests.find(r => r.id === selectedId);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'requests');

      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setForm(prev => ({ ...prev, image_url: data.url }));
      setImgPreviewError(false);
      showToast('File uploaded successfully');
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = isEditing ? `/api/admin/requests/${selectedId}` : '/api/admin/requests';
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          client_id: Number(form.client_id)
        }),
        credentials: 'include'
      });
      if (res.ok) {
        setShowModal(false);
        showToast(isEditing ? 'Request updated' : 'Request created');
        loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status: string) {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/admin/requests/${selectedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include'
      });
      if (res.ok) {
        showToast(`Marked as ${status}`);
        setRequests(prev => prev.map(r => r.id === selectedId ? { ...r, status } : r));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete() {
    if (!selectedId || !confirm('Delete this request?')) return;
    try {
      const res = await fetch(`/api/admin/requests/${selectedId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        showToast('Request deleted');
        const index = requests.findIndex(r => r.id === selectedId);
        const newRequests = requests.filter(r => r.id !== selectedId);
        setRequests(newRequests);
        if (newRequests.length > 0) {
          setSelectedId(newRequests[Math.max(0, index - 1)].id);
        } else {
          setSelectedId(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div className="loading-state"><div className="spinner" />Loading requests…</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.searchBar}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            type="text" 
            placeholder="Search requests..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />
        </div>
        <button className="btn btn-primary" onClick={() => { 
          setIsEditing(false); 
          setForm({ client_id: '', title: '', description: '', image_url: '' }); 
          setImgPreviewError(false);
          setShowModal(true); 
        }}>
          + New Request
        </button>
      </div>

      <div className={styles.content}>
        <div className={styles.listPane}>
          <div className={styles.inboxHeader}>
             <div className={styles.inboxTitleRow}>
               <span>Inbox</span>
               <span className={styles.countBadge}>{filteredRequests.length}</span>
             </div>
             <div className={styles.filterBar}>
               {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
                 <button 
                   key={s} 
                   className={`${styles.filterTab} ${filterStatus === s ? styles.filterTabActive : ''}`}
                   onClick={() => setFilterStatus(s)}
                 >
                   {s.charAt(0).toUpperCase() + s.slice(1)}
                 </button>
               ))}
             </div>
          </div>
          {filteredRequests.length === 0 ? (
            <div className={styles.emptyList}>
               <svg style={{ opacity: 0.15, marginBottom: 16 }} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                 <polyline points="22,6 12,13 2,6"></polyline>
               </svg>
               <p>No requests found</p>
            </div>
          ) : (
            filteredRequests.map(req => (
              <div 
                key={req.id} 
                className={`${styles.listRow} ${selectedId === req.id ? styles.activeRow : ''}`}
                onClick={() => setSelectedId(req.id)}
              >
                <div className={styles.rowTop}>
                  <span className={styles.rowClient}>{req.company_name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`${styles.miniStatusTag} ${styles['mini_' + req.status]}`}>
                      {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                    <span className={styles.rowDate}>{formatDate(req.created_at)}</span>
                  </div>
                </div>
                <div className={styles.rowTitle}>
                   <span className={`${styles.statusDot} ${styles['dot_' + req.status]}`} />
                   {req.title}
                </div>
                <div className={styles.rowSnippet}>{req.description}</div>
                {req.image_url && (
                  <div className={styles.attachmentBadge}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                    </svg>
                    Attachment
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className={styles.detailPane}>
          {selectedRequest ? (
            <div className={styles.detailContent}>
              <div className={styles.detailToolbar}>
                <div className={styles.toolGroup}>
                  <button 
                    className={`${styles.statusBtn} ${selectedRequest.status === 'approved' ? styles.statusActive : ''}`} 
                    onClick={() => updateStatus('approved')}
                  >
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                       <polyline points="20 6 9 17 4 12"></polyline>
                     </svg>
                     Approve
                  </button>
                  <button 
                    className={`${styles.statusBtn} ${selectedRequest.status === 'rejected' ? styles.statusActive : ''}`} 
                    onClick={() => updateStatus('rejected')}
                  >
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                       <line x1="18" y1="6" x2="6" y2="18"></line>
                       <line x1="6" y1="6" x2="18" y2="18"></line>
                     </svg>
                     Reject
                  </button>
                </div>
                <div className={styles.toolGroup}>
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    setIsEditing(true);
                    setForm({ 
                      client_id: String(selectedRequest.client_id), 
                      title: selectedRequest.title, 
                      description: selectedRequest.description,
                      image_url: selectedRequest.image_url || ''
                    });
                    setImgPreviewError(false);
                    setShowModal(true);
                  }}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }} onClick={handleDelete}>Delete</button>
                </div>
              </div>

              <div className={styles.messageView}>
                <div className={styles.messageHeader}>
                  <div className={styles.messageMeta}>
                    <div className={styles.clientInfo}>
                       <div className={styles.clientAvatar}>{selectedRequest.company_name.charAt(0)}</div>
                       <div>
                          <div className={styles.clientName}>{selectedRequest.company_name}</div>
                          <div className={styles.messageDate}>{new Date(selectedRequest.created_at).toLocaleString()}</div>
                       </div>
                    </div>
                    <div className={`${styles.statusTag} ${styles['tag_' + selectedRequest.status]}`}>
                      {selectedRequest.status.toUpperCase()}
                    </div>
                  </div>
                  <h1 className={styles.messageTitle}>{selectedRequest.title}</h1>
                </div>

                <div className={styles.messageBody}>
                  <div className={styles.descriptionBox}>
                    {selectedRequest.description || <em style={{ opacity: 0.5 }}>No description provided.</em>}
                  </div>

                  {selectedRequest.image_url && (
                    <div className={styles.attachmentSection}>
                      <div className={styles.attachmentHeader}>Attached File</div>
                      {selectedRequest.image_url.match(/\.(jpg|jpeg|png|gif|webp|jfif|avif)$|^https:\/\/.*(jpg|jpeg|png|gif|webp|jfif|avif)/i) ? (
                        <div className={styles.imagePreviewWrap}>
                          <img 
                            src={selectedRequest.image_url} 
                            alt="Attachment" 
                            className={styles.imagePreview}
                          />
                        </div>
                      ) : (
                        <div className={styles.fileBox}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                            <polyline points="13 2 13 9 20 9"></polyline>
                          </svg>
                          <div>
                             <div style={{ fontWeight: 600, color: '#1e293b' }}>
                               {selectedRequest.image_url.split('/').pop()?.split('-').slice(0, -1).join('-') || 'Document Attachment'}
                             </div>
                             <a href={selectedRequest.image_url} target="_blank" rel="noopener noreferrer" className={styles.downloadLink} download>
                               Download Original File ⬇️
                             </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.noSelection}>
              <div className={styles.noSelectionIcon}>📥</div>
              <h3>Select a request to view details</h3>
              <p>Or create a new one to get started.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className={styles.modalHeader}>
              <h2>{isEditing ? 'Edit Request' : 'New Content Request'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave} className={styles.modalBody}>
              <div className="form-group">
                <label>Client *</label>
                <select 
                  value={form.client_id} 
                  onChange={e => setForm({...form, client_id: e.target.value})} 
                  required
                >
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Title *</label>
                <input 
                  type="text" 
                  value={form.title} 
                  onChange={e => setForm({...form, title: e.target.value})} 
                  placeholder="e.g. Request for April Social Media Calendar" 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea 
                  value={form.description} 
                  onChange={e => setForm({...form, description: e.target.value})} 
                  placeholder="Details about the request..." 
                  rows={6} 
                />
              </div>

              {form.image_url && (
                <div className={styles.attachmentPreview}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>📎</span>
                    <span style={{ fontWeight: 500 }}>{form.image_url.split('/').pop()?.split('?')[0] || 'Attached file'}</span>
                  </div>
                  <button type="button" onClick={() => setForm({...form, image_url: ''})} title="Remove attachment">✕</button>
                </div>
              )}

              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                style={{ display: 'none' }} 
              />

              <div className={styles.modalToolbar}>
                <button 
                  type="button" 
                  className={`${styles.attachBtn} ${uploading ? styles.loadingBtn : ''}`} 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <div className={styles.loadingSpinner} /> : <span>📎</span>}
                  {uploading ? 'Uploading...' : 'Attach File'}
                </button>
                {!form.image_url && !uploading && <span style={{ fontSize: 12, color: '#64748b' }}>Support images, PDF, Word, etc.</span>}
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
                  {saving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Send Request')}
                </button>
              </div>
            </form>
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

export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="loading-state">Loading...</div>}>
      <RequestsContent />
    </Suspense>
  );
}
