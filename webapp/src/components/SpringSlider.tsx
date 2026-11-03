import * as Slider from '@radix-ui/react-slider';

interface Props {
  label: string;
  value: number;
  orientation: 'horizontal' | 'vertical';
  onChange: (value: number) => void;
}

/** 指を離すと0に戻る -100〜100 のスライダー */
export function SpringSlider({ label, value, orientation, onChange }: Props) {
  const vertical = orientation === 'vertical';
  const release = () => onChange(0);

  return (
    <div className={`flex flex-col items-center gap-1 ${vertical ? 'h-full' : 'w-full'}`}>
      <span className="font-bold">{label}</span>
      <Slider.Root
        orientation={orientation}
        min={-100}
        max={100}
        step={1}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        className={`relative flex touch-none items-center justify-center ${
          vertical ? 'min-h-0 w-24 flex-1 flex-col' : 'h-24 w-full'
        }`}
      >
        <Slider.Track
          className={`relative grow rounded-full bg-line ${vertical ? 'h-full w-4' : 'h-4 w-full'}`}
        >
          <span
            aria-hidden
            className={`absolute bg-ink ${
              vertical
                ? 'inset-x-[-12px] top-1/2 h-0.5 -translate-y-1/2'
                : 'inset-y-[-12px] left-1/2 w-0.5 -translate-x-1/2'
            }`}
          />
        </Slider.Track>
        <Slider.Thumb
          aria-label={label}
          className="block size-16 rounded-full border-4 border-ink bg-accent"
        />
      </Slider.Root>
    </div>
  );
}
