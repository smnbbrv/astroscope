import { t } from '@astroscope/i18n/t';
import { useState } from 'react';

export default function CookieBanner() {
  const [accepted, setAccepted] = useState(false);

  if (accepted) return null;

  return (
    <div className="mb-6 p-4 bg-neutral text-neutral-content rounded-lg flex justify-between items-center gap-4">
      <p className="m-0">{t('cookies.message', 'We use cookies to improve your experience.')}</p>

      <div className="flex gap-2">
        <button onClick={() => setAccepted(true)} className="btn btn-primary btn-sm">
          {t('cookies.accept', 'Accept')}
        </button>

        <button onClick={() => setAccepted(true)} className="btn btn-ghost btn-sm">
          {t('cookies.decline', 'Decline')}
        </button>
      </div>
    </div>
  );
}
