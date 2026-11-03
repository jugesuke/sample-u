import { useBoatStore } from '../store';

/** 横画面のスティックを左右どちらに置くかを切り替える */
export function JoystickSideToggle() {
  const mode = useBoatStore((state) => state.mode);
  const side = useBoatStore((state) => state.joystickSide);
  const setSide = useBoatStore((state) => state.setJoystickSide);
  if (mode !== 'joystick') return null;

  return (
    <button
      className="min-h-11 w-full whitespace-nowrap rounded-lg border border-ink font-bold portrait:hidden"
      onClick={() => setSide(side === 'left' ? 'right' : 'left')}
    >
      {side === 'left' ? 'スティックを右へ' : 'スティックを左へ'}
    </button>
  );
}
