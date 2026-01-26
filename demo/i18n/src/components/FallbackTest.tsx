import { t } from '@astroscope/i18n/t';

/**
 * Component to demonstrate fallback behavior when translations are missing.
 * The keys used here are intentionally NOT in the mock translations.
 */
export default function FallbackTest() {
  return (
    <div style={{ padding: '1rem', background: '#fff3cd', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 1rem', color: '#856404' }}>Fallback Behavior Test</h3>

      <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#666' }}>
        These keys don't exist in the mock CMS — they fall back to the <code>example</code> value:
      </p>

      <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
        <li>
          <strong>fallback.missing:</strong> {t('fallback.missing', 'This is the fallback example text')}
        </li>
        <li>
          <strong>fallback.withVar:</strong> {t('fallback.withVar', 'Hello, {$name}!', { name: 'World' })}
        </li>
        <li>
          <strong>fallback.plural:</strong>{' '}
          {t('fallback.plural', '.input {$n :number}\n.match $n\none {{{$n} message}}\n* {{{$n} messages}}', { n: 5 })}
        </li>
      </ul>

      <p style={{ margin: '1rem 0 0', fontSize: '0.85rem', color: '#856404' }}>
        ℹ️ In production, fallback behavior is configurable: <code>'example'</code>, <code>'key'</code>,{' '}
        <code>'throw'</code>, or a custom function.
      </p>
    </div>
  );
}
