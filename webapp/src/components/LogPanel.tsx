import { useEffect, useRef } from 'react';
import { formatLogEntry, logFileName } from '../lib/logStream';
import { useLogStore } from '../logStore';

const button = 'min-h-11 w-20 whitespace-nowrap rounded-lg border border-ink font-bold disabled:opacity-40';
const STICK_TO_BOTTOM_PX = 40;

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
  const list = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const lines = logs.map(formatLogEntry);

  useEffect(() => {
    if (followLatest.current && list.current) {
      list.current.scrollTop = list.current.scrollHeight;
    }
  }, [logs]);

  return (
    <main className="flex h-dvh flex-col gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] landscape:p-2">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-bold">ログ {lines.length}行</h1>
        <div className="ml-auto flex gap-2">
          <button className={button} disabled={lines.length === 0} onClick={() => saveLog(lines)}>
            保存
          </button>
          <button className={button} disabled={lines.length === 0} onClick={clearLogs}>
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
        {lines.length === 0 && <p className="font-sans text-sm">ログはまだありません。</p>}
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
    </main>
  );
}
