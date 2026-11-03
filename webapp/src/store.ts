import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BoatLink, type LinkStatus } from './lib/boatLink';
import {
  axesToCommand,
  limitCommand,
  STOPPED,
  type Axes,
  type DriveMode,
  type MotorCommand,
} from './lib/drive';
import { useLogStore } from './logStore';

const NEUTRAL: Axes = { a: 0, b: 0 };

interface BoatState {
  mode: DriveMode;
  maxOutput: number;
  axes: Axes;
  stopLatched: boolean;
  status: LinkStatus;
  error?: string;
  setMode: (mode: DriveMode) => void;
  setMaxOutput: (maxOutput: number) => void;
  setAxes: (axes: Partial<Axes>) => void;
  resetAxes: () => void;
  toggleStop: () => void;
}

export const useBoatStore = create<BoatState>()(
  persist(
    (set) => ({
      mode: 'joystick',
      maxOutput: 100,
      axes: NEUTRAL,
      stopLatched: false,
      status: 'idle',
      setMode: (mode) => set({ mode, axes: NEUTRAL }),
      setMaxOutput: (maxOutput) => set({ maxOutput }),
      setAxes: (axes) => set((state) => ({ axes: { ...state.axes, ...axes } })),
      resetAxes: () => set({ axes: NEUTRAL }),
      toggleStop: () => set((state) => ({ stopLatched: !state.stopLatched, axes: NEUTRAL })),
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
  () => {
    const state = useBoatStore.getState();
    const { mode, axes, maxOutput, stopLatched } = state;
    return {
      command: selectOutput(state),
      input: `mode=${mode} a=${Math.round(axes.a)} b=${Math.round(axes.b)} max=${maxOutput} stop=${Number(stopLatched)}`,
    };
  },
  (status, error) => {
    useBoatStore.setState({ status, error });
    if (status !== 'connected') {
      useBoatStore.setState({ axes: NEUTRAL, stopLatched: false });
    }
  },
  (level, source, text) => useLogStore.getState().addLog(level, source, text),
);
