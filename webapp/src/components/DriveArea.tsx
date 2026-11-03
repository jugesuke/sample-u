import { useCallback } from 'react';
import { useBoatStore } from '../store';
import { Joystick } from './Joystick';
import { SpringSlider } from './SpringSlider';

// 縦画面では1枚のカードにまとめ、横画面では操作部ごとに左右のカードへ分ける
const portraitCard = 'portrait:rounded-xl portrait:bg-card portrait:p-2';
const landscapeCard = 'landscape:rounded-xl landscape:bg-card landscape:p-2';
const leftPane = `${landscapeCard} landscape:col-start-1 landscape:row-span-2 landscape:row-start-1`;
const rightPane = `${landscapeCard} landscape:col-start-3 landscape:row-span-2 landscape:row-start-1`;
const joystickRightPane = `${landscapeCard} landscape:col-start-2 landscape:row-span-2 landscape:row-start-1`;

export function DriveArea() {
  const mode = useBoatStore((state) => state.mode);
  const joystickSide = useBoatStore((state) => state.joystickSide);
  const axes = useBoatStore((state) => state.axes);
  const setAxes = useBoatStore((state) => state.setAxes);
  const handleJoystick = useCallback((x: number, y: number) => setAxes({ a: x, b: y }), [setAxes]);

  if (mode === 'joystick') {
    return (
      <section
        aria-label="操縦"
        className={`min-h-0 flex-1 ${portraitCard} ${joystickSide === 'right' ? joystickRightPane : leftPane}`}
      >
        {/* 位置が変わるので作り直す。nipplejsは生成時の座標を基準にする */}
        <Joystick key={joystickSide} onChange={handleJoystick} />
      </section>
    );
  }

  if (mode === 'tank') {
    return (
      <section aria-label="操縦" className={`flex min-h-0 flex-1 justify-around landscape:contents ${portraitCard}`}>
        <div className={`flex justify-center ${leftPane}`}>
          <SpringSlider label="左" orientation="vertical" value={axes.a} onChange={(a) => setAxes({ a })} />
        </div>
        <div className={`flex justify-center ${rightPane}`}>
          <SpringSlider label="右" orientation="vertical" value={axes.b} onChange={(b) => setAxes({ b })} />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="操縦" className={`flex min-h-0 flex-1 flex-col gap-4 landscape:contents ${portraitCard}`}>
      <div className={`flex min-h-0 flex-1 justify-center ${leftPane}`}>
        <SpringSlider label="スロットル" orientation="vertical" value={axes.b} onChange={(b) => setAxes({ b })} />
      </div>
      <div className={`flex items-center ${rightPane}`}>
        <SpringSlider label="舵" orientation="horizontal" value={axes.a} onChange={(a) => setAxes({ a })} />
      </div>
    </section>
  );
}
