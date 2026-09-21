import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * PRD Part II §3.3: "Domain modules cannot import Next.js route code or
 * provider SDKs directly. Application services call interfaces; infrastructure
 * supplies provider-specific implementations. This makes AI, map, booking, and
 * weather providers replaceable."
 *
 * A rule nobody checks is a rule that erodes, so it is enforced here.
 */

const FORBIDDEN_IN_DOMAIN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /from ['"]next\//, why: 'Next.js route code' },
  { pattern: /from ['"]postgres['"]/, why: 'the database driver' },
  { pattern: /from ['"]@anthropic-ai\//, why: 'the LLM SDK' },
  { pattern: /from ['"]ioredis['"]/, why: 'the Redis client' },
  { pattern: /from ['"]react['"]/, why: 'React' },
  { pattern: /from ['"]@\/platform\/db/, why: 'the database layer' },
  { pattern: /from ['"]@\/platform\/ai/, why: 'the AI gateway' },
  { pattern: /from ['"]@\/server\//, why: 'the server layer' },
];

const domainFiles = globSync('src/modules/*/domain/**/*.ts');

describe('dependency rule', () => {
  it('finds the domain modules it is meant to be checking', () => {
    // A guard that silently checks nothing is worse than no guard.
    expect(domainFiles.length).toBeGreaterThanOrEqual(8);
  });

  it('keeps domain modules free of framework and provider imports', () => {
    const violations: string[] = [];

    for (const file of domainFiles) {
      const source = readFileSync(file, 'utf8');

      for (const { pattern, why } of FORBIDDEN_IN_DOMAIN) {
        if (pattern.test(source)) {
          violations.push(`${file.replace(/\\/g, '/')} imports ${why}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps domain modules free of I/O', () => {
    const violations: string[] = [];

    for (const file of domainFiles) {
      const source = readFileSync(file, 'utf8');

      if (/\bfetch\s*\(/.test(source)) violations.push(`${file} calls fetch`);
      if (/from ['"]node:fs['"]/.test(source)) violations.push(`${file} reads the filesystem`);
    }

    expect(violations).toEqual([]);
  });
});

describe('platform adapters stay behind interfaces', () => {
  it('does not let application modules import a provider SDK directly', () => {
    const moduleFiles = globSync('src/modules/**/*.ts');
    const violations: string[] = [];

    for (const file of moduleFiles) {
      const source = readFileSync(file, 'utf8');

      // Modules reach providers through src/platform, never the SDK itself,
      // so a provider can be swapped without touching business code.
      if (/from ['"]@anthropic-ai\//.test(source)) violations.push(`${file} imports the Anthropic SDK`);
      if (/from ['"]ioredis['"]/.test(source)) violations.push(`${file} imports ioredis`);
      if (/from ['"]leaflet['"]/.test(source)) violations.push(`${file} imports Leaflet`);
    }

    expect(violations).toEqual([]);
  });
});
