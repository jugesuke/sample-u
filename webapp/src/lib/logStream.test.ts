import { describe, expect, it } from 'vitest';
import { formatLogEntry, LineAssembler, logFileName, parseBoatLine } from './logStream';

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

describe('parseBoatLine', () => {
  it('レベルと本文に分ける', () => {
    expect(parseBoatLine('DEBUG 1000 rx seq=1')).toEqual({ level: 'DEBUG', text: '1000 rx seq=1' });
  });

  it('レベルが読めない行は本文を残してWARNにする', () => {
    expect(parseBoatLine('壊れた 行')).toEqual({ level: 'WARN', text: '壊れた 行' });
  });
});

describe('formatLogEntry', () => {
  it('ISO 8601の日時、レベル、送信元、本文を並べる', () => {
    const at = Date.UTC(2026, 10, 3, 9, 5, 7, 42);
    expect(formatLogEntry({ at, level: 'INFO', source: 'app', text: '接続完了' })).toBe(
      '2026-11-03T09:05:07.042Z INFO  app  接続完了',
    );
  });
});

describe('logFileName', () => {
  it('日時を含むファイル名にする', () => {
    expect(logFileName(new Date(Date.UTC(2026, 10, 3, 9, 5, 7)))).toBe(
      'boat-log-2026-11-03T09-05-07Z.txt',
    );
  });
});
