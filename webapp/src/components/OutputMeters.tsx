import { useShallow } from 'zustand/react/shallow';
import { selectOutput, useBoatStore } from '../store';

function Meter({ label, value }: { label: string; value: number }) {
  const width = `${Math.abs(value) / 2}%`;
  return (
    <div className="flex flex-1 items-center gap-2">
      <span className="font-bold">{label}</span>
      <div className="relative h-3 flex-1 rounded-sm bg-line">
        <div
          className={`absolute inset-y-0 ${value < 0 ? 'bg-signal' : 'bg-accent'}`}
          style={value < 0 ? { right: '50%', width } : { left: '50%', width }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-ink" />
      </div>
      <output aria-label={`${label}モーター出力`} className="w-10 text-right font-mono font-bold">
        {value}
      </output>
    </div>
  );
}

export function OutputMeters() {
  const { left, right } = useBoatStore(useShallow(selectOutput));
  return (
    <div className="flex min-w-64 gap-3 portrait:flex-1 landscape:min-w-0">
      <Meter label="L" value={left} />
      <Meter label="R" value={right} />
    </div>
  );
}
