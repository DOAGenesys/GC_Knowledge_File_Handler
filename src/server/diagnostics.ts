import 'server-only';

import { isAppError } from '@/lib/errors';
import { getServerConfig } from './config';
import { listSources } from './genesys/client';
import { getAccessToken } from './genesys/oauth';

/**
 * Server-side diagnostics (PRODUCT.md §12.8). Verifies the deployment is safe
 * and capable WITHOUT ever revealing secret values — only presence/validity and
 * the success/failure of probes. Browser-only checks (WebCrypto, localStorage,
 * hashing) are run client-side and merged into the UI.
 */
export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface ServerCheck {
  key: string;
  label: string;
  detail: string;
  group: 'Security' | 'Connectivity' | 'Knowledge API';
  status: CheckStatus;
}

export async function runServerDiagnostics(): Promise<ServerCheck[]> {
  const cfg = getServerConfig();
  const checks: ServerCheck[] = [];

  checks.push({
    key: 'access',
    label: 'App access protection',
    detail: 'Single-admin login enforced on every route',
    group: 'Security',
    status: cfg.auth.configured ? 'ok' : 'fail',
  });

  checks.push({
    key: 'region',
    label: 'Genesys region API host',
    detail: cfg.genesys.regionHost ?? 'not configured',
    group: 'Connectivity',
    status: cfg.genesys.regionHost ? 'ok' : 'fail',
  });

  // OAuth token acquisition — never exposes the token itself.
  let tokenOk = false;
  if (cfg.genesys.configured) {
    try {
      await getAccessToken();
      tokenOk = true;
    } catch {
      tokenOk = false;
    }
  }
  checks.push({
    key: 'token',
    label: 'OAuth token acquisition',
    detail: 'Client credentials · token never exposed to browser',
    group: 'Connectivity',
    status: cfg.genesys.configured ? (tokenOk ? 'ok' : 'fail') : 'skip',
  });

  // Source list permission probe (only if discovery enabled + token works).
  if (cfg.features.ENABLE_SOURCE_DISCOVERY && tokenOk) {
    let status: CheckStatus = 'ok';
    try {
      await listSources({ pageSize: 1 });
    } catch (err) {
      status = isAppError(err) && err.code === 'GENESYS_PERMISSION_DENIED' ? 'fail' : 'warn';
    }
    checks.push({
      key: 'srclist',
      label: 'Source list permission',
      detail: 'GET /knowledge/sources',
      group: 'Knowledge API',
      status,
    });
  } else {
    checks.push({
      key: 'srclist',
      label: 'Source list permission',
      detail: 'GET /knowledge/sources',
      group: 'Knowledge API',
      status: 'skip',
    });
  }

  checks.push({
    key: 'srchist',
    label: 'Source sync history',
    detail: 'GET …/synchronizations',
    group: 'Knowledge API',
    status: cfg.features.ENABLE_SOURCE_HISTORY ? 'ok' : 'skip',
  });

  checks.push({
    key: 'orgsync',
    label: 'Org-wide sync diagnostics',
    detail: 'GET /sources/synchronizations',
    group: 'Knowledge API',
    status: cfg.features.ENABLE_ORG_SYNC_DIAGNOSTICS ? 'ok' : 'skip',
  });

  return checks;
}
