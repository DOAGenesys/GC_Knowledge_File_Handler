'use client';

/**
 * Sources screen — local registry + remote discovery, validation, activity,
 * danger zone. The vault holds the local registry (IDs + friendly names);
 * discovery, validation and status come live from Genesys via api.* calls.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/app-context';
import {
  Badge,
  Btn,
  Callout,
  Card,
  ConfirmModal,
  CopyId,
  DetailField,
  Empty,
  Field,
  IconBtn,
  Modal,
  Segmented,
  Spinner,
  StatusBadge,
  Tip,
  Toggle,
} from '@/components/ui';
import { Icon } from '@/components/icon';
import { api, ApiError } from '@/lib/api-client';
import { fmtDate, fmtDateFull, relTime } from '@/lib/format';
import { uuid } from '@/lib/ids';
import type {
  GenesysSourceDetail,
  GenesysSynchronizationSummary,
  RemoteSourceStatus,
  SourceRecord,
  SourceType,
} from '@/lib/types';

/**
 * The validated source detail returned by the API carries the normalized
 * compatibility flag in addition to the base DTO fields.
 */
type ValidatedSource = GenesysSourceDetail & { isCompatibleFileUploadSource?: boolean };

/* ------------------------------------------------------------------ */
/* Display metadata                                                   */
/* ------------------------------------------------------------------ */

interface TypeMeta {
  label: string;
  icon: string;
  compatible: boolean;
}

const SOURCE_TYPE_META: Record<string, TypeMeta> = {
  FileUpload: { label: 'FileUpload', icon: 'uploadCloud', compatible: true },
  Web: { label: 'Web', icon: 'globe', compatible: false },
  SharePoint: { label: 'SharePoint', icon: 'cloud', compatible: false },
  Salesforce: { label: 'Salesforce', icon: 'cloud', compatible: false },
  ServiceNow: { label: 'ServiceNow', icon: 'server', compatible: false },
};

function typeMeta(type: string | undefined): TypeMeta {
  return (
    SOURCE_TYPE_META[type ?? ''] ?? {
      label: type || 'Unknown',
      icon: 'database',
      compatible: false,
    }
  );
}

interface RemoteStatusMeta {
  tone: string;
  label: string;
}

