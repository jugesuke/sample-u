import { create } from 'zustand';
import type { LogEntry, LogLevel, LogSource } from './lib/logStream';

const STORAGE_KEY = 'boat-controller-logs-v2';
const MAX_LOG_ENTRIES = 10000;
const SAVE_DELAY_MS = 1000;

interface LogState {
  logs: LogEntry[];
  addLog: (level: LogLevel, source: LogSource, text: string) => void;
  clearLogs: () => void;
}

function loadLogs(): LogEntry[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export const useLogStore = create<LogState>()((set) => ({
  logs: loadLogs(),
  addLog: (level, source, text) =>
    set((state) => ({
      logs: [...state.logs, { at: Date.now(), level, source, text }].slice(-MAX_LOG_ENTRIES),
    })),
  clearLogs: () => set({ logs: [] }),
}));

// 全行の書き込みは重いので、まとめて保存する。画面を離れるときは待たずに保存する
let saveTimer: number | undefined;

function saveLogs() {
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(useLogStore.getState().logs));
  } catch (error) {
    // 保存できなくても操縦とログ表示は続けられる
    console.warn('ログを保存できませんでした', error);
  }
}

useLogStore.subscribe(() => {
  saveTimer ??= window.setTimeout(saveLogs, SAVE_DELAY_MS);
});
window.addEventListener('pagehide', saveLogs);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveLogs();
});

useLogStore.getState().addLog('INFO', 'app', 'アプリ起動');
