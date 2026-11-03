export type LogSource = 'boat' | 'app';

export interface LogEntry {
  /** 受信または記録した時刻(ミリ秒) */
  at: number;
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

export function formatLogEntry({ at, source, text }: LogEntry): string {
  const time = new Date(at);
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  const clock = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}.${pad(time.getMilliseconds(), 3)}`;
  return `${clock} ${source.padEnd(4)} ${text}`;
}

export function logFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `boat-log-${date}-${time}.txt`;
}
