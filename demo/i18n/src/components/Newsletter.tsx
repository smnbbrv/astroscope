import { t } from '@astroscope/i18n/t';
import { useState } from 'react';

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubscribed(true);
  };

  return (
    <div style={{ padding: '1rem', background: '#e8f4f8', borderRadius: '8px' }}>
      <h3>{t('newsletter.title', 'Stay Updated')}</h3>

      {subscribed ? (
        <p style={{ color: '#0a7c42' }}>{t('newsletter.success', 'Thanks for subscribing!')}</p>
      ) : (
        <>
          <p>{t('newsletter.description', 'Get the latest news delivered to your inbox.')}</p>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('newsletter.placeholder', 'Enter your email')}
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '0.5rem 1rem',
                background: '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {t('newsletter.subscribe', 'Subscribe')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
