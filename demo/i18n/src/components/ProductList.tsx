import { t } from '@astroscope/i18n/t';
import ProductCardNested from './ProductCardNested';

const products = [
  { name: 'Wireless Headphones', price: '$79.99', image: '#6366f1' },
  { name: 'Smart Watch', price: '$199.99', image: '#ec4899' },
  { name: 'USB-C Hub', price: '$49.99', image: '#14b8a6' },
];

export default function ProductList() {
  return (
    <div>
      <h3 style={{ marginBottom: '1rem' }}>{t('productList.title', { fallback: 'Featured Products' })}</h3>
      <p style={{ marginBottom: '1rem', color: '#666' }}>
        {t('productList.description', { fallback: 'Check out our top picks for you' })}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {products.map((product) => (
          <ProductCardNested key={product.name} {...product} />
        ))}
      </div>
    </div>
  );
}
