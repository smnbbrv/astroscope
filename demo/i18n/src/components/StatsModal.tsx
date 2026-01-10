import { t } from '@astroscope/i18n/t';

export type StatsModalProps = {
  onClose: () => void;
};

export default function StatsModal({ onClose }: StatsModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>{t('stats.title', 'Your Statistics')}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', margin: '1.5rem 0' }}>
          <div style={{ padding: '1rem', background: '#f0f9ff', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#0070f3' }}>127</div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>{t('stats.orders', 'Total Orders')}</div>
          </div>
          <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>$3,249</div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>{t('stats.spent', 'Total Spent')}</div>
          </div>
          <div style={{ padding: '1rem', background: '#fef3f2', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>4.8</div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>{t('stats.rating', 'Avg Rating')}</div>
          </div>
          <div style={{ padding: '1rem', background: '#fefce8', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#eab308' }}>12</div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>{t('stats.reviews', 'Reviews Given')}</div>
          </div>
        </div>

        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          {t('stats.member_since', 'Member since {date}', { date: 'January 2023' })}
        </p>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          {t('stats.close', 'Close')}
        </button>
      </div>
    </div>
  );
}
