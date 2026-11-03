import { describe, expect, it } from 'vitest';
import { formatLogEntry, LineAssembler, logFileName } from './logStream';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('LineAssembler', () => {
  it('分割されて届いたテキストを行に組み立てる', () => {
    const assembler = new LineAssembler();
    expect(assembler.push(bytes('123 con'))).toEqual([]);
    expect(assembler.push(bytes('nected\n456 st'))).toEqual(['123 connected']);
    expect(assembler.push(bytes('atus\n'))).toEqual(['456 status']);
  });

  it('1回の受信に複数行あっても分ける', () => {
    expect(new LineAssembler().push(bytes('a\nb\nc'))).toEqual(['a', 'b']);
  });

  it('resetすると書きかけの行を捨てる', () => {
    const assembler = new LineAssembler();
    assembler.push(bytes('書きかけ'));
    assembler.reset();
    expect(assembler.push(bytes('new\n'))).toEqual(['new']);
  });
});

describe('formatLogEntry', () => {
  it('日時、送信元、本文を並べる', () => {
    const at = new Date(2026, 10, 3, 9, 5, 7, 42).getTime();
    expect(formatLogEntry({ at, source: 'app', text: '接続しました' })).toBe(
      '11-03 09:05:07.042 app  接続しました',
    );
    expect(formatLogEntry({ at, source: 'boat', text: '123 boot' })).toBe(
      '11-03 09:05:07.042 boat 123 boot',
    );
  });
});

describe('logFileName', () => {
  it('日時を含むファイル名にする', () => {
    expect(logFileName(new Date(2026, 10, 3, 9, 5, 7))).toBe('boat-log-20261103-090507.txt');
  });
});
