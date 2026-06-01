import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENESYS_ENDPOINTS } from '@/lib/constants';

/**
 * Endpoint scope guardrail (TODO Block 6). Fails the build if any production
 * source file references a Knowledge endpoint family that is intentionally
 * out of scope for v1.1 — preventing accidental expansion into legacy
 * Workbench / guest / settings / connector surface.
 */

const FORBIDDEN_PATTERNS: Array<[label: string, pattern: string]> = [
  ['Workbench knowledgebases', '/knowledge/knowledgebases'],
  ['guest runtime sessions', '/knowledge/guest'],
  ['org Knowledge settings', '/knowledge/settings'],
  ['legacy document uploads', '/knowledge/documentuploads'],
  ['fabric connections', '/knowledge/connections'],
  ['connector integrations', '/knowledge/integrations'],
  ['runtime search', '/knowledge/search'],
  ['Salesforce KB source', 'sources/salesforce'],
  ['ServiceNow KB source', 'sources/servicenow'],
];

const ROOT = join(process.cwd(), 'src');

function collectSourceFiles(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === '__tests__') continue;
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
}

describe('Genesys endpoint scope guardrail', () => {
  const files: string[] = [];
  collectSourceFiles(ROOT, files);

  it('finds production source files to scan', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN_PATTERNS)('contains no reference to %s (%s)', (_label, pattern) => {
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(pattern));
    expect(offenders, `Forbidden endpoint "${pattern}" found in: ${offenders.join(', ')}`).toEqual(
      [],
    );
  });

  it('every in-scope endpoint builder targets only /api/v2/knowledge/sources paths', () => {
    const paths = [
      GENESYS_ENDPOINTS.listSources(),
      GENESYS_ENDPOINTS.createSource(),
      GENESYS_ENDPOINTS.source('SID'),
      GENESYS_ENDPOINTS.sourceSynchronizations('SID'),
      GENESYS_ENDPOINTS.sourceSynchronization('SID', 'SYNC'),
      GENESYS_ENDPOINTS.uploads('SID', 'SYNC'),
      GENESYS_ENDPOINTS.orgSynchronizations(),
    ];
    for (const p of paths) {
      expect(p.startsWith('/api/v2/knowledge/sources')).toBe(true);
    }
  });
});
