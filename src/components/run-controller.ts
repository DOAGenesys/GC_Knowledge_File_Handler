'use client';

/**
 * Browser-side run controller. Subscribes to the workflow's Server-Sent Events
 * status stream. On each non-secret `ticketReady` signal it fetches a FRESH
 * pre-signed upload ticket from /api/sync/upload-ticket (URL/headers held in
 * memory only, never persisted), PUTs the in-memory File either directly to
 * Genesys or through the signed same-origin proxy fallback, then reports the
 * result to the upload-callback route.
 *
 * If the browser no longer holds a File (after refresh), the file is marked
 * NeedsReselect and the (non-secret) attempt id is retained so the user can
 * reselect and resume the same attempt. The controller never fabricates success
 * and never treats an unconfirmed completion as a successful run.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CSRF_COOKIE, CSRF_HEADER } from '@/server/auth/cookies';
import { api } from '@/lib/api-client';
import { useApp } from './app-context';
import type { ActiveRunFile, ActiveRunState, ActiveRunStatus, UiFileStatus } from './run-types';

interface Ticket {
  url: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  callbackToken: string;
  attemptId: string;
  proxyToken?: string;
}

interface TicketResponse {
  url?: string;
  headers?: Record<string, string>;
  method?: 'PUT' | 'POST';
  callbackToken: string;
  proxyToken?: string;
  ticketError?: string;
}

type UploadOutcome = 'Uploaded' | 'Failed' | 'CorsUnknown';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function uploadViaXhr(
  file: File,
  ticket: Ticket,
  onProgress: (fraction: number) => void,
): Promise<UploadOutcome> {
  return new Promise<UploadOutcome>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method, ticket.url, true);
    for (const [k, v] of Object.entries(ticket.headers)) {
      try {
        xhr.setRequestHeader(k, v);
      } catch {
        /* browser-forbidden header names are set automatically */
      }
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? 'Uploaded' : 'Failed');
    // A network/CORS error hides the real status — never assume success.
    xhr.onerror = () => resolve('CorsUnknown');
    xhr.ontimeout = () => resolve('Failed');
    xhr.onabort = () => resolve('Failed');
    xhr.send(file);
  });
}

function uploadViaProxy(
  file: File,
  ticket: Ticket,
  onProgress: (fraction: number) => void,
): Promise<UploadOutcome> {
  return new Promise<UploadOutcome>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', '/api/sync/proxy-upload', true);
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) xhr.setRequestHeader(CSRF_HEADER, csrf);
    if (!ticket.proxyToken) {
      resolve('Failed');
      return;
    }
    xhr.setRequestHeader('x-gkfsm-proxy-token', ticket.proxyToken);
    if (file.type) xhr.setRequestHeader('x-gkfsm-content-type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? 'Uploaded' : 'Failed');
    xhr.onerror = () => resolve('Failed');
    xhr.ontimeout = () => resolve('Failed');
    xhr.onabort = () => resolve('Failed');
    xhr.send(file);
  });
}

export interface RunController {
  resumePending: (localFileKey: string) => void;
}

const RunControllerContext = createContext<RunController | null>(null);