const REMOTE_STATUS_META: Record<string, RemoteStatusMeta> = {
  Active: { tone: 'success', label: 'Active' },
  Idle: { tone: 'neutral', label: 'Idle' },
  Syncing: { tone: 'accent', label: 'Syncing' },
  Error: { tone: 'danger', label: 'Error' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ */
/* Remote-detail normalization                                        */
/* ------------------------------------------------------------------ */

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function isCompatible(detail: ValidatedSource): boolean {
  // Prefer the API's explicit flag; fall back to the source type otherwise.
  return detail.isCompatibleFileUploadSource ?? typeMeta(detail.type).compatible;
}

/* ------------------------------------------------------------------ */
/* Small presentational helper                                        */
/* ------------------------------------------------------------------ */

function RemoteStatusPill({ status }: { status: string | null | undefined }) {
  if (!status)
    return (
      <Badge tone="neutral" icon="help">
        Not validated
      </Badge>
    );
  const m = REMOTE_STATUS_META[status] ?? { tone: 'neutral', label: status };
  return (
    <span className={`badge badge-${m.tone}`}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor' }} />
      {m.label}
    </span>
  );
}

/* ================================================================== */
/* Page                                                               */
/* ================================================================== */

export default function SourcesPage() {
  const { sources, features, updateVault, toast } = useApp();
  const router = useRouter();

  const [view, setView] = useState<'registry' | 'discovery'>('registry');
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showExisting, setShowExisting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SourceRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SourceRecord | null>(null);
  const [detail, setDetail] = useState<SourceRecord | null>(null);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});

  const visible = sources.filter((s) => (showArchived ? true : !s.archived));

  const refreshStatus = async (key: string) => {
    const rec = sources.find((s) => s.localSourceKey === key);
    if (!rec) return;
    setRefreshing((r) => ({ ...r, [key]: true }));
    try {
      const { source } = await api.get<{ source: ValidatedSource }>(
        `/api/sources/${encodeURIComponent(rec.sourceId)}`,
      );
      const validatedAt = Date.now();
      const status = (source.status as RemoteSourceStatus | undefined) ?? null;
      const compatible = isCompatible(source);
      await updateVault((draft) => {
        const target = draft.sourceRegistry.find((x) => x.localSourceKey === key);
        if (target) {
          target.lastValidatedAt = validatedAt;
          target.remoteStatus = status;
          target.isCompatibleFileUploadSource = compatible;
          target.remoteName = source.name ?? target.remoteName;
          target.localOnly = false;
        }
      });
      setDetail((d) =>
        d && d.localSourceKey === key
          ? {
              ...d,
              lastValidatedAt: validatedAt,
              remoteStatus: status,
              isCompatibleFileUploadSource: compatible,
            }
          : d,
      );
      toast({ tone: 'success', title: 'Source validated', body: 'Status refreshed from Genesys.' });
    } catch (err) {
      const e = err as ApiError;
      toast({ tone: 'danger', title: 'Validation failed', body: e.message });
    } finally {
      setRefreshing((r) => ({ ...r, [key]: false }));
    }
  };

  const doRename = async (target: SourceRecord, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await updateVault((draft) => {
      const t = draft.sourceRegistry.find((x) => x.localSourceKey === target.localSourceKey);
      if (t) t.displayName = trimmed;
    });
    setDetail((d) =>
      d && d.localSourceKey === target.localSourceKey ? { ...d, displayName: trimmed } : d,
    );
    setRenameTarget(null);
    toast({ tone: 'success', title: 'Renamed locally' });
  };

  const doArchive = async (target: SourceRecord) => {
    const wasArchived = target.archived;
    await updateVault((draft) => {
      const t = draft.sourceRegistry.find((x) => x.localSourceKey === target.localSourceKey);
      if (t) t.archived = !t.archived;
    });
    setArchiveTarget(null);
    toast({
      tone: 'info',
      title: wasArchived ? 'Source restored' : 'Source archived',
      body: 'Local reference only — nothing changes in Genesys.',
    });
  };

  const addSourceRecord = async (rec: SourceRecord) => {
    await updateVault((draft) => {
      draft.sourceRegistry = [
        rec,
        ...draft.sourceRegistry.filter((x) => x.sourceId !== rec.sourceId),
      ];
    });
  };

  const removeSourceRecord = async (key: string) => {
    await updateVault((draft) => {
      draft.sourceRegistry = draft.sourceRegistry.filter((x) => x.localSourceKey !== key);
    });
  };

  const tabs: { value: 'registry' | 'discovery'; label: string }[] = [
    { value: 'registry', label: 'Your registry' },
  ];
  if (features.ENABLE_SOURCE_DISCOVERY) tabs.push({ value: 'discovery', label: 'Discover remote' });

  return (
    <div className="page">
      <div
        className="page-head between"
        style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="page-title">Sources</div>
          <div className="page-desc">
            Your local registry of Genesys Knowledge Fabric{' '}
            <span className="mono" style={{ fontSize: 13 }}>
              FileUpload
            </span>{' '}
            sources. IDs live only in your encrypted vault — discovery and status come live from
            Genesys.
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Btn variant="default" icon="link" onClick={() => setShowExisting(true)}>
            Add by ID
          </Btn>
          {features.ENABLE_SOURCE_CREATION && (
            <Btn variant="primary" icon="plus" onClick={() => setShowCreate(true)}>
              Create source
            </Btn>
          )}
        </div>
      </div>

      {tabs.length > 1 && (
        <div className="between" style={{ marginBottom: 18 }}>
          <Segmented value={view} onChange={setView} options={tabs} accent />
          {view === 'registry' && (
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <Toggle checked={showArchived} onChange={setShowArchived} label="Show archived" />
              <span className="faint" style={{ fontSize: 12.5 }}>
                Show archived
              </span>
            </label>
          )}
        </div>
      )}

      {view === 'registry' ? (
        <div className="grid" style={{ gap: 16 }}>
          {visible.map((s) => (
            <SourceCard
              key={s.localSourceKey}
              s={s}
              refreshing={!!refreshing[s.localSourceKey]}
              onRefresh={() => void refreshStatus(s.localSourceKey)}
              onRename={() => setRenameTarget(s)}
              onArchive={() => setArchiveTarget(s)}
              onDetail={() => setDetail(s)}
              onSync={() => router.push('/new')}
            />
          ))}
          {visible.length === 0 && (
            <Card>
              <Empty icon="database" title="No sources in your registry">
                Discover remote sources, create a new FileUpload source, or add one by ID.
              </Empty>
            </Card>
          )}
        </div>
      ) : (
        <DiscoveryPanel registry={sources} onImport={addSourceRecord} />
      )}

      {features.ENABLE_SOURCE_CREATION && (
        <CreateSourceModal
          open={showCreate}
          existing={sources}
          onClose={() => setShowCreate(false)}
          onCreated={async (rec) => {
            await addSourceRecord(rec);
            setShowCreate(false);
            toast({
              tone: 'success',
              title: 'Source created',
              body: `${rec.displayName} · validated & saved to vault`,
            });
          }}
        />
      )}

      <ExistingSourceModal
        open={showExisting}
        onClose={() => setShowExisting(false)}
        onAdd={async (rec) => {
          await addSourceRecord(rec);
          setShowExisting(false);
          toast({
            tone: 'success',
            title: 'Source added',
            body: 'Validated reference saved to your encrypted vault.',
          });
        }}
      />

      <RenameModal target={renameTarget} onClose={() => setRenameTarget(null)} onSave={doRename} />

      <ConfirmModal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && void doArchive(archiveTarget)}
        tone="warning"
        icon="archive"
        title={archiveTarget?.archived ? 'Restore source?' : 'Archive source?'}
        body={
          <>
            This affects your <strong>local reference only</strong> — nothing is deleted in Genesys.
            You can restore it anytime.
          </>
        }
        confirmLabel={archiveTarget?.archived ? 'Restore' : 'Archive'}
      />

      <SourceDetailDrawer
        source={detail}
        onClose={() => setDetail(null)}
        onRefresh={(key) => void refreshStatus(key)}
        onUpdated={(name) => {
          if (!detail) return;
          void (async () => {
            await updateVault((draft) => {
              const t = draft.sourceRegistry.find(
                (x) => x.localSourceKey === detail.localSourceKey,
              );
              if (t) {
                t.displayName = name;
                t.remoteName = name;
                t.lastValidatedAt = Date.now();
              }
            });
            setDetail((d) => (d ? { ...d, displayName: name, remoteName: name } : d));
            toast({ tone: 'success', title: 'Source updated', body: 'Name changed in Genesys.' });
          })();
        }}
        onDeleted={async (key) => {
          await removeSourceRecord(key);
          setDetail(null);
          toast({
            tone: 'danger',
            title: 'Source deleted',
            body: 'Delete confirmed in Genesys · local reference removed.',
          });
        }}
      />
    </div>
  );
}

