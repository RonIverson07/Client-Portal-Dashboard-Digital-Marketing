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
  
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [changingPass, setChangingPass] = useState(false);
  const [passMessage, setPassMessage] = useState({ text: '', type: '' });

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassMessage({ text: 'New passwords do not match.', type: 'error' });
      return;
    }
    setChangingPass(true);
    setPassMessage({ text: '', type: '' });

    try {
      const res = await fetch('/api/admin/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPassMessage({ text: 'Password updated successfully!', type: 'success' });
        setPasswords({ current: '', new: '', confirm: '' });
      } else {
        setPassMessage({ text: data.error || 'Failed to update password.', type: 'error' });
      }
    } catch {
      setPassMessage({ text: 'Error updating password.', type: 'error' });
    } finally {
      setChangingPass(false);
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

      <div className={styles.card} style={{ marginTop: '2rem' }}>
        <form onSubmit={handleChangePassword} className={styles.form}>
          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>Security</h2>
            <p className={styles.sectionDescription}>
              Update your administrator password here.
            </p>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Current Password</label>
                <input
                  type="password"
                  value={passwords.current}
                  onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>New Password</label>
                <input
                  type="password"
                  value={passwords.new}
                  onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                  placeholder="Minimum 8 characters"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>Confirm New Password</label>
                <input
                  type="password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  placeholder="Re-type new password"
                  required
                />
              </div>
            </div>
          </div>

          {passMessage.text && (
            <div className={`alert alert-${passMessage.type}`} style={{ marginTop: '1rem' }}>
              {passMessage.text}
            </div>
          )}

          <div className={styles.formActions} style={{ marginTop: '2rem' }}>
            <button type="submit" className="btn btn-primary" disabled={changingPass}>
              {changingPass ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
