import { type ChildProcess, spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const DEV_PORT = 14331;
const PROD_PORT = 14332;
const DEMO_DIR = new URL('..', import.meta.url).pathname;

let devServer: ChildProcess | null = null;
let prodServer: ChildProcess | null = null;

async function waitForServer(port: number, timeout = 30000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://localhost:${port}/`);

      if (res.ok) return;
    } catch {
      // server not ready yet
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  throw new Error(`server on port ${port} did not start within ${timeout}ms`);
}

async function fetchPage(port: number): Promise<string> {
  const res = await fetch(`http://localhost:${port}/`);

  return res.text();
}

/**
 * extract all serialized props from <astro-island> elements in the HTML.
 * returns the decoded props attribute values.
 */
function extractIslandProps(html: string): string[] {
  const results: string[] = [];
  const re = /<astro-island[^>]*\bprops="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const decoded = match[1]!
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'");

    results.push(decoded);
  }

  return results;
}

// fields that MUST NOT appear in island props (sensitive server data)
const FORBIDDEN_FIELDS = [
  'passwordHash',
  'sessionToken',
  'internalId',
  'dbConnectionString',
  'internalScore',
  'createdBy',
  'fullNumber',
  'cvv',
  'bic',
  'rank',
  'secret',
];

// fields that MUST appear in island props (declared in component prop types)
const REQUIRED_FIELDS = ['name', 'email', 'title', 'heading', 'iban', 'endsWith', 'label'];

function assertStripping(html: string, label: string): void {
  const islandProps = extractIslandProps(html);

  expect(islandProps.length, `${label}: should have at least one <astro-island>`).toBeGreaterThan(0);

  const allProps = islandProps.join(' ');

  for (const field of FORBIDDEN_FIELDS) {
    expect(allProps, `${label}: "${field}" should be stripped from island props`).not.toContain(`"${field}"`);
  }

  for (const field of REQUIRED_FIELDS) {
    expect(allProps, `${label}: "${field}" should be present in island props`).toContain(`"${field}"`);
  }
}

beforeAll(async () => {
  devServer = spawn('npx', ['astro', 'dev', '--port', String(DEV_PORT)], {
    cwd: DEMO_DIR,
    stdio: 'pipe',
  });

  prodServer = spawn('node', ['./dist/server/entry.mjs'], {
    cwd: DEMO_DIR,
    env: { ...process.env, PORT: String(PROD_PORT) },
    stdio: 'pipe',
  });

  await Promise.all([waitForServer(DEV_PORT), waitForServer(PROD_PORT)]);
}, 60000);

afterAll(() => {
  devServer?.kill();
  prodServer?.kill();
});

describe('production server', () => {
  test('strips sensitive fields from island props', async () => {
    const html = await fetchPage(PROD_PORT);

    assertStripping(html, 'prod');
  });
});

describe('dev server', () => {
  test('strips sensitive fields from island props', async () => {
    const html = await fetchPage(DEV_PORT);

    assertStripping(html, 'dev');
  });
});

describe('dev/prod parity', () => {
  test('same island count', async () => {
    const [devHtml, prodHtml] = await Promise.all([fetchPage(DEV_PORT), fetchPage(PROD_PORT)]);

    const devIslands = extractIslandProps(devHtml);
    const prodIslands = extractIslandProps(prodHtml);

    expect(devIslands.length).toBe(prodIslands.length);
  });
});
