'use client';

import { useState, useEffect } from 'react';
import styles from '../admin.module.css';

export default function SettingsPage() {
  const [smtp, setSmtp] = useState({
    host: '',
    port: '',
    user: '',
    password: '',
    from_email: '',
    from_name: '',
    notification_email: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setSmtp({
            host: data.settings.smtp_host || '',
            port: data.settings.smtp_port?.toString() || '',
            user: data.settings.smtp_user || '',
            password: data.settings.smtp_password || '',
            from_email: data.settings.from_email || '',
            from_name: data.settings.from_name || '',
            notification_email: data.settings.notification_email || '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(smtp),
      });

      if (res.ok) {
        setMessage({ text: 'Settings saved successfully!', type: 'success' });
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (err) {
      setMessage({ text: 'Error saving settings. Please try again.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-state"><div className="spinner" />Loading settings...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>SMTP Configuration</h2>
            <p className={styles.sectionDescription}>
              These settings are used to send notifications when clients approve or request revisions.
            </p>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>SMTP Host</label>
                <input
                  type="text"
                  value={smtp.host}
                  onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                  placeholder="smtp.mailersend.net"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>SMTP Port</label>
                <input
                  type="number"
                  value={smtp.port}
                  onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
                  placeholder="587"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>SMTP User</label>
                <input
                  type="text"
                  value={smtp.user}
                  onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                  placeholder="MS_xxxxxx@..."
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>SMTP Password</label>
                <input
                  type="password"
                  value={smtp.password}
                  onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                  placeholder="Your SMTP Token"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>From Email</label>
                <input
                  type="email"
                  value={smtp.from_email}
                  onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })}
                  placeholder="notifications@yourdomain.com"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>From Name</label>
                <input
                  type="text"
                  value={smtp.from_name}
                  onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })}
                  placeholder="Content Approval Team"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>Notification Recipient Email</label>
                <input
                  type="email"
                  value={smtp.notification_email}
                  onChange={(e) => setSmtp({ ...smtp, notification_email: e.target.value })}
                  placeholder="your-admin-email@domain.com"
                  required
                />
              </div>
            </div>
          </div>

          {message.text && (
            <div className={`alert alert-${message.type}`} style={{ marginTop: '1rem' }}>
              {message.text}
            </div>
          )}

          <div className={styles.formActions} style={{ marginTop: '2rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
