import { useCallback } from 'react';
import { useBoatStore } from '../store';
import { Joystick } from './Joystick';
import { SpringSlider } from './SpringSlider';

export function DriveArea() {
  const mode = useBoatStore((state) => state.mode);
  const axes = useBoatStore((state) => state.axes);
  const setAxes = useBoatStore((state) => state.setAxes);
  const handleJoystick = useCallback((x: number, y: number) => setAxes({ a: x, b: y }), [setAxes]);

  return (
    <section aria-label="操縦" className="min-h-0 flex-1 rounded-xl bg-card p-2">
      {mode === 'joystick' && <Joystick onChange={handleJoystick} />}
      {mode === 'tank' && (
        <div className="flex h-full justify-around">
          <SpringSlider label="左" orientation="vertical" value={axes.a} onChange={(a) => setAxes({ a })} />
          <SpringSlider label="右" orientation="vertical" value={axes.b} onChange={(b) => setAxes({ b })} />
        </div>
      )}
      {mode === 'throttleRudder' && (
        <div className="flex h-full items-center gap-4 portrait:flex-col landscape:justify-between">
          <div className="min-h-0 portrait:flex-1 landscape:h-full">
            <SpringSlider label="スロットル" orientation="vertical" value={axes.b} onChange={(b) => setAxes({ b })} />
          </div>
          {/* 横持ちでは右手の親指が届くよう右半分に置く */}
          <div className="w-full min-w-0 landscape:w-1/2">
            <SpringSlider label="舵" orientation="horizontal" value={axes.a} onChange={(a) => setAxes({ a })} />
          </div>
        </div>
      )}
    </section>
  );
}
