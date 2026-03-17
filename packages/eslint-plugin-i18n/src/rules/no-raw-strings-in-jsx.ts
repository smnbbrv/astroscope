import type { Rule } from 'eslint';

const DEFAULT_IGNORE_PATTERNS = [
  /^\s*$/, // whitespace only
  /^\s*[{}]\s*/, // just braces
  /^[0-9.]+$/, // numbers
  /^\s*\|\s*$/, // pipe separators
  /^\s*[•·–—]\s*$/, // bullets / dashes
  /^[\s\p{P}\p{S}]+$/u, // punctuation / symbols only (e.g. "(", ",", "/ —")
  /^#[0-9a-fA-F]{3,8}$/, // hex colors (e.g. "#003366", "#fff")
  /^\d+x\d+$/, // dimensions (e.g. "180x180")
];

export const DEFAULT_IGNORE_ATTRIBUTES = [
  // html attributes
  'id',
  'class',
  'className',
  'style',
  'href',
  'src',
  'type',
  'name',
  'value',
  'role',
  'htmlFor',
  'target',
  'rel',
  'method',
  'action',
  'loading',
  'decoding',
  'autoComplete',
  'allow',
  'as',
  'sizes',
  'color',
  'crossorigin',
  'referrerpolicy',
  'charset',
  'lang',
  'form',
  'key',
  'slot',

  // common component props
  'variant',
  'size',
  'mode',
  'orientation',
  'align',
  'icon',
  'tag',
  'tagName',

  // html aria attributes (non-text)
  'aria-hidden',
  'aria-live',
  'aria-atomic',

  // astro attributes
  'class:list',

  // testing attributes
  'data-testid',
  'data-cy',

  // svg attributes
  'd',
  'viewBox',
  'xmlns',
  'fill',
  'stroke',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'clipPath',
  'transform',
  'points',
  'pathLength',
  'filter',
  'filterUnits',
  'colorInterpolationFilters',
  'floodOpacity',
  'in',
  'in2',
  'result',
  'stroke-linecap',
  'stroke-linejoin',
  'clip-rule',
  'fill-rule',
  'path',
  'values',
];

// attribute name patterns — any attribute matching these is ignored
const DEFAULT_IGNORE_ATTRIBUTE_PATTERNS = [
  /className$/i, // *ClassName, *classname (e.g. labelClassName, pictureClassName)
  /^data-/, // data-* attributes
];

type Options = {
  ignorePatterns?: string[] | undefined;
  ignoreAttributes?: string[] | undefined;
};

export const noRawStringsInJsx: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'warn when raw strings appear in JSX that may need translation',
    },
    messages: {
      rawString: 'Raw string "{{ text }}" in JSX. Consider using `t()` for user-facing text.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignorePatterns: {
            type: 'array',
            items: { type: 'string' },
          },
          ignoreAttributes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options: Options = context.options[0] ?? {};

    const allPatterns = options.ignorePatterns
      ? options.ignorePatterns.map((p) => new RegExp(p))
      : DEFAULT_IGNORE_PATTERNS;

    const ignoreAttributes = new Set(options.ignoreAttributes ?? DEFAULT_IGNORE_ATTRIBUTES);

    function shouldIgnore(text: string): boolean {
      return allPatterns.some((p) => p.test(text));
    }

    function shouldIgnoreAttribute(name: string): boolean {
      if (ignoreAttributes.has(name)) return true;

      return DEFAULT_IGNORE_ATTRIBUTE_PATTERNS.some((p) => p.test(name));
    }

    function isInsideIgnoredAttribute(node: any): boolean {
      const parent = node.parent;

      if (parent?.type === 'JSXAttribute') {
        const attrName =
          parent.name?.type === 'JSXIdentifier'
            ? parent.name.name
            : parent.name?.type === 'JSXNamespacedName'
              ? `${parent.name.namespace.name}:${parent.name.name.name}`
              : null;

        if (attrName && shouldIgnoreAttribute(attrName)) return true;
      }

      // string inside expression container inside attribute
      if (parent?.type === 'JSXExpressionContainer' && parent.parent?.type === 'JSXAttribute') {
        const attrName = parent.parent.name?.type === 'JSXIdentifier' ? parent.parent.name.name : null;

        if (attrName && shouldIgnoreAttribute(attrName)) return true;
      }

      return false;
    }

    return {
      JSXText(node: any) {
        const text: string = node.value;

        if (shouldIgnore(text)) return;

        // trim and check if there's actual content
        const trimmed = text.trim();

        if (!trimmed) return;

        context.report({
          node,
          messageId: 'rawString',
          data: { text: trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed },
        });
      },

      // string literals used as JSX attribute values: <div title="Hello" />
      JSXAttribute(node: any) {
        if (!node.value) return;
        if (node.value.type !== 'Literal' || typeof node.value.value !== 'string') return;

        const text: string = node.value.value;

        if (shouldIgnore(text)) return;
        if (isInsideIgnoredAttribute(node)) return;

        // check if this attribute name is ignored
        const attrName =
          node.name?.type === 'JSXIdentifier'
            ? node.name.name
            : node.name?.type === 'JSXNamespacedName'
              ? `${node.name.namespace.name}:${node.name.name.name}`
              : null;

        if (attrName && shouldIgnoreAttribute(attrName)) return;

        context.report({
          node: node.value,
          messageId: 'rawString',
          data: { text: text.length > 40 ? `${text.slice(0, 40)}...` : text },
        });
      },

      // string literals inside JSX expressions: <div title={value ?? 'fallback'} /> or <div>{'text'}</div>
      Literal(node: any) {
        if (typeof node.value !== 'string') return;

        const ancestors = context.sourceCode.getAncestors(node);
        const inJsxExpression = ancestors.some((a: any) => a.type === 'JSXExpressionContainer');

        if (!inJsxExpression) return;

        // skip strings inside function calls (e.g. t('key', 'fallback'))
        if (ancestors.some((a: any) => a.type === 'CallExpression')) return;

        const text: string = node.value;

        if (shouldIgnore(text)) return;
        if (isInsideIgnoredAttribute(node)) return;

        context.report({
          node,
          messageId: 'rawString',
          data: { text: text.length > 40 ? `${text.slice(0, 40)}...` : text },
        });
      },
    };
  },
};
