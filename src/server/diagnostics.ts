import 'server-only';

import { isAppError } from '@/lib/errors';
import { getServerConfig } from './config';
import { getOrgSynchronizations, getSourceSynchronizations, listSources } from './genesys/client';
import { currentGenesysIdentity, getAccessToken } from './genesys/oauth';
import { logger } from './logger';
import { redactErrorMessage } from './redact';

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
  const genesys = await currentGenesysIdentity();
  const checks: ServerCheck[] = [];

  checks.push({
    key: 'access',
    label: 'App sign-in protection',
    detail: 'Protected pages require a signed-in user',
    group: 'Security',
    status: cfg.auth.configured ? 'ok' : 'fail',
  });

  checks.push({
    key: 'region',
    label: 'Genesys Cloud region',
    detail: genesys?.regionHost ?? cfg.genesys.regionHost ?? 'not connected',
    group: 'Connectivity',
    status: genesys?.regionHost || cfg.genesys.regionHost ? 'ok' : 'fail',
  });

  // OAuth token availability — never exposes the token itself.
  let tokenOk = false;
  if (genesys) {
    try {
      await getAccessToken();
      tokenOk = true;
    } catch (err) {
      tokenOk = false;
      logger.warn('diagnostics.token.failed', { detail: redactErrorMessage(err) });
    }
  }
  checks.push({
    key: 'token',
    label: 'Genesys user session',
    detail: 'Signed in with Genesys Cloud',
    group: 'Connectivity',
    status: genesys ? (tokenOk ? 'ok' : 'fail') : 'skip',
  });

  // Source list permission probe (only if discovery enabled + token works).
  let sampleSourceId: string | null = null;
  if (cfg.features.ENABLE_SOURCE_DISCOVERY && tokenOk) {
    let status: CheckStatus = 'ok';
    try {
      const sources = await listSources({ pageSize: 1 });
      sampleSourceId = sources[0]?.id ?? null;
    } catch (err) {
      status = isAppError(err) && err.code === 'GENESYS_PERMISSION_DENIED' ? 'fail' : 'warn';
      logger.warn('diagnostics.source_list.failed', {
        status,
        code: isAppError(err) ? err.code : undefined,
        detail: redactErrorMessage(err),
      });
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

  if (cfg.features.ENABLE_SOURCE_HISTORY && tokenOk && sampleSourceId) {
    let status: CheckStatus = 'ok';
    try {
      await getSourceSynchronizations(sampleSourceId);
    } catch (err) {
      status = isAppError(err) && err.code === 'GENESYS_PERMISSION_DENIED' ? 'fail' : 'warn';
      logger.warn('diagnostics.source_history.failed', {
        status,
        code: isAppError(err) ? err.code : undefined,
        detail: redactErrorMessage(err),
      });
    }
    checks.push({
      key: 'srchist',
      label: 'Source sync history',
      detail: 'GET …/synchronizations',
      group: 'Knowledge API',
      status,
    });
  } else {
    checks.push({
      key: 'srchist',
      label: 'Source sync history',
      detail: 'GET …/synchronizations',
      group: 'Knowledge API',
      status: 'skip',
    });
  }

  if (cfg.features.ENABLE_ORG_SYNC_DIAGNOSTICS && tokenOk) {
    let status: CheckStatus = 'ok';
    try {
      await getOrgSynchronizations();
    } catch (err) {
      status = isAppError(err) && err.code === 'GENESYS_PERMISSION_DENIED' ? 'fail' : 'warn';
      logger.warn('diagnostics.org_sync.failed', {
        status,
        code: isAppError(err) ? err.code : undefined,
        detail: redactErrorMessage(err),
      });
    }
    checks.push({
      key: 'orgsync',
      label: 'Org-wide sync diagnostics',
      detail: 'GET /sources/synchronizations',
      group: 'Knowledge API',
      status,
    });
  } else {
    checks.push({
      key: 'orgsync',
      label: 'Org-wide sync diagnostics',
      detail: 'GET /sources/synchronizations',
      group: 'Knowledge API',
      status: 'skip',
    });
  }

  return checks;
}
