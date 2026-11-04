import * as Slider from '@radix-ui/react-slider';
import { applyBalance, MAX_BALANCE } from '../lib/drive';
import { useBoatStore } from '../store';

const button = 'min-h-11 w-9 shrink-0 rounded-lg border border-ink font-bold landscape:min-h-9';

/** 直進の調整。動かした向きの反対側のモーターを弱める */
export function BalanceSlider() {
  const balance = useBoatStore((state) => state.balance);
  const setBalance = useBoatStore((state) => state.setBalance);
  const { left, right } = applyBalance({ left: 100, right: 100 }, balance);
  const step = (delta: number) =>
    setBalance(Math.max(-MAX_BALANCE, Math.min(MAX_BALANCE, balance + delta)));

  return (
    <div className="flex items-center gap-2">
      <output aria-label="左右の出力比" className="w-10 shrink-0 font-mono text-xs font-bold">
        <span className="block">L{left}</span> <span className="block">R{right}</span>
      </output>
      <button aria-label="バランスを左へ" className={button} onClick={() => step(-1)}>
        ◀
      </button>
      <Slider.Root
        className="relative flex h-11 min-w-0 flex-1 touch-none items-center landscape:h-9"
        min={-MAX_BALANCE}
        max={MAX_BALANCE}
        step={1}
        value={[balance]}
        onValueChange={([value]) => setBalance(value)}
      >
        <Slider.Track className="relative h-2 grow rounded-full bg-line">
          <span aria-hidden className="absolute inset-y-[-6px] left-1/2 w-0.5 -translate-x-1/2 bg-ink" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="左右バランス"
          className="block size-7 rounded-full border-2 border-ink bg-card"
        />
      </Slider.Root>
      <button aria-label="バランスを右へ" className={button} onClick={() => step(1)}>
        ▶
      </button>
      <button aria-label="左右バランスを中央に戻す" className={button} onClick={() => setBalance(0)}>
        0
      </button>
    </div>
  );
}
