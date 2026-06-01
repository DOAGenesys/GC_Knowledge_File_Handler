import { describe, expect, it } from 'vitest';
import {
  getExtension,
  isSupportedExtension,
  mimeFromExtension,
  sanitizeUploadName,
  validateFile,
} from '../validation';

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('getExtension / isSupportedExtension', () => {
  it('extracts the lowercased final extension', () => {
    expect(getExtension('Report.FINAL.PDF')).toBe('.pdf');
    expect(getExtension('noext')).toBe('');
    expect(getExtension('.hidden')).toBe('.hidden');
  });

  it('treats supported extensions case-insensitively', () => {
    expect(isSupportedExtension('.PDF')).toBe(true);
    expect(isSupportedExtension('.xlsx')).toBe(true);
    expect(isSupportedExtension('.exe')).toBe(false);
  });

  it('handles double extensions by using the last one', () => {
    expect(getExtension('archive.tar.gz')).toBe('.gz');
    expect(getExtension('notes.txt')).toBe('.txt');
  });
});

describe('validateFile — blocking rules', () => {
  const ok = { name: 'good_name.pdf', size: 100, type: 'application/pdf', lastModified: 1 };

  it('passes a clean file', () => {
    const r = validateFile(ok);
    expect(r.status).toBe('Ready');
    expect(r.blocking).toHaveLength(0);
  });

  it('blocks unsupported extension', () => {
    expect(codes(validateFile({ ...ok, name: 'malware.exe' }).blocking)).toContain('EXT');
  });

  it('blocks names starting with a dot', () => {
    expect(codes(validateFile({ ...ok, name: '.secret.txt' }).blocking)).toContain('DOT');
  });

  it('blocks names ending with a slash', () => {
    expect(codes(validateFile({ ...ok, name: 'folder.txt/' }).blocking)).toContain('SLASH');
  });

  it('blocks whitespace', () => {
    expect(codes(validateFile({ ...ok, name: 'my file.txt' }).blocking)).toContain('WS');
  });

  it.each(['\\', '{', '^', '}', '%', '`', ']', '"', '>', '[', '~', '<', '#', '|'])(
    'blocks the Genesys-disallowed character %j',
    (ch) => {
      expect(codes(validateFile({ ...ok, name: `a${ch}b.txt` }).blocking)).toContain('CHARS');
    },
  );

  it('blocks path separators', () => {
    expect(codes(validateFile({ ...ok, name: 'a/b.txt' }).blocking)).toContain('SEP');
    expect(codes(validateFile({ ...ok, name: 'a\\b.txt' }).blocking)).toContain('SEP');
  });

  it('blocks path traversal segments', () => {
    expect(codes(validateFile({ ...ok, name: 'a..b.txt' }).blocking)).toContain('TRAVERSAL');
  });

  it('blocks control characters', () => {
    expect(
      codes(validateFile({ ...ok, name: `a${String.fromCharCode(7)}b.txt` }).blocking),
    ).toContain('CTRL');
  });

  it('detects duplicate upload names within a plan', () => {
    const r = validateFile({ ...ok, name: 'dup.txt' }, ['dup.txt']);
    expect(codes(r.blocking)).toContain('DUP');
  });
});

describe('validateFile — warnings', () => {
  const base = { name: 'x.txt', size: 100, type: 'text/plain', lastModified: 1 };

  it('warns on zero-byte files', () => {
    expect(codes(validateFile({ ...base, size: 0 }).warnings)).toContain('ZERO');
  });

  it('warns on files above the size threshold', () => {
    const big = { ...base, size: 80 * 1024 * 1024 };
    expect(codes(validateFile(big, [], { sizeWarnMb: 50 }).warnings)).toContain('BIG');
  });

  it('warns on MIME/extension mismatch', () => {
    expect(codes(validateFile({ ...base, type: 'application/pdf' }).warnings)).toContain('MIME');
  });

  it('warns on missing MIME type', () => {
    expect(codes(validateFile({ ...base, type: '' }).warnings)).toContain('NOMIME');
  });

  it('warns on missing modified timestamp', () => {
    expect(codes(validateFile({ ...base, lastModified: 0 }).warnings)).toContain('NOMOD');
  });

  it('warns on mixed-script (homograph) names', () => {
    // Cyrillic "а" mixed with Latin.
    expect(codes(validateFile({ ...base, name: 'pаypal.txt' }).warnings)).toContain('SPOOF');
  });
});

describe('sanitizeUploadName / safe-rename suggestions', () => {
  it('replaces whitespace with underscores and preserves extension', () => {
    expect(sanitizeUploadName('Refund Policy v3.docx')).toBe('Refund_Policy_v3.docx');
  });

  it('removes disallowed characters', () => {
    expect(sanitizeUploadName('Tier 1 Macros#draft.csv')).toBe('Tier_1_Macrosdraft.csv');
  });

  it('collapses traversal and repeated separators and trims', () => {
    expect(sanitizeUploadName('..__weird..name__.txt')).toBe('weird.name.txt');
  });

  it('transforms reserved platform names', () => {
    expect(sanitizeUploadName('CON.txt')).toBe('CON_file.txt');
  });

  it('offers a suggestion only for renameable blocking issues with a supported ext', () => {
    const r = validateFile({ name: 'my file.txt', size: 1, type: 'text/plain', lastModified: 1 });
    expect(r.suggestion).toBe('my_file.txt');

    const unsupported = validateFile({ name: 'bad name.exe', size: 1, lastModified: 1 });
    expect(unsupported.suggestion).toBeNull();
  });
});

describe('mimeFromExtension', () => {
  it('maps known extensions and falls back otherwise', () => {
    expect(mimeFromExtension('.pdf')).toBe('application/pdf');
    expect(mimeFromExtension('.bin')).toBe('application/octet-stream');
  });
});