/* ================================================================== */
/* Registry card                                                      */
/* ================================================================== */

function SourceCard({
  s,
  refreshing,
  onRefresh,
  onRename,
  onArchive,
  onDetail,
  onSync,
}: {
  s: SourceRecord;
  refreshing: boolean;
  onRefresh: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDetail: () => void;
  onSync: () => void;
}) {
  const tm = typeMeta(s.sourceType);
  return (
    <Card style={{ opacity: s.archived ? 0.62 : 1 }}>
      <div className="card-pad between" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 11,
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            <Icon name={tm.icon} size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={onDetail}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                {s.displayName}
              </button>
              <RemoteStatusPill status={s.remoteStatus} />
              {s.createdByApp ? (
                <Badge tone="neutral">Created by app</Badge>
              ) : (
                <Badge tone="info" icon="link">
                  Imported
                </Badge>
              )}
              {s.archived && (
                <Badge tone="neutral" icon="archive">
                  Archived
                </Badge>
              )}
            </div>
            <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <CopyId value={s.sourceId} label="sourceId" truncate={24} />
              {s.lastValidatedAt ? (
                <span className="faint" style={{ fontSize: 12 }}>
                  Validated {relTime(s.lastValidatedAt)}
                </span>
              ) : (
                <span className="faint" style={{ fontSize: 12 }}>
                  Never validated
                </span>
              )}
            </div>
            {s.localOnly && (
              <div style={{ marginTop: 12 }}>
                <Callout tone="warning" icon="alert">
                  Local-only reference. If this vault is lost, the friendly name can&apos;t be
                  rediscovered — only the ID exists in Genesys.
                </Callout>
              </div>
            )}
            {s.lastSync && (
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <span className="faint" style={{ fontSize: 12 }}>
                  Last sync:
                </span>
                <StatusBadge status={s.lastSync.status} />
                <span className="faint" style={{ fontSize: 12 }}>
                  {s.lastSync.files} files · {relTime(s.lastSync.when)}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {!s.archived && (
            <Btn variant="primary" size="sm" icon="sync" onClick={onSync}>
              Sync
            </Btn>
          )}
          <Tip text="Refresh status from Genesys">
            <IconBtn
              icon={refreshing ? 'loader' : 'refresh'}
              size={15}
              label="Refresh status"
              className={refreshing ? 'spin' : ''}
              disabled={refreshing}
              onClick={onRefresh}
            />
          </Tip>
          <Tip text="Activity & details">
            <IconBtn icon="activity" size={15} label="Details" onClick={onDetail} />
          </Tip>
          <IconBtn icon="edit" size={15} label="Rename" onClick={onRename} />
          <IconBtn icon="archive" size={15} label="Archive" onClick={onArchive} />
        </div>
      </div>
    </Card>
  );
}

/* ================================================================== */
/* Discovery panel                                                    */
/* ================================================================== */

interface DiscoveryRow {
  id: string;
  name: string;
  type: string;
  status?: string;
  documentCount?: number | null;
  dateLastSync?: string | null;
  isCompatibleFileUploadSource: boolean;
}

function DiscoveryPanel({
  registry,
  onImport,
}: {
  registry: SourceRecord[];
  onImport: (rec: SourceRecord) => Promise<void>;
}) {
  const { toast } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<DiscoveryRow[]>([]);
  const [compatOnly, setCompatOnly] = useState(true);
  const [importing, setImporting] = useState<Record<string, boolean>>({});

  const importedIds = new Set(registry.map((r) => r.sourceId));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ sources: DiscoveryRow[] }>('/api/sources');
      setList(res.sources ?? []);
    } catch (err) {
      const e = err as ApiError;
      setError(e.message);
      toast({ tone: 'danger', title: 'Could not list sources', body: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = list.filter((r) => (compatOnly ? r.isCompatibleFileUploadSource : true));

  const doImport = async (r: DiscoveryRow) => {
    setImporting((m) => ({ ...m, [r.id]: true }));
    try {
      const rec: SourceRecord = {
        localSourceKey: uuid(),
        sourceId: r.id,
        displayName: r.name,
        sourceType: (r.type as SourceType) ?? 'FileUpload',
        remoteName: r.name,
        remoteStatus: (r.status as RemoteSourceStatus | undefined) ?? null,
        isCompatibleFileUploadSource: r.isCompatibleFileUploadSource,
        createdByApp: false,
        dateAddedToVault: Date.now(),
        lastValidatedAt: Date.now(),
        lastRemoteSyncAt: parseDate(r.dateLastSync),
        lastUsedAt: null,
        lastSyncRunId: null,
        archived: false,
        lastSync: null,
      };
      await onImport(rec);
      toast({ tone: 'success', title: 'Source imported', body: `${r.name} · saved to your vault` });
    } catch (err) {
      const e = err as ApiError;
      toast({ tone: 'danger', title: 'Import failed', body: e.message });
    } finally {
      setImporting((m) => ({ ...m, [r.id]: false }));
    }
  };

  return (
    <Card>
      <div className="card-head">
        <Icon name="globe" size={16} style={{ color: 'var(--accent)' }} />
        <h3>Remote Knowledge sources</h3>
        <span className="sub mono">GET /knowledge/sources</span>
        <div className="row" style={{ marginLeft: 'auto', gap: 10 }}>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <Toggle checked={compatOnly} onChange={setCompatOnly} label="Compatible only" />
            <span className="faint" style={{ fontSize: 12.5 }}>
              Compatible only
            </span>
          </label>
          <Btn
            variant="default"
            size="sm"
            icon={loading ? undefined : 'refresh'}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner size={14} /> Listing…
              </>
            ) : (
              'Refresh'
            )}
          </Btn>
        </div>
      </div>
      {loading ? (
        <div className="empty">
          <Spinner size={22} />
          <div style={{ marginTop: 12 }} className="faint">
            Listing accessible sources…
          </div>
        </div>
      ) : error ? (
        <div style={{ padding: '0 20px 18px' }}>
          <Callout tone="danger" icon="alertCircle" title="Could not list remote sources">
            {error}
          </Callout>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <Empty icon="globe" title="No accessible sources">
            {compatOnly
              ? 'No compatible FileUpload sources were returned. Turn off “Compatible only” to view other types.'
              : 'Genesys returned no sources your credentials can access.'}
          </Empty>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '36%' }}>Source</th>
                <th>Type</th>
                <th>Status</th>
                <th>Documents</th>
                <th>Last sync</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tm = typeMeta(r.type);
                const compatible = r.isCompatibleFileUploadSource;
                const imported = importedIds.has(r.id);
                const last = parseDate(r.dateLastSync);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="row" style={{ gap: 11 }}>
                        <span
                          style={{
                            color: compatible ? 'var(--accent)' : 'var(--text-faint)',
                            flexShrink: 0,
                          }}
                        >
                          <Icon name={tm.icon} size={18} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {r.name}
                          </div>
                          <div className="faint mono" style={{ fontSize: 11, marginTop: 2 }}>
                            {r.id.slice(0, 18)}…
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {compatible ? (
                        <Badge tone="success" icon="check">
                          {tm.label}
                        </Badge>
                      ) : (
                        <Tip text="Not a FileUpload source — managed elsewhere">
                          <Badge tone="neutral">{tm.label}</Badge>
                        </Tip>
                      )}
                    </td>
                    <td>
                      <RemoteStatusPill status={r.status} />
                    </td>
                    <td className="tnum mono" style={{ fontSize: 12 }}>
                      {r.documentCount != null ? r.documentCount.toLocaleString() : '—'}
                    </td>
                    <td className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {last ? relTime(last) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {imported ? (
                        <Badge tone="neutral" icon="check">
                          In registry
                        </Badge>
                      ) : compatible ? (
                        <Btn
                          variant="default"
                          size="sm"
                          icon={importing[r.id] ? undefined : 'download'}
                          disabled={!!importing[r.id]}
                          onClick={() => void doImport(r)}
                        >
                          {importing[r.id] ? <Spinner size={14} /> : 'Import'}
                        </Btn>
                      ) : (
                        <Tip text="Only FileUpload sources can be managed here">
                          <span>
                            <Btn variant="ghost" size="sm" disabled>
                              Unsupported
                            </Btn>
                          </span>
                        </Tip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: '0 20px 18px' }}>
        <Callout tone="info" icon="shield">
          Sources are not imported automatically — you choose which to add. Non-FileUpload sources
          are read-only here and can&apos;t be synced.
        </Callout>
      </div>
    </Card>
  );
}

/* ================================================================== */
/* Source detail drawer (activity + danger zone)                      */
/* ================================================================== */

function SourceDetailDrawer({
  source,
  onClose,
  onRefresh,
  onUpdated,
  onDeleted,
}: {
  source: SourceRecord | null;
  onClose: () => void;
  onRefresh: (key: string) => void;
  onUpdated: (name: string) => void;
  onDeleted: (key: string) => Promise<void>;
}) {
  const { features, activeRun, toast } = useApp();
  const [activity, setActivity] = useState<GenesysSynchronizationSummary[]>([]);
  const [activityState, setActivityState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [activityError, setActivityError] = useState<string | null>(null);
  const [selSync, setSelSync] = useState<GenesysSynchronizationSummary | null>(null);
  const [editName, setEditName] = useState('');
  const [editing, setEditing] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const sourceId = source?.sourceId ?? null;

  useEffect(() => {
    setSelSync(null);
    setEditing(false);
    setShowDelete(false);
    if (source) setEditName(source.displayName);
  }, [source]);

  useEffect(() => {
    if (!source || !features.ENABLE_SOURCE_HISTORY) {
      setActivity([]);
      setActivityState('idle');
      return;
    }
    let active = true;
    setActivityState('loading');
    setActivityError(null);
    (async () => {
      try {
        const res = await api.get<{ synchronizations: GenesysSynchronizationSummary[] }>(
          `/api/sources/${encodeURIComponent(source.sourceId)}/synchronizations`,
        );
        if (active) {
          setActivity(res.synchronizations ?? []);
          setActivityState('idle');
        }
      } catch (err) {
        if (active) {
          setActivityError((err as ApiError).message);
          setActivityState('error');
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, features.ENABLE_SOURCE_HISTORY]);

  if (!source) return null;
  const tm = typeMeta(source.sourceType);
  const dangerOn = features.ENABLE_SOURCE_UPDATE || features.ENABLE_SOURCE_DELETE;

  const selectSync = async (row: GenesysSynchronizationSummary) => {
    setSelSync(row);
    try {
      const res = await api.get<{ synchronization: GenesysSynchronizationSummary }>(
        `/api/sources/${encodeURIComponent(source.sourceId)}/synchronizations/${encodeURIComponent(row.id)}`,
      );
      if (res.synchronization) setSelSync(res.synchronization);
    } catch (err) {
      toast({
        tone: 'danger',
        title: 'Could not load synchronization',
        body: (err as ApiError).message,
      });
    }
  };

  const saveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      await api.put<{ source: GenesysSourceDetail }>(
        `/api/sources/${encodeURIComponent(source.sourceId)}`,
        {
          name: trimmed,
        },
      );
      onUpdated(trimmed);
      setEditing(false);
    } catch (err) {
      toast({ tone: 'danger', title: 'Update failed', body: (err as ApiError).message });
    } finally {
      setSavingName(false);
    }
  };

  return (
    <>
      <Modal open={!!source} onClose={onClose} wide>
        <div className="card-head" style={{ padding: '18px 24px' }}>
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <Icon name={tm.icon} size={18} style={{ color: 'var(--accent)' }} />
            <h3
              style={{
                fontSize: 16,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {source.displayName}
            </h3>
            <RemoteStatusPill status={source.remoteStatus} />
          </div>
          <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
            <Btn
              variant="default"
              size="sm"
              icon="refresh"
              onClick={() => onRefresh(source.localSourceKey)}
            >
              Refresh
            </Btn>
            <IconBtn icon="x" size={16} label="Close" onClick={onClose} />
          </div>
        </div>
        <div className="modal-body scroll" style={{ maxHeight: '66vh', overflowY: 'auto' }}>
          <div className="grid g2" style={{ gap: 14 }}>
            <DetailField label="Source ID" value={<CopyId value={source.sourceId} />} />
            <DetailField
              label="Type"
              value={
                tm.compatible ? (
                  <Badge tone="success" icon="check">
                    {tm.label}
                  </Badge>
                ) : (
                  <Badge tone="neutral">{tm.label}</Badge>
                )
              }
            />
            <DetailField
              label="Remote status"
              value={<RemoteStatusPill status={source.remoteStatus} />}
            />
            <DetailField
              label="Compatible for sync"
              value={
                source.isCompatibleFileUploadSource ? (
                  <span className="row" style={{ gap: 6, color: 'var(--success)' }}>
                    <Icon name="check" size={15} />
                    Yes
                  </span>
                ) : (
                  <span className="row" style={{ gap: 6, color: 'var(--danger)' }}>
                    <Icon name="x" size={15} />
                    No
                  </span>
                )
              }
            />
            <DetailField
              label="Last validated"
              value={source.lastValidatedAt ? fmtDateFull(source.lastValidatedAt) : 'Never'}
            />
            <DetailField
              label="Last remote sync"
              value={source.lastRemoteSyncAt ? fmtDateFull(source.lastRemoteSyncAt) : '—'}
            />
          </div>

          {features.ENABLE_SOURCE_HISTORY ? (
            <div style={{ marginTop: 22 }}>
              <div className="between" style={{ marginBottom: 10 }}>
                <span className="row" style={{ gap: 8, fontWeight: 700, fontSize: 13.5 }}>
                  <Icon name="history" size={15} style={{ color: 'var(--text-muted)' }} />{' '}
                  Synchronization activity
                </span>
                <span className="sub mono faint" style={{ fontSize: 11 }}>
                  GET …/synchronizations
                </span>
              </div>
              <Card style={{ boxShadow: 'none', borderColor: 'var(--border)' }}>
                {activityState === 'loading' ? (
                  <div className="empty">
                    <Spinner size={20} />
                    <div style={{ marginTop: 10 }} className="faint">
                      Reading activity…
                    </div>
                  </div>
                ) : activityState === 'error' ? (
                  <div style={{ padding: 16 }}>
                    <Callout tone="danger" icon="alertCircle" title="Could not load activity">
                      {activityError}
                    </Callout>
                  </div>
                ) : activity.length === 0 ? (
                  <div className="empty">
                    <Empty icon="history" title="No synchronizations yet">
                      This source has no recorded synchronization activity.
                    </Empty>
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Files</th>
                        <th>When</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {activity.map((a) => (
                        <tr
                          key={a.id}
                          style={{
                            cursor: 'pointer',
                            background: selSync?.id === a.id ? 'var(--surface-3)' : '',
                          }}
                          onClick={() => void selectSync(a)}
                        >
                          <td>
                            <Badge tone="neutral">{a.type}</Badge>
                          </td>
                          <td>
                            <StatusBadge status={a.status} />
                          </td>
                          <td className="mono tnum" style={{ fontSize: 12 }}>
                            {a.uploadedCount ?? 0}/{a.fileCount ?? 0}
                          </td>
                          <td className="faint" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                            {a.dateCreated ? fmtDate(a.dateCreated) : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Icon name="chevR" size={14} className="faint" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
              {selSync && (
                <div className="fade-in" style={{ marginTop: 12 }}>
                  <Card pad style={{ borderColor: 'var(--accent-line)' }}>
                    <div className="between" style={{ marginBottom: 12 }}>
                      <span className="row" style={{ gap: 8, fontWeight: 650, fontSize: 13 }}>
                        <Icon name="zap" size={14} style={{ color: 'var(--accent)' }} />{' '}
                        Synchronization detail
                      </span>
                      <span className="sub mono faint" style={{ fontSize: 11 }}>
                        GET …/{'{syncId}'}
                      </span>
                    </div>
                    <div className="grid g2" style={{ gap: 12 }}>
                      <DetailField
                        label="Synchronization ID"
                        value={<CopyId value={selSync.id} truncate={22} />}
                      />
                      <DetailField
                        label="Authoritative status"
                        value={<StatusBadge status={selSync.status} />}
                      />
                      <DetailField label="Type" value={selSync.type} />
                      <DetailField
                        label="Files"
                        value={`${selSync.uploadedCount ?? 0} / ${selSync.fileCount ?? 0}`}
                      />
                      <DetailField
                        label="Started"
                        value={selSync.dateCreated ? fmtDateFull(selSync.dateCreated) : '—'}
                      />
                      <DetailField
                        label="Completed"
                        value={selSync.dateCompleted ? fmtDateFull(selSync.dateCompleted) : '—'}
                      />
                    </div>
                  </Card>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
              <Callout tone="info" icon="info">
                Source sync history is disabled. Enable{' '}
                <span className="mono">ENABLE_SOURCE_HISTORY</span> in Settings to read remote
                activity.
              </Callout>
            </div>
          )}

          {dangerOn && (
            <div style={{ marginTop: 22 }}>
              <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                <Icon name="alert" size={15} style={{ color: 'var(--danger)' }} />
                <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--danger)' }}>
                  Danger zone
                </span>
              </div>
              <Card
                pad
                style={{ borderColor: 'var(--danger-line)', background: 'var(--danger-soft)' }}
              >
                {features.ENABLE_SOURCE_UPDATE && (
                  <div
                    className="between"
                    style={{
                      paddingBottom: features.ENABLE_SOURCE_DELETE ? 14 : 0,
                      borderBottom: features.ENABLE_SOURCE_DELETE
                        ? '1px solid var(--danger-line)'
                        : 'none',
                      gap: 14,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 650, fontSize: 13 }}>Update source name</div>
                      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                        PUT — only FileUpload-safe fields are sent.
                      </div>
                    </div>
                    {editing ? (
                      <div className="row" style={{ gap: 8 }}>
                        <input
                          className="input btn-sm"
                          style={{ height: 32, width: 200 }}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                        />
                        <Btn
                          variant="primary"
                          size="sm"
                          disabled={savingName}
                          onClick={() => void saveName()}
                        >
                          {savingName ? <Spinner size={14} /> : 'Save'}
                        </Btn>
                        <Btn variant="ghost" size="sm" onClick={() => setEditing(false)}>
                          Cancel
                        </Btn>
                      </div>
                    ) : (
                      <Btn variant="default" size="sm" icon="edit" onClick={() => setEditing(true)}>
                        Edit name
                      </Btn>
                    )}
                  </div>
                )}
                {features.ENABLE_SOURCE_DELETE && (
                  <div
                    className="between"
                    style={{
                      paddingTop: features.ENABLE_SOURCE_UPDATE ? 14 : 0,
                      gap: 14,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 650, fontSize: 13 }}>Delete this source</div>
                      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                        Unrecoverable. Requires typed confirmation.
                      </div>
                    </div>
                    <Btn
                      variant="danger-solid"
                      size="sm"
                      icon="trash"
                      onClick={() => setShowDelete(true)}
                    >
                      Delete source
                    </Btn>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </Modal>

      {features.ENABLE_SOURCE_DELETE && (
        <DeleteSourceModal
          source={showDelete ? source : null}
          activeRun={activeRun}
          onClose={() => setShowDelete(false)}
          onDeleted={async () => {
            setShowDelete(false);
            await onDeleted(source.localSourceKey);
          }}
        />
      )}
    </>
  );
}

/* ================================================================== */
/* Create source modal                                                */
/* ================================================================== */

function CreateSourceModal({
  open,
  onClose,
  onCreated,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (rec: SourceRecord) => Promise<void>;
  existing: SourceRecord[];
}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createUnknown, setCreateUnknown] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setErr('');
      setSubmitting(false);
      setCreateUnknown(false);
    }
  }, [open]);

  const dupe = existing.some((s) => s.displayName.toLowerCase() === name.trim().toLowerCase());

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErr('Enter a source name.');
      return;
    }
    setSubmitting(true);
    setErr('');
    setCreateUnknown(false);
    try {
      const { source } = await api.post<{ source: ValidatedSource }>('/api/sources', {
        name: trimmed,
      });
      const rec: SourceRecord = {
        localSourceKey: uuid(),
        sourceId: source.id,
        displayName: source.name ?? trimmed,
        sourceType: (source.type as SourceType) ?? 'FileUpload',
        remoteName: source.name ?? trimmed,
        remoteStatus: (source.status as RemoteSourceStatus | undefined) ?? 'Active',
        isCompatibleFileUploadSource: isCompatible(source),
        createdByApp: true,
        dateAddedToVault: Date.now(),
        lastValidatedAt: Date.now(),
        lastRemoteSyncAt: parseDate(source.dateLastSync),
        lastUsedAt: null,
        lastSyncRunId: null,
        archived: false,
        lastSync: null,
      };
      await onCreated(rec);
    } catch (err2) {
      const e = err2 as ApiError;
      if (e.code === 'SOURCE_CREATE_UNKNOWN') {
        setCreateUnknown(true);
      } else {
        setErr(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-head">
          <div
            className="modal-icon"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Icon name="plus" size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16 }}>Create FileUpload source</h3>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              <span className="mono">POST /knowledge/sources</span> then validate with{' '}
              <span className="mono">GET /{'{id}'}</span>.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <Field
            label="Source name"
            error={err}
            hint="2–200 characters · stored encrypted in your local vault"
          >
            <input
              className={`input ${err ? 'input-err' : ''}`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErr('');
              }}
              placeholder="e.g. Support KB — Production"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          </Field>
          {dupe && (
            <div style={{ marginTop: 12 }}>
              <Callout tone="warning" icon="alert">
                A source with this name already exists locally. Confirm before creating a duplicate.
              </Callout>
            </div>
          )}
          {createUnknown ? (
            <div style={{ marginTop: 14 }}>
              <Callout tone="warning" icon="alert" title="Create outcome unknown">
                The create call could not be confirmed (
                <span className="mono">SourceCreateUnknown</span>). Don&apos;t blindly retry — open{' '}
                <strong>Discover remote</strong> to find a likely-created source before trying
                again.
              </Callout>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <Callout tone="info" icon="shield">
                If create times out, the outcome is marked{' '}
                <span className="mono">SourceCreateUnknown</span> — instead of blind retry, use
                Discovery to find a likely-created source first.
              </Callout>
            </div>
          )}
        </div>
      </div>
      <div className="modal-foot">
        <Btn variant="ghost" onClick={onClose}>
          Cancel
        </Btn>
        <Btn
          variant="primary"
          icon={submitting ? undefined : 'plus'}
          disabled={submitting}
          onClick={() => void submit()}
        >
          {submitting ? (
            <>
              <Spinner size={15} /> Creating…
            </>
          ) : (
            'Create source'
          )}
        </Btn>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Add by ID modal                                                    */
/* ================================================================== */

function ExistingSourceModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (rec: SourceRecord) => Promise<void>;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [state, setState] = useState<
    'idle' | 'validating' | 'found' | 'incompatible' | 'notfound' | 'error'
  >('idle');
  const [remote, setRemote] = useState<ValidatedSource | null>(null);
  const [adding, setAdding] = useState(false);

  const validId = UUID_RE.test(id.trim());

  useEffect(() => {
    if (open) {
      setId('');
      setName('');
      setErr('');
      setState('idle');
      setRemote(null);
      setAdding(false);
    }
  }, [open]);

  const validate = async () => {
    if (!validId) {
      setErr('Enter a valid source ID (UUID).');
      return;
    }
    setState('validating');
    setErr('');
    setRemote(null);
    try {
      const { source } = await api.get<{ source: ValidatedSource }>(
        `/api/sources/${encodeURIComponent(id.trim())}`,
      );
      setRemote(source);
      if (!isCompatible(source)) {
        setState('incompatible');
      } else {
        setState('found');
        setName(source.name ?? '');
      }
    } catch (err2) {
      const e = err2 as ApiError;
      if (e.code === 'SOURCE_NOT_FOUND') {
        setState('notfound');
      } else if (e.code === 'SOURCE_INCOMPATIBLE_TYPE') {
        setState('incompatible');
      } else {
        setErr(e.message);
        setState('error');
      }
    }
  };

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErr('Enter a display name.');
      return;
    }
    if (!remote) return;
    setAdding(true);
    try {
      const rec: SourceRecord = {
        localSourceKey: uuid(),
        sourceId: id.trim(),
        displayName: trimmed,
        sourceType: (remote.type as SourceType) ?? 'FileUpload',
        remoteName: remote.name ?? null,
        remoteStatus: (remote.status as RemoteSourceStatus | undefined) ?? null,
        isCompatibleFileUploadSource: remote.isCompatibleFileUploadSource ?? isCompatible(remote),
        createdByApp: false,
        dateAddedToVault: Date.now(),
        lastValidatedAt: Date.now(),
        lastRemoteSyncAt: parseDate(remote.dateLastSync),
        lastUsedAt: null,
        lastSyncRunId: null,
        archived: false,
        lastSync: null,
      };
      await onAdd(rec);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-head">
          <div
            className="modal-icon"
            style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
          >
            <Icon name="link" size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16 }}>Add source by ID</h3>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Validated server-side with{' '}
              <span className="mono">GET /knowledge/sources/{'{id}'}</span> before it&apos;s saved.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Source ID" error={err && !validId ? err : ''} hint="UUID format">
            <div className="row" style={{ gap: 8 }}>
              <input
                className={`input mono ${err && !validId ? 'input-err' : ''}`}
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  setState('idle');
                  setErr('');
                }}
                placeholder="9b2e4f17-3c8a-4d56-bb20-7e1a9c4d2f88"
                autoFocus
              />
              <Btn
                variant="default"
                onClick={() => void validate()}
                disabled={state === 'validating'}
              >
                {state === 'validating' ? <Spinner size={15} /> : 'Validate'}
              </Btn>
            </div>
          </Field>
          <div className="faint" style={{ fontSize: 11.5, marginTop: -6 }}>
            Tip: a real Fabric source validates; others return &ldquo;not accessible&rdquo;.
          </div>

          {state === 'found' && remote && (
            <>
              <Callout tone="info" icon="check" title="Source validated">
                <span className="mono">{remote.name}</span> · {typeMeta(remote.type).label} ·{' '}
                {
                  (REMOTE_STATUS_META[remote.status ?? ''] ?? { label: remote.status ?? 'Unknown' })
                    .label
                }
              </Callout>
              <Field label="Display name (local)" error={err && validId ? err : ''}>
                <input
                  className={`input ${err && validId ? 'input-err' : ''}`}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErr('');
                  }}
                />
              </Field>
            </>
          )}
          {state === 'incompatible' && (
            <Callout tone="danger" icon="alertCircle" title="Incompatible source type">
              This is a <strong>{remote ? typeMeta(remote.type).label : 'non-FileUpload'}</strong>{' '}
              source, not FileUpload. It can&apos;t be synced here and won&apos;t be imported.
            </Callout>
          )}
          {state === 'notfound' && (
            <Callout tone="danger" icon="xCircle" title="Source not accessible">
              No accessible source matched this ID. Check the ID and your OAuth permissions. The
              local record is not created.
            </Callout>
          )}
          {state === 'error' && err && (
            <Callout tone="danger" icon="alertCircle" title="Validation failed">
              {err}
            </Callout>
          )}
        </div>
      </div>
      <div className="modal-foot">
        <Btn variant="ghost" onClick={onClose}>
          Cancel
        </Btn>
        <Btn
          variant="primary"
          icon={adding ? undefined : 'check'}
          onClick={() => void add()}
          disabled={state !== 'found' || adding}
        >
          {adding ? <Spinner size={15} /> : 'Add to vault'}
        </Btn>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Rename modal                                                       */
/* ================================================================== */

function RenameModal({
  target,
  onClose,
  onSave,
}: {
  target: SourceRecord | null;
  onClose: () => void;
  onSave: (target: SourceRecord, name: string) => void;
}) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (target) setName(target.displayName);
  }, [target]);
  return (
    <Modal open={!!target} onClose={onClose}>
      <div className="modal-body">
        <h3 style={{ fontSize: 16, marginBottom: 14 }}>Rename source</h3>
        <Field label="Display name" hint="Local label only — the Genesys source is unchanged">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && target && onSave(target, name)}
          />
        </Field>
      </div>
      <div className="modal-foot">
        <Btn variant="ghost" onClick={onClose}>
          Cancel
        </Btn>
        <Btn variant="primary" onClick={() => target && onSave(target, name)}>
          Save
        </Btn>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/* Delete source modal (typed confirmation)                           */
/* ================================================================== */

function DeleteSourceModal({
  source,
  activeRun,
  onClose,
  onDeleted,
}: {
  source: SourceRecord | null;
  activeRun: ReturnType<typeof useApp>['activeRun'];
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const { toast } = useApp();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (source) {
      setTyped('');
      setDeleting(false);
    }
  }, [source]);

  if (!source) return null;

  const blocked =
    !!activeRun &&
    activeRun.sourceId === source.sourceId &&
    (['Running', 'Cancelling', 'NeedsUserAction'] as const).includes(
      activeRun.status as 'Running' | 'Cancelling' | 'NeedsUserAction',
    );
  const match = typed.trim() === source.displayName;

  const confirm = async () => {
    if (blocked || !match) return;
    setDeleting(true);
    try {
      await api.del(`/api/sources/${encodeURIComponent(source.sourceId)}`, {
        sourceId: source.sourceId,
        confirmName: typed.trim(),
      });
      await onDeleted();
    } catch (err) {
      toast({ tone: 'danger', title: 'Delete failed', body: (err as ApiError).message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal open={!!source} onClose={onClose}>
      <div className="modal-body">
        <div className="modal-head">
          <div
            className="modal-icon"
            style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
          >
            <Icon name="trash" size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16 }}>Delete source</h3>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              <span className="mono">DELETE /knowledge/sources/{'{id}'}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <Callout tone="danger" icon="alertCircle" title="This is unrecoverable">
            Deleting a Knowledge Fabric source removes it and its ingested content in Genesys. This
            cannot be undone. The local reference is removed only after remote deletion is
            confirmed.
          </Callout>
          {blocked ? (
            <div style={{ marginTop: 14 }}>
              <Callout tone="warning" icon="alert" title="Blocked — sync in progress">
                A sync for this source is active or ambiguous. Resolve or cancel it before deleting.
              </Callout>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <Field
                label={
                  <>
                    Type{' '}
                    <span className="mono" style={{ color: 'var(--danger)' }}>
                      {source.displayName}
                    </span>{' '}
                    to confirm
                  </>
                }
              >
                <input
                  className="input"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={source.displayName}
                  autoFocus
                />
              </Field>
            </div>
          )}
        </div>
      </div>
      <div className="modal-foot">
        <Btn variant="ghost" onClick={onClose}>
          Cancel
        </Btn>
        <Btn
          variant="danger-solid"
          icon={deleting ? undefined : 'trash'}
          disabled={blocked || !match || deleting}
          onClick={() => void confirm()}
        >
          {deleting ? <Spinner size={15} /> : 'Delete permanently'}
        </Btn>
      </div>
    </Modal>
  );
}
