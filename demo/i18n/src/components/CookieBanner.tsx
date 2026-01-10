import { t } from '@astroscope/i18n/t';
import { useState } from 'react';

export default function CookieBanner() {
  const [accepted, setAccepted] = useState(false);

  if (accepted) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '1rem 2rem',
        background: '#333',
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        zIndex: 1000,
      }}
    >
      <p style={{ margin: 0 }}>{t('cookies.message', 'We use cookies to improve your experience.')}</p>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => setAccepted(true)}
          style={{
            padding: '0.5rem 1rem',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {t('cookies.accept', 'Accept')}
        </button>

        <button
          onClick={() => setAccepted(true)}
          style={{
            padding: '0.5rem 1rem',
            background: 'transparent',
            color: 'white',
            border: '1px solid white',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {t('cookies.decline', 'Decline')}
        </button>
      </div>
    </div>
  );
}
