/**
 * UI formatting helpers (client + server safe). Pure, no I/O.
 */
import type { SupportedExtension } from './constants';

export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtDate(input: number | string | Date): string {
  const d = typeof input === 'number' || typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDateFull(input: number | string | Date): string {
  const d = typeof input === 'number' || typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relTime(ms: number, now: number = Date.now()): string {
  const seconds = Math.round((now - ms) / 1000);
  if (seconds < 60) return `${Math.max(0, seconds)}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Icon name to use for a file extension (matches the Icon set). */
export const EXT_ICON: Record<SupportedExtension, string> = {
  '.pdf': 'file',
  '.doc': 'fileText',
  '.docx': 'fileText',
  '.txt': 'fileText',
  '.md': 'fileText',
  '.csv': 'list',
  '.xls': 'list',
  '.xlsx': 'list',
  '.html': 'file',
};

export function extIcon(ext: string): string {
  return EXT_ICON[ext.toLowerCase() as SupportedExtension] ?? 'file';
}