function useRunControllerInternal(): RunController {
  const { activeRun, setActiveRun, updateVault, toast, prefs, readiness } = useApp();
  const filesRef = useRef<ActiveRunFile[]>([]);
  filesRef.current = activeRun?.files ?? [];
  const uploadModeRef = useRef(prefs.uploadMode);
  uploadModeRef.current = prefs.uploadMode;
  const directUploadAvailableRef = useRef(false);
  directUploadAvailableRef.current = readiness?.directUploadConnectSrcConfigured ?? false;
  const localRunKeyRef = useRef<string | null>(null);
  localRunKeyRef.current = activeRun?.localRunKey ?? null;
  const sourceIdRef = useRef<string | null>(null);
  sourceIdRef.current = activeRun?.sourceId ?? null;
  const syncIdRef = useRef<string | null>(null);
  if (activeRun?.synchronizationId) syncIdRef.current = activeRun.synchronizationId;
  const recordedRef = useRef<string | null>(null);

  const runId = activeRun?.workflowRunId ?? null;

  const patchFile = useCallback(
    (key: string, patch: Partial<ActiveRunFile>) =>
      setActiveRun((run) =>
        run
          ? {
              ...run,
              files: run.files.map((f) => (f.localFileKey === key ? { ...f, ...patch } : f)),
            }
          : run,
      ),
    [setActiveRun],
  );

  const setStatus = useCallback(
    (status: ActiveRunStatus, extra: Partial<ActiveRunState> = {}) =>
      setActiveRun((run) => (run ? { ...run, status, ...extra } : run)),
    [setActiveRun],
  );

  const performUpload = useCallback(
    async (localFileKey: string, ticket: Ticket, file: File) => {
      patchFile(localFileKey, {
        status: 'Uploading',
        progress: 0,
        attemptId: ticket.attemptId,
        pendingTicketReady: null,
      });
      const useProxy =
        Boolean(ticket.proxyToken) &&
        (uploadModeRef.current === 'proxy' || !directUploadAvailableRef.current);
      const outcome = await (useProxy ? uploadViaProxy : uploadViaXhr)(file, ticket, (frac) =>
        patchFile(localFileKey, { progress: Math.round(frac * 100) }),
      );
      const uiStatus: UiFileStatus =
        outcome === 'Uploaded'
          ? 'Uploaded'
          : outcome === 'CorsUnknown'
            ? 'UploadResultUnknown'
            : 'UploadFailedRecoverable';
      const prevAttempts =
        filesRef.current.find((f) => f.localFileKey === localFileKey)?.attempts ?? 0;
      patchFile(localFileKey, {
        status: uiStatus,
        progress: outcome === 'Uploaded' ? 100 : 0,
        attempts: prevAttempts + 1,
      });
      const localRunKey = localRunKeyRef.current;
      if (!localRunKey) return;
      try {
        await api.post('/api/sync/upload-callback', {
          localRunKey,
          localFileKey,
          attemptId: ticket.attemptId,
          callbackToken: ticket.callbackToken,
          status: outcome,
        });
      } catch {
        /* the workflow tolerates a missing callback (waits / NeedsUserAction) */
      }
    },
    [patchFile],
  );

  /** Fetch a fresh on-demand ticket for a file, then upload it. */
  const requestTicketAndUpload = useCallback(
    async (localFileKey: string, attemptId: string, file: File) => {
      const f = filesRef.current.find((x) => x.localFileKey === localFileKey);
      const sourceId = sourceIdRef.current;
      const synchronizationId = syncIdRef.current;
      const localRunKey = localRunKeyRef.current;
      if (!f || !sourceId || !synchronizationId || !localRunKey) {
        patchFile(localFileKey, { status: 'UploadFailedRecoverable' });
        return;
      }
      patchFile(localFileKey, { pendingTicketReady: null });
      let resp: TicketResponse;
      try {
        resp = await api.post<TicketResponse>('/api/sync/upload-ticket', {
          sourceId,
          synchronizationId,
          localRunKey,
          localFileKey,
          attemptId,
          fileName: f.uploadFileName,
          contentMd5: f.contentMd5Base64 ?? undefined,
          contentType: f.contentType || undefined,
          contentLength: f.contentLength,
        });
      } catch {
        patchFile(localFileKey, {
          status: 'UploadFailedRecoverable',
          attempts: (f.attempts ?? 0) + 1,
        });
        return;
      }
      if (resp.url) {
        await performUpload(
          localFileKey,
          {
            url: resp.url,
            method: resp.method ?? 'PUT',
            headers: resp.headers ?? {},
            callbackToken: resp.callbackToken,
            attemptId,
            proxyToken: resp.proxyToken,
          },
          file,
        );
      } else {
        // Server could not issue the ticket — report Failed so the engine retries.
        patchFile(localFileKey, {
          status: 'UploadFailedRecoverable',
          attempts: (f.attempts ?? 0) + 1,
        });
        try {
          await api.post('/api/sync/upload-callback', {
            localRunKey,
            localFileKey,
            attemptId,
            callbackToken: resp.callbackToken,
            status: 'Failed',
          });
        } catch {
          /* tolerated */
        }
      }
    },
    [patchFile, performUpload],
  );

  const requestRef = useRef(requestTicketAndUpload);
  requestRef.current = requestTicketAndUpload;

  const resumePending = useCallback((localFileKey: string) => {
    const entry = filesRef.current.find((f) => f.localFileKey === localFileKey);
    if (entry?.file && entry.pendingTicketReady) {
      void requestRef.current(localFileKey, entry.pendingTicketReady.attemptId, entry.file);
    }
  }, []);

  // SSE subscription.
  useEffect(() => {
    if (!runId) return;
    const abort = new AbortController();

    const handleTicketReady = (msg: Record<string, unknown>) => {
      const localFileKey = String(msg.localFileKey);
      const attemptId = String(msg.attemptId);
      const file = filesRef.current.find((f) => f.localFileKey === localFileKey)?.file ?? null;
      if (!file) {
        patchFile(localFileKey, { status: 'NeedsReselect', pendingTicketReady: { attemptId } });
        setStatus('NeedsUserAction');
        return;
      }
      void requestRef.current(localFileKey, attemptId, file);
    };

    const handleMessage = (raw: string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      switch (msg.kind) {
        case 'ticketReady':
          handleTicketReady(msg);
          break;
        case 'sync':
          syncIdRef.current = String(msg.synchronizationId);
          setStatus('Running', {
            synchronizationId: String(msg.synchronizationId),
            currentStep: 'upload',
          });
          break;
        case 'state':
          setActiveRun((run) =>
            run ? { ...run, currentStep: (msg.step as string) ?? run.currentStep } : run,
          );
          break;
        case 'final': {
          const outcome = String(msg.outcome);
          const errorSummary = (msg.errorSummary as string) ?? null;
          let status: ActiveRunStatus =
            outcome === 'Completed'
              ? 'Completed'
              : outcome === 'Cancelled'
                ? 'Cancelled'
                : outcome === 'FailedFatal'
                  ? 'FailedFatal'
                  : 'NeedsUserAction';
          // The workflow downgrades an unconfirmed completion to NeedsUserAction
          // and tags it COMPLETION_UNKNOWN — surface that precisely (never as a
          // successful run).
          if (status === 'NeedsUserAction' && errorSummary === 'COMPLETION_UNKNOWN')
            status = 'CompletionUnknown';
          setStatus(status, {
            synchronizationId: (msg.synchronizationId as string) ?? null,
            lastRemoteStatus: (msg.lastRemoteStatus as string) ?? null,
            errorSummary,
          });
          break;
        }
        default:
          break;
      }
    };

    (async () => {
      try {
        const res = await fetch(`/api/sync/status?runId=${encodeURIComponent(runId)}`, {
          credentials: 'same-origin',
          signal: abort.signal,
          headers: { Accept: 'text/event-stream' },
        });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (line.startsWith('data:')) handleMessage(line.slice(5).trim());
            }
          }
        }
      } catch {
        /* aborted or stream closed */
      }
    })();

    return () => abort.abort();
  }, [runId, patchFile, setStatus, setActiveRun]);

  // Persist a redacted run summary to the vault on each terminal/paused status.
  // Dedupe on run key + status so a genuine NeedsUserAction → Completed
  // transition (after reselect-resume) is re-persisted, while an unchanged
  // status is not written twice.
  useEffect(() => {
    if (!activeRun || !activeRun.workflowRunId) return;
    const terminal: ActiveRunStatus[] = [
      'Completed',
      'Cancelled',
      'NeedsUserAction',
      'CompletionUnknown',
      'FailedFatal',
    ];
    if (!terminal.includes(activeRun.status)) return;
    const sig = `${activeRun.localRunKey}:${activeRun.status}`;
    if (recordedRef.current === sig) return;
    recordedRef.current = sig;

    const r = activeRun;
    const uploaded = r.files.filter((f) => f.status === 'Uploaded').length;
    void updateVault((d) => {
      const summary = {
        localRunKey: r.localRunKey,
        workflowRunId: r.workflowRunId,
        sourceId: r.sourceId,
        sourceName: r.sourceName,
        synchronizationId: r.synchronizationId,
        syncType: r.syncType,
        status: r.status as never,
        createdAt: r.startedAt,
        updatedAt: Date.now(),
        completedAt: r.status === 'Completed' ? Date.now() : null,
        cancelledAt: r.status === 'Cancelled' ? Date.now() : null,
        lastRemoteStatus: r.lastRemoteStatus,
        lastRemoteStatusCheckedAt: r.lastRemoteCheckedAt,
        fileCount: r.files.length,
        uploadedCount: uploaded,
        failedCount: r.files.filter((f) => f.status === 'UploadFailedRecoverable').length,
        needsUserActionCount: r.files.filter(
          (f) => f.status === 'UploadResultUnknown' || f.status === 'NeedsReselect',
        ).length,
        errorSummary: r.errorSummary,
        files: [],
      };
      const existing = d.syncRuns.find((x) => x.localRunKey === r.localRunKey);
      if (existing) Object.assign(existing, summary);
      else d.syncRuns.unshift(summary);
    }).then(() => {
      // Success toast only on a genuinely confirmed completion.
      if (r.status === 'Completed') {
        toast({
          tone: 'success',
          title: 'Sync completed',
          body: `${uploaded} files synchronized to ${r.sourceName}`,
        });
      }
    });
  }, [activeRun, updateVault, toast]);

  return { resumePending };
}

export function RunControllerProvider({ children }: { children: ReactNode }) {
  const controller = useRunControllerInternal();
  return createElement(RunControllerContext.Provider, { value: controller }, children);
}

export function useRunController(): RunController {
  const controller = useContext(RunControllerContext);
  if (!controller) throw new Error('useRunController must be used within <RunControllerProvider>');
  return controller;
}
