import { RuleTester } from 'eslint';
import { noRawStringsInJsx } from './no-raw-strings-in-jsx.js';

const tester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

tester.run('no-raw-strings-in-jsx', noRawStringsInJsx, {
  valid: [
    // whitespace only
    { code: '<div> </div>;' },
    // expression with t()
    { code: `<div>{t('key', 'fallback')}</div>;` },
    // ignored attributes
    { code: '<div className="container" />;' },
    { code: '<input type="text" />;' },
    { code: '<a href="/path" />;' },
    { code: '<div id="main" />;' },
    // numbers
    { code: '<div>123</div>;' },
    // punctuation only
    { code: '<div>(</div>;' },
    { code: '<div>)</div>;' },
    { code: '<div>,</div>;' },
    { code: '<div>.</div>;' },
    { code: '<div>-</div>;' },
    { code: '<div>/</div>;' },
    { code: '<div>:</div>;' },
    { code: '<div>;</div>;' },
    // punctuation with whitespace
    { code: '<div> ( </div>;' },
    { code: '<div> , </div>;' },
    { code: '<div> — </div>;' },
    // mixed punctuation / symbols
    { code: '<div>/ —</div>;' },
    { code: '<div>&amp;</div>;' },
    // hex colors
    { code: '<meta content="#003366" />;' },
    { code: '<meta content="#fff" />;' },
    // dimensions
    { code: '<link sizes="180x180" />;' },
    // string literals inside function calls in JSX expressions
    { code: `<div>{fn('some string')}</div>;` },
    { code: `<div title={fn('some string')} />;` },
  ],
  invalid: [
    {
      code: '<div>Hello World</div>;',
      errors: [{ messageId: 'rawString' }],
    },
    {
      code: '<button>Submit</button>;',
      errors: [{ messageId: 'rawString' }],
    },
    {
      code: '<div title="Welcome" />;',
      errors: [{ messageId: 'rawString' }],
    },
    // string literals in JSX expressions (fallbacks, inline text)
    {
      code: `<div title={value ?? 'Fallback text'} />;`,
      errors: [{ messageId: 'rawString' }],
    },
    {
      code: `<div>{'Hello World'}</div>;`,
      errors: [{ messageId: 'rawString' }],
    },
  ],
});
