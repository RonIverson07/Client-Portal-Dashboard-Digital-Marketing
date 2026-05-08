'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './dashboard.module.css';

interface Stats {
  total_clients: number;
  total_tasks: number;
  for_review: number;
  approved: number;
  for_revision: number;
}

interface RecentTask {
  id: number;
  title: string;
  company_name: string;
  status: string;
  updated_at: string;
  comment_count: number;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    for_review: { label: 'For Review', cls: 'badge badge-review' },
    approved: { label: 'Approved', cls: 'badge badge-approved' },
    for_revision: { label: 'For Revision', cls: 'badge badge-revision' },
  };
  const s = map[status] || { label: status, cls: 'badge' };
  return <span className={s.cls}>{s.label}</span>;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [taskRes, clientRes] = await Promise.all([
        fetch('/api/admin/tasks', { credentials: 'include' }),
        fetch('/api/admin/clients', { credentials: 'include' }),
      ]);

      if (taskRes.status === 401 || clientRes.status === 401) {
        router.push('/admin/login');
        return;
      }

      const taskData = await taskRes.json();
      const clientData = await clientRes.json();

      const tasks: RecentTask[] = taskData.tasks || [];
      const clients = clientData.clients || [];

      const s: Stats = {
        total_clients: clients.length,
        total_tasks: tasks.length,
        for_review: tasks.filter((t: RecentTask) => t.status === 'for_review').length,
        approved: tasks.filter((t: RecentTask) => t.status === 'approved').length,
        for_revision: tasks.filter((t: RecentTask) => t.status === 'for_revision').length,
      };

      setStats(s);
      setRecentTasks(tasks.slice(0, 10));
    } catch {
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div className="loading-state">
      <div className="spinner" />
      Loading dashboard…
    </div>
  );

  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageSubtitle}>Overview of all clients and content tasks.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/clients" className="btn btn-ghost">Manage Clients</Link>
          <Link href="/tasks" className="btn btn-primary">+ New Task</Link>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.total_clients ?? 0}</div>
          <div className={styles.statLabel}>Clients</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.total_tasks ?? 0}</div>
          <div className={styles.statLabel}>Total Tasks</div>
        </div>
        <div className={`${styles.statCard} ${styles.statReview}`}>
          <div className={styles.statValue}>{stats?.for_review ?? 0}</div>
          <div className={styles.statLabel}>Pending Review</div>
        </div>
        <div className={`${styles.statCard} ${styles.statApproved}`}>
          <div className={styles.statValue}>{stats?.approved ?? 0}</div>
          <div className={styles.statLabel}>Approved</div>
        </div>
        <div className={`${styles.statCard} ${styles.statRevision}`}>
          <div className={styles.statValue}>{stats?.for_revision ?? 0}</div>
          <div className={styles.statLabel}>Needs Revision</div>
        </div>
      </div>

      {/* Recent tasks */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Tasks</h2>
          <Link href="/tasks" className="btn btn-ghost btn-sm">View all</Link>
        </div>

        {recentTasks.length === 0 ? (
          <div className="empty-state">
            <h3>No tasks yet</h3>
            <p>Create your first client and add content tasks to get started.</p>
            <Link href="/tasks" className="btn btn-primary btn-sm">Create Task</Link>
          </div>
        ) : (
          <div className={styles.taskTable}>
            <div className={styles.tableHeader}>
              <span>Task</span>
              <span>Client</span>
              <span>Status</span>
              <span>Comments</span>
              <span>Updated</span>
            </div>
            {recentTasks.map(task => (
              <Link key={task.id} href={`/tasks?highlight=${task.id}`} className={styles.tableRow}>
                <span className={styles.taskTitle}>{task.title}</span>
                <span className={styles.taskClient}>{task.company_name}</span>
                <span><StatusBadge status={task.status} /></span>
                <span className={styles.taskMeta}>{task.comment_count} comment{task.comment_count !== 1 ? 's' : ''}</span>
                <span className={styles.taskMeta}>{formatDate(task.updated_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
