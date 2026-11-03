import { useBoatStore } from '../store';

export function StopButton() {
  const stopLatched = useBoatStore((state) => state.stopLatched);
  const toggleStop = useBoatStore((state) => state.toggleStop);

  return (
    <button
      aria-pressed={stopLatched}
      onClick={toggleStop}
      className={`min-h-14 shrink-0 rounded-lg px-6 text-lg font-black ${
        stopLatched ? 'border-4 border-stop bg-card text-stop' : 'bg-stop text-white'
      }`}
    >
      {stopLatched ? '停止中(解除)' : 'STOP'}
    </button>
  );
}
