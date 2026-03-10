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
  ],
});
