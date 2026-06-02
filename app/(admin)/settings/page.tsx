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
  const [clickupSettings, setClickupSettings] = useState({
    api_token: '',
    space_id: '',
    list_id: '',
    list_id_2: '',
    status_for_review: '',
    status_approved: '',
    status_for_revision: '',
    status_published: ''
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
          setClickupSettings({
            api_token: data.settings.clickup_api_token || '',
            space_id: data.settings.clickup_space_id || '',
            list_id: data.settings.clickup_list_id || '',
            list_id_2: data.settings.clickup_list_id_2 || '',
            status_for_review: data.settings.clickup_status_for_review || '',
            status_approved: data.settings.clickup_status_approved || '',
            status_for_revision: data.settings.clickup_status_for_revision || '',
            status_published: data.settings.clickup_status_published || ''
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
        body: JSON.stringify({ 
          ...smtp, 
          clickup_api_token: clickupSettings.api_token,
          clickup_space_id: clickupSettings.space_id,
          clickup_list_id: clickupSettings.list_id,
          clickup_list_id_2: clickupSettings.list_id_2,
          clickup_status_for_review: clickupSettings.status_for_review,
          clickup_status_approved: clickupSettings.status_approved,
          clickup_status_for_revision: clickupSettings.status_for_revision,
          clickup_status_published: clickupSettings.status_published
        }),
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
                />
              </div>
              <div className={styles.formGroup}>
                <label>SMTP Port</label>
                <input
                  type="number"
                  value={smtp.port}
                  onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
                  placeholder="587"
                />
              </div>
              <div className={styles.formGroup}>
                <label>SMTP User</label>
                <input
                  type="text"
                  value={smtp.user}
                  onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                  placeholder="MS_xxxxxx@..."
                />
              </div>
              <div className={styles.formGroup}>
                <label>SMTP Password</label>
                <input
                  type="password"
                  value={smtp.password}
                  onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                  placeholder="Your SMTP Token"
                />
              </div>
              <div className={styles.formGroup}>
                <label>From Email</label>
                <input
                  type="email"
                  value={smtp.from_email}
                  onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })}
                  placeholder="notifications@yourdomain.com"
                />
              </div>
              <div className={styles.formGroup}>
                <label>From Name</label>
                <input
                  type="text"
                  value={smtp.from_name}
                  onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })}
                  placeholder="Content Approval Team"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Notification Recipient Email</label>
                <input
                  type="email"
                  value={smtp.notification_email}
                  onChange={(e) => setSmtp({ ...smtp, notification_email: e.target.value })}
                  placeholder="your-admin-email@domain.com"
                />
              </div>
            </div>
          </div>

          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>ClickUp Integration</h2>
            <p className={styles.sectionDescription}>
              Configure ClickUp integration to sync tasks between your system and ClickUp.
            </p>

            <div className={styles.formGrid}>
              <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                <label>ClickUp API Token</label>
                <input
                  type="password"
                  value={clickupSettings.api_token}
                  onChange={(e) => setClickupSettings({ ...clickupSettings, api_token: e.target.value })}
                  placeholder="pk_XXXXXXXXXXXXXXXXXXXXXXXX"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Space ID</label>
                <input
                  type="text"
                  value={clickupSettings.space_id}
                  onChange={(e) => setClickupSettings({ ...clickupSettings, space_id: e.target.value })}
                  placeholder="12345678"
                />
              </div>
              <div className={styles.formGroup}>
                <label>List ID 1</label>
                <input
                  type="text"
                  value={clickupSettings.list_id}
                  onChange={(e) => setClickupSettings({ ...clickupSettings, list_id: e.target.value })}
                  placeholder="12345678"
                />
              </div>
              <div className={styles.formGroup}>
                <label>List ID 2 (Optional)</label>
                <input
                  type="text"
                  value={clickupSettings.list_id_2}
                  onChange={(e) => setClickupSettings({ ...clickupSettings, list_id_2: e.target.value })}
                  placeholder="12345678 (leave empty if not needed)"
                />
              </div>
              <div className={styles.formGroup}>
                <label>ClickUp Status for "For Review"</label>
                <input
                  type="text"
                  value={clickupSettings.status_for_review}
                  onChange={(e) => setClickupSettings({ ...clickupSettings, status_for_review: e.target.value })}
                  placeholder="e.g., to review"
                />
              </div>
              <div className={styles.formGroup}>
                <label>ClickUp Status for "Approved"</label>
                <input
                  type="text"
                  value={clickupSettings.status_approved}
                  onChange={(e) => setClickupSettings({ ...clickupSettings, status_approved: e.target.value })}
                  placeholder="e.g., approved"
                />
              </div>
              <div className={styles.formGroup}>
                <label>ClickUp Status for "For Revision"</label>
                <input
                  type="text"
                  value={clickupSettings.status_for_revision}
                  onChange={(e) => setClickupSettings({ ...clickupSettings, status_for_revision: e.target.value })}
                  placeholder="e.g., revision"
                />
              </div>
              <div className={styles.formGroup}>
                <label>ClickUp Status for "Published"</label>
                <input
                  type="text"
                  value={clickupSettings.status_published}
                  onChange={(e) => setClickupSettings({ ...clickupSettings, status_published: e.target.value })}
                  placeholder="e.g., published"
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
