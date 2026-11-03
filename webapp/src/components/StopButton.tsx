import { useBoatStore } from '../store';

export function StopButton() {
  const stopLatched = useBoatStore((state) => state.stopLatched);
  const toggleStop = useBoatStore((state) => state.toggleStop);

  return (
    <button
      aria-pressed={stopLatched}
      onClick={toggleStop}
      // 状態が変わってもサイズが変わらないよう、幅と枠線の太さを固定する
      className={`min-h-14 w-40 shrink-0 whitespace-nowrap landscape:w-full rounded-lg border-4 border-stop text-lg font-black ${
        stopLatched ? 'bg-card text-stop' : 'bg-stop text-white'
      }`}
    >
      {stopLatched ? '停止中(解除)' : 'STOP'}
    </button>
  );
}
