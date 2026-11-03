import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BoatLink, type LinkStatus } from './lib/boatLink';
import type { LogEntry, LogSource } from './lib/logStream';
import {
  axesToCommand,
  encodeFrame,
  limitCommand,
  STOPPED,
  type Axes,
  type DriveMode,
  type MotorCommand,
} from './lib/drive';

const NEUTRAL: Axes = { a: 0, b: 0 };
const MAX_LOG_ENTRIES = 5000;

interface BoatState {
  mode: DriveMode;
  maxOutput: number;
  axes: Axes;
  stopLatched: boolean;
  status: LinkStatus;
  error?: string;
  logs: LogEntry[];
  setMode: (mode: DriveMode) => void;
  setMaxOutput: (maxOutput: number) => void;
  setAxes: (axes: Partial<Axes>) => void;
  resetAxes: () => void;
  toggleStop: () => void;
  addLog: (source: LogSource, text: string) => void;
  clearLogs: () => void;
}

export const useBoatStore = create<BoatState>()(
  persist(
    (set) => ({
      mode: 'joystick',
      maxOutput: 100,
      axes: NEUTRAL,
      stopLatched: false,
      status: 'idle',
      logs: [],
      setMode: (mode) => set({ mode, axes: NEUTRAL }),
      setMaxOutput: (maxOutput) => set({ maxOutput }),
      setAxes: (axes) => set((state) => ({ axes: { ...state.axes, ...axes } })),
      resetAxes: () => set({ axes: NEUTRAL }),
      toggleStop: () => set((state) => ({ stopLatched: !state.stopLatched, axes: NEUTRAL })),
      addLog: (source, text) =>
        set((state) => ({
          logs: [...state.logs, { at: Date.now(), source, text }].slice(-MAX_LOG_ENTRIES),
        })),
      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'boat-controller-settings',
      partialize: ({ mode, maxOutput }) => ({ mode, maxOutput }),
    },
  ),
);

/** 実際にモーターへ送る指令 */
export function selectOutput(state: BoatState): MotorCommand {
  if (state.stopLatched) return STOPPED;
  return limitCommand(axesToCommand(state.mode, state.axes), state.maxOutput);
}

export const boatLink = new BoatLink(
  () => encodeFrame(selectOutput(useBoatStore.getState())),
  encodeFrame(STOPPED),
  (status, error) => {
    useBoatStore.setState({ status, error });
    if (status !== 'connected') {
      useBoatStore.setState({ axes: NEUTRAL, stopLatched: false });
    }
  },
  (source, text) => useBoatStore.getState().addLog(source, text),
);
