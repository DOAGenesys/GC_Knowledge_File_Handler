/**
 * File name & extension validation and safe-rename suggestions.
 *
 * Pure and environment-agnostic (no DOM, no I/O) so it runs identically in the
 * browser, on the server (workflow input validation), and in unit tests.
 * Implements every Genesys file-name restriction and the additional defensive
 * checks in PRODUCT.md §4.1 and §13.
 */
import {
  DISALLOWED_FILENAME_CHARS,
  MAX_FILENAME_LENGTH,
  SUPPORTED_EXTENSIONS,
  type SupportedExtension,
} from './constants';

export type FileValidationStatus = 'Ready' | 'Warning' | 'Invalid';

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface FileMetaInput {
  name: string;
  size: number;
  type?: string;
  lastModified?: number;
}

export interface FileValidationResult {
  blocking: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Sanitized upload name if a safe rename is possible, else null. */
  suggestion: string | null;
  /** The computed sanitized upload name (always present). */
  uploadName: string;
  status: FileValidationStatus;
}

const PATH_SEP_RE = /[\\/]/;
const WHITESPACE_RE = /\s/;
// Cyrillic/Latin mixing heuristic for homograph spoofing.
const MIXED_SCRIPT_RE = /[Ѐ-ӿ].*[a-z]|[a-z].*[Ѐ-ӿ]/i;

/** True if a code point is a C0 control char (0x00–0x1F) or DEL (0x7F). */
function isControlCode(code: number): boolean {
  return code <= 0x1f || code === 0x7f;
}

/** True if the string contains any control character. */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    if (isControlCode(s.charCodeAt(i))) return true;
  }
  return false;
}

/** Remove all control characters from a string. */
function stripControlChars(s: string): string {
  let out = '';
  for (const ch of s) {
    if (!isControlCode(ch.charCodeAt(0))) out += ch;
  }
  return out;
}

