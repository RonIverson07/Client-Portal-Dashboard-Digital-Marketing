import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      padding: '24px',
      gap: '16px',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '30px', fontWeight: 700, color: '#111827' }}>Client Approval Portal</h1>
      <p style={{ color: '#6b7280', maxWidth: '380px', fontSize: '15px' }}>
        A professional content approval platform for digital marketing teams.
      </p>
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <Link href="/admin/login" className="btn btn-primary">Admin Login</Link>
      </div>
    </main>
  );
}
