import { useEffect, useRef, useState } from 'react';
import { formatLogEntry, LOG_LEVELS, logFileName, type LogLevel } from '../lib/logStream';
import { useLogStore } from '../logStore';

const button = 'min-h-11 w-20 whitespace-nowrap rounded-lg border border-ink font-bold disabled:opacity-40';
const STICK_TO_BOTTOM_PX = 40;
const MAX_VISIBLE_LINES = 1000; // 表示だけを制限する。保存は全行

function saveLog(lines: string[]) {
  const url = URL.createObjectURL(new Blob([`${lines.join('\n')}\n`], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = logFileName(new Date());
  link.click();
  URL.revokeObjectURL(url);
}

export function LogPanel({ onClose }: { onClose: () => void }) {
  const logs = useLogStore((state) => state.logs);
  const clearLogs = useLogStore((state) => state.clearLogs);
  const [minLevel, setMinLevel] = useState<LogLevel>('INFO');
  const list = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const visible = logs
    .filter(({ level }) => LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(minLevel))
    .slice(-MAX_VISIBLE_LINES);

  useEffect(() => {
    if (followLatest.current && list.current) {
      list.current.scrollTop = list.current.scrollHeight;
    }
  }, [logs, minLevel]);

  return (
    <main className="flex h-dvh flex-col gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] landscape:p-2">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-bold">ログ {logs.length}行</h1>
        <select
          aria-label="表示レベル"
          value={minLevel}
          onChange={(event) => setMinLevel(event.target.value as LogLevel)}
          className="min-h-11 rounded-lg border border-ink px-2 font-bold"
        >
          {LOG_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button
            className={button}
            disabled={logs.length === 0}
            onClick={() => saveLog(logs.map(formatLogEntry))}
          >
            保存
          </button>
          <button className={button} disabled={logs.length === 0} onClick={clearLogs}>
            クリア
          </button>
          <button className={button} onClick={onClose}>
            閉じる
          </button>
        </div>
      </header>
      <div
        ref={list}
        role="log"
        aria-label="動作ログ"
        onScroll={({ currentTarget: { scrollTop, scrollHeight, clientHeight } }) => {
          followLatest.current = scrollHeight - scrollTop - clientHeight < STICK_TO_BOTTOM_PX;
        }}
        className="min-h-0 flex-1 select-text overflow-y-auto rounded-xl bg-card p-2 font-mono text-xs break-all"
      >
        {visible.length === 0 && <p className="font-sans text-sm">ログはまだありません。</p>}
        {visible.map((entry, index) => (
          <div key={index} className={entry.level === 'ERROR' || entry.level === 'WARN' ? 'text-stop' : ''}>
            {formatLogEntry(entry)}
          </div>
        ))}
      </div>
    </main>
  );
}