/** Windows/platform reserved device names (case-insensitive, without ext). */
const RESERVED_STEMS = new Set<string>([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

/** Minimal extension→expected-MIME map for mismatch warnings. */
const EXT_MIME: Record<SupportedExtension, string[]> = {
  '.txt': ['text/plain'],
  '.md': ['text/markdown', 'text/x-markdown', 'text/plain'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.csv': ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.html': ['text/html'],
  '.pdf': ['application/pdf'],
};

export function getExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

export function isSupportedExtension(ext: string): ext is SupportedExtension {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

function stemOf(name: string): string {
  const ext = getExtension(name);
  return ext ? name.slice(0, name.length - ext.length) : name;
}

/**
 * Produce a Genesys-safe upload name. Normalizes to NFC, strips control chars
 * and path separators, collapses traversal segments, replaces whitespace with
 * `_`, removes disallowed characters, collapses repeated separators, trims
 * leading/trailing dots/underscores, and preserves the extension.
 */
export function sanitizeUploadName(name: string): string {
  const normalized = name.normalize('NFC');
  const ext = getExtension(normalized);
  let stem = ext ? normalized.slice(0, normalized.length - ext.length) : normalized;

  stem = stripControlChars(stem);
  stem = stem.replace(/[\\/]/g, '');
  stem = stem.replace(/\.\.+/g, '.');
  stem = stem.replace(/\s+/g, '_');
  for (const ch of DISALLOWED_FILENAME_CHARS) stem = stem.split(ch).join('');
  stem = stem
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+/, '')
    .replace(/[._]+$/, '');

  if (!stem || RESERVED_STEMS.has(stem.toLowerCase())) {
    stem = stem ? `${stem}_file` : 'file';
  }
  return stem + ext;
}

/**
 * Validate one file. `siblingUploadNames` are the sanitized upload names of all
 * other files in the same plan, used for duplicate detection (case-insensitive).
 */
export function validateFile(
  file: FileMetaInput,
  siblingUploadNames: readonly string[] = [],
  options: { sizeWarnMb?: number } = {},
): FileValidationResult {
  const name = file.name ?? '';
  const ext = getExtension(name);
  const blocking: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const sizeWarnBytes = (options.sizeWarnMb ?? 50) * 1024 * 1024;

  // ---- Blocking ----
  if (!name || !name.trim()) blocking.push({ code: 'EMPTY', message: 'File name is empty.' });
  if (!isSupportedExtension(ext)) {
    blocking.push({
      code: 'EXT',
      message: `Unsupported type "${ext || 'none'}". Allowed: ${SUPPORTED_EXTENSIONS.join(' ')}`,
    });
  }
  if (name.startsWith('.'))
    blocking.push({ code: 'DOT', message: 'Name must not start with a dot.' });
  if (name.endsWith('/')) {
    blocking.push({ code: 'SLASH', message: 'Name must not end with a forward slash.' });
  }
  if (WHITESPACE_RE.test(name)) blocking.push({ code: 'WS', message: 'Name contains whitespace.' });
  const badChars = DISALLOWED_FILENAME_CHARS.filter((c) => name.includes(c));
  if (badChars.length) {
    blocking.push({
      code: 'CHARS',
      message: `Contains disallowed characters: ${badChars.join(' ')}`,
    });
  }
  if (PATH_SEP_RE.test(name)) blocking.push({ code: 'SEP', message: 'Contains a path separator.' });
  if (hasControlChar(name)) {
    blocking.push({ code: 'CTRL', message: 'Contains control characters.' });
  }
  if (name.includes('..')) {
    blocking.push({ code: 'TRAVERSAL', message: 'Contains ".." path traversal segment.' });
  }

  const uploadName = sanitizeUploadName(name);
  const dupes = siblingUploadNames.filter((n) => n.toLowerCase() === uploadName.toLowerCase());
  if (dupes.length > 0) {
    blocking.push({ code: 'DUP', message: 'Duplicate upload name within this sync plan.' });
  }

  // ---- Warnings ----
  if (name.length > MAX_FILENAME_LENGTH) {
    warnings.push({ code: 'LONG', message: `Very long name (${name.length} chars).` });
  }
  if (file.size === 0) {
    warnings.push({ code: 'ZERO', message: 'Zero-byte file — confirm before uploading.' });
  }
  if (file.size > sizeWarnBytes) {
    warnings.push({
      code: 'BIG',
      message: `Large file — exceeds ${options.sizeWarnMb ?? 50} MB warning threshold.`,
    });
  }
  if (MIXED_SCRIPT_RE.test(name)) {
    warnings.push({ code: 'SPOOF', message: 'Mixed Unicode scripts — possible spoofing.' });
  }
  if (!file.lastModified) {
    warnings.push({ code: 'NOMOD', message: 'Missing modified timestamp.' });
  }
  if (RESERVED_STEMS.has(stemOf(name).toLowerCase())) {
    warnings.push({ code: 'RESERVED', message: 'Reserved platform name — will be transformed.' });
  }
  if (file.type && isSupportedExtension(ext)) {
    const expected = EXT_MIME[ext as SupportedExtension];
    if (expected && !expected.includes(file.type)) {
      warnings.push({ code: 'MIME', message: `MIME type "${file.type}" does not match ${ext}.` });
    }
  } else if (!file.type) {
    warnings.push({ code: 'NOMIME', message: 'Missing MIME type — extension fallback used.' });
  }

  // A safe rename is offered only when the blocking issues are name-shape issues
  // that sanitization fixes AND the extension is supported.
  const renameableCodes = new Set([
    'DOT',
    'WS',
    'CHARS',
    'SEP',
    'CTRL',
    'TRAVERSAL',
    'SLASH',
    'DUP',
  ]);
  const onlyRenameable = blocking.length > 0 && blocking.every((b) => renameableCodes.has(b.code));
  const suggestion =
    onlyRenameable && isSupportedExtension(ext) && uploadName !== name ? uploadName : null;

  let status: FileValidationStatus = 'Ready';
  if (blocking.length) status = 'Invalid';
  else if (warnings.length) status = 'Warning';

  return { blocking, warnings, suggestion, uploadName, status };
}

/** Map an extension to a fallback MIME type when the browser reports none. */
export function mimeFromExtension(ext: string): string {
  const e = ext.toLowerCase();
  if (isSupportedExtension(e)) {
    const list = EXT_MIME[e as SupportedExtension];
    return list[0] ?? 'application/octet-stream';
  }
  return 'application/octet-stream';
}
