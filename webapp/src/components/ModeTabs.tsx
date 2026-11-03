import type { DriveMode } from '../lib/drive';
import { useBoatStore } from '../store';

const MODES: { mode: DriveMode; label: string }[] = [
  { mode: 'joystick', label: 'スティック' },
  { mode: 'tank', label: '左右独立' },
  { mode: 'throttleRudder', label: 'スロットル+舵' },
];

export function ModeTabs() {
  const current = useBoatStore((state) => state.mode);
  const setMode = useBoatStore((state) => state.setMode);

  return (
    <div role="group" aria-label="操作モード" className="flex rounded-lg border border-ink">
      {MODES.map(({ mode, label }) => (
        <button
          key={mode}
          aria-pressed={mode === current}
          onClick={() => setMode(mode)}
          className={`min-h-11 flex-1 whitespace-nowrap px-2 text-sm font-bold first:rounded-l-lg last:rounded-r-lg ${
            mode === current ? 'bg-ink text-paper' : ''
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
