import { useBoatStore } from '../store';

const SIDES = [
  { side: 'left', label: '左' },
  { side: 'right', label: '右' },
] as const;

/** 横画面のスティックを左右どちらに置くかを選ぶ */
export function JoystickSideToggle() {
  const current = useBoatStore((state) => state.joystickSide);
  const setSide = useBoatStore((state) => state.setJoystickSide);

  return (
    <div role="group" aria-label="横画面のスティック位置" className="flex rounded-lg border border-ink">
      {SIDES.map(({ side, label }) => (
        <button
          key={side}
          aria-pressed={side === current}
          onClick={() => setSide(side)}
          className={`min-h-11 flex-1 font-bold first:rounded-l-lg last:rounded-r-lg ${
            side === current ? 'bg-ink text-paper' : ''
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
