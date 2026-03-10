import type { Rule } from 'eslint';

const DEFAULT_IGNORE_PATTERNS = [
  /^\s*$/, // whitespace only
  /^\s*[{}]\s*/, // just braces
  /^[0-9.]+$/, // numbers
  /^\s*\|\s*$/, // pipe separators
  /^\s*[•·–—]\s*$/, // bullets / dashes
];

export const DEFAULT_IGNORE_ATTRIBUTES = [
  'className',
  'class',
  'id',
  'key',
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
  'data-testid',
  'data-cy',
  'slot',
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

    const userPatterns = (options.ignorePatterns ?? []).map((p) => new RegExp(p));
    const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...userPatterns];

    const ignoreAttributes = new Set([...DEFAULT_IGNORE_ATTRIBUTES, ...(options.ignoreAttributes ?? [])]);

    function shouldIgnore(text: string): boolean {
      return allPatterns.some((p) => p.test(text));
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

        if (attrName && ignoreAttributes.has(attrName)) return true;
      }

      // string inside expression container inside attribute
      if (parent?.type === 'JSXExpressionContainer' && parent.parent?.type === 'JSXAttribute') {
        const attrName = parent.parent.name?.type === 'JSXIdentifier' ? parent.parent.name.name : null;

        if (attrName && ignoreAttributes.has(attrName)) return true;
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

        if (attrName && ignoreAttributes.has(attrName)) return;

        context.report({
          node: node.value,
          messageId: 'rawString',
          data: { text: text.length > 40 ? `${text.slice(0, 40)}...` : text },
        });
      },
    };
  },
};
