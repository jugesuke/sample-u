export const LOG_LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogSource = 'boat' | 'app';

export interface LogEntry {
  /** 受信または記録した時刻(ミリ秒) */
  at: number;
  level: LogLevel;
  source: LogSource;
  text: string;
}

/** 分割して届くログのテキストを、改行で区切った行に組み立て直す */
export class LineAssembler {
  private decoder = new TextDecoder();
  private partial = '';

  push(chunk: Uint8Array): string[] {
    const lines = (this.partial + this.decoder.decode(chunk, { stream: true })).split('\n');
    this.partial = lines.pop()!;
    return lines;
  }

  /** 接続が切れたら書きかけの行を捨てる。船は次の接続で行の先頭から送り直す */
  reset(): void {
    this.decoder = new TextDecoder();
    this.partial = '';
  }
}

/** 船のログ行 `<LEVEL> <起動後ミリ秒> <本文>` からレベルを取り出す */
export function parseBoatLine(line: string): { level: LogLevel; text: string } {
  const separator = line.indexOf(' ');
  const level = line.slice(0, separator) as LogLevel;
  return LOG_LEVELS.includes(level)
    ? { level, text: line.slice(separator + 1) }
    : { level: 'WARN', text: line };
}

export function formatLogEntry({ at, level, source, text }: LogEntry): string {
  return `${new Date(at).toISOString()} ${level.padEnd(5)} ${source.padEnd(4)} ${text}`;
}

export function logFileName(now: Date): string {
  return `boat-log-${now.toISOString().slice(0, 19).replaceAll(':', '-')}Z.txt`;
}
