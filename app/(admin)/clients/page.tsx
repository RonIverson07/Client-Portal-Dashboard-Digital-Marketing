'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './clients.module.css';
import { getDisplayImageUrl } from '@/lib/imageUtils';

interface Client {
  id: number;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  private_token: string;
  logo_url: string | null;
  notes: string | null;
  task_count: number;
  approved_count: number;
  for_review_count: number;
  for_revision_count: number;
  published_count: number;
  created_at: string;
}

interface ClientFormData {
  company_name: string;
  contact_name: string;
  contact_email: string;
  logo_url: string;
  notes: string;
}

const emptyForm: ClientFormData = { company_name: '', contact_name: '', contact_email: '', logo_url: '', notes: '' };

function getBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button className={`btn btn-ghost btn-sm ${styles.copyBtn}`} onClick={copy} title="Copy link">
      {copied ? '✓ Copied' : 'Copy Link'}
    </button>
  );
}

export default function AdminClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    try {
      const res = await fetch('/api/admin/clients', { credentials: 'include' });
      if (res.status === 401) { router.push('/admin/login'); return; }
      const data = await res.json();
      setClients(data.clients || []);
    } catch {
      setError('Failed to load clients.');
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(client: Client) {
    setEditId(client.id);
    setForm({
      company_name: client.company_name,
      contact_name: client.contact_name || '',
      contact_email: client.contact_email || '',
      logo_url: client.logo_url || '',
      notes: client.notes || '',
    });
    setFormError('');
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);

    try {
      const url = editId ? `/api/admin/clients/${editId}` : '/api/admin/clients';
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Failed to save.'); return; }

      setShowForm(false);
      showToast(editId ? 'Client updated.' : 'Client created.');
      loadClients();
    } catch {
      setFormError('An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/admin/clients/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setDeleteConfirm(null);
      showToast('Client deleted.');
      loadClients();
    }
  }

  async function handleRegenerateToken(id: number) {
    if (!confirm('Regenerate token? The old private link will stop working.')) return;
    const res = await fetch(`/api/admin/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'regenerate_token' }),
    });
    if (res.ok) {
      showToast('New approval link generated.');
      loadClients();
    }
  }

  if (loading) return <div className="loading-state"><div className="spinner" />Loading clients…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Clients</h1>
          <p className={styles.pageSubtitle}>{clients.length} client{clients.length !== 1 ? 's' : ''} total</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ New Client</button>
      </div>

      {clients.length === 0 ? (
        <div className="empty-state card" style={{ padding: 'var(--space-12)' }}>
          <h3>No clients yet</h3>
          <p>Create your first client to generate a private approval link.</p>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>Create Client</button>
        </div>
      ) : (
        <div className={styles.clientList}>
          {clients.map(client => (
            <div key={client.id} className={`card ${styles.clientCard}`}>
              <div className={styles.clientHeader}>
                <div>
                  <h2 className={styles.clientName}>{client.company_name}</h2>
                  {client.contact_name && <p className={styles.contactInfo}>{client.contact_name}{client.contact_email && ` · ${client.contact_email}`}</p>}
                </div>
                <div className={styles.clientActions}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(client)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirm(client.id)}>Delete</button>
                </div>
              </div>

              {/* Task stats */}
              <div className={styles.taskStats}>
                <span className={styles.statItem}><strong>{client.task_count}</strong> tasks</span>
                <span className={`${styles.statItem} ${styles.statItemReview}`}><strong>{client.for_review_count}</strong> review</span>
                <span className={`${styles.statItem} ${styles.statItemApproved}`}><strong>{client.approved_count}</strong> approved</span>
                <span className={`${styles.statItem} ${styles.statItemRevision}`}><strong>{client.for_revision_count}</strong> revision</span>
                <span className={`${styles.statItem} ${styles.statItemPublished}`}><strong>{client.published_count}</strong> published</span>
              </div>

              {/* Private link */}
              <div className={styles.linkSection}>
                <div className={styles.linkLabel}>Private Approval Link</div>
                <div className={styles.linkRow}>
                  <input
                    readOnly
                    value={`${getBaseUrl()}/approve/${client.private_token}`}
                    className={styles.linkInput}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <CopyBtn text={`${getBaseUrl()}/approve/${client.private_token}`} />
                  <a
                    href={`/approve/${client.private_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    title="Open approval page"
                  >
                    Open ↗
                  </a>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleRegenerateToken(client.id)}
                    title="Generate new link (old link will stop working)"
                  >
                    Regenerate
                  </button>
                </div>
              </div>

              {client.notes && <p className={styles.notes}>{client.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Client Form Modal */}
      {showForm && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal">
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editId ? 'Edit Client' : 'New Client'}</h2>
              <button className={`btn btn-ghost btn-sm`} onClick={() => setShowForm(false)}>Close</button>
            </div>
            <form onSubmit={handleSave} className={styles.modalBody}>
              {formError && <div className="alert alert-error">{formError}</div>}
              <div className="form-group">
                <label>Company Name *</label>
                <input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Acme Corp" required />
              </div>
              <div className="form-group">
                <label>Contact Name</label>
                <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Jane Smith" />
              </div>
              <div className="form-group">
                <label>Contact Email</label>
                <input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="jane@acme.com" />
              </div>
              <div className="form-group">
                <label>Logo URL <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(transparent PNG or SVG recommended)</span></label>
                <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://example.com/logo.png" />
                {form.logo_url && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--color-surface-2)', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}>
                    <img src={getDisplayImageUrl(form.logo_url)} alt="Logo preview" style={{ maxHeight: 40, maxWidth: 160, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes about this client…" rows={3} />
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm !== null && (
        <div className="overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Delete Client?</h2>
            </div>
            <div className={styles.modalBody}>
              <p style={{ marginBottom: 'var(--space-5)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                This will permanently delete the client and all their tasks and comments. This cannot be undone.
              </p>
              <div className={styles.modalFooter}>
                <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm!)}>Delete Client</button>
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
