'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import styles from './admin.module.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('admin_user') : null;
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { }
    }
  }, []);

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    localStorage.removeItem('admin_user');
    router.push('/admin/login');
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/clients', label: 'Clients' },
    { href: '/tasks', label: 'Tasks' },
    { href: '/spaces', label: 'Spaces' },
    { href: '/requests', label: 'Requests' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <div className={styles.layout}>
      {/* Mobile header */}
      <header className={styles.mobileHeader}>
        <div className={styles.mobileLogo}>
          <div className={styles.logoMark}>AP</div>
          <span>Admin Portal</span>
        </div>
        <button className={styles.menuBtn} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
          <span /><span /><span />
        </button>
      </header>

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarTop}>
          <div className={styles.sidebarLogo}>
            <div className={styles.logoMark}>AP</div>
            <div>
              <div className={styles.logoTitle}>Admin Portal</div>
              <div className={styles.logoSub}>Content Approvals</div>
            </div>
          </div>

          <nav className={styles.nav}>
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${pathname === item.href ? styles.navLinkActive : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className={styles.sidebarBottom}>
          {user && (
            <div className={styles.userInfo}>
              <div className={styles.userAvatar}>{user.name?.charAt(0)?.toUpperCase() || 'A'}</div>
              <div className={styles.userMeta}>
                <div className={styles.userName}>{user.name}</div>
                <div className={styles.userEmail}>{user.email}</div>
              </div>
            </div>
          )}
          <button onClick={handleLogout} className={`btn btn-ghost btn-sm ${styles.logoutBtn}`}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {mobileOpen && <div className={styles.mobileOverlay} onClick={() => setMobileOpen(false)} />}

      {/* Main content */}
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
