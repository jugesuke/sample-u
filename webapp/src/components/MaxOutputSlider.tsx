import * as Slider from '@radix-ui/react-slider';
import { useBoatStore } from '../store';

export function MaxOutputSlider() {
  const maxOutput = useBoatStore((state) => state.maxOutput);
  const setMaxOutput = useBoatStore((state) => state.setMaxOutput);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="shrink-0 text-sm font-bold">最大 {maxOutput}%</span>
      <Slider.Root
        className="relative flex h-11 min-w-0 flex-1 touch-none items-center"
        min={10}
        max={100}
        step={5}
        value={[maxOutput]}
        onValueChange={([value]) => setMaxOutput(value)}
      >
        <Slider.Track className="relative h-2 grow rounded-full bg-line">
          <Slider.Range className="absolute h-full rounded-full bg-ink" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="最大出力"
          className="block size-7 rounded-full border-2 border-ink bg-card"
        />
      </Slider.Root>
    </div>
  );
}
