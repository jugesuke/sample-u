import { useState } from 'react';
import { BalanceSlider } from './components/BalanceSlider';
import { ConnectionBar } from './components/ConnectionBar';
import { DriveArea } from './components/DriveArea';
import { JoystickSideToggle } from './components/JoystickSideToggle';
import { LogPanel } from './components/LogPanel';
import { MaxOutputSlider } from './components/MaxOutputSlider';
import { ModeTabs } from './components/ModeTabs';
import { OutputMeters } from './components/OutputMeters';
import { StopButton } from './components/StopButton';
import { useSessionGuards } from './lib/useSessionGuards';
import { useBoatStore } from './store';

// 横画面では操作部を左右に置き、接続やSTOPなどは2列目にまとめる
const LANDSCAPE_COLUMNS = {
  joystick: 'landscape:grid-cols-[1fr_17rem]',
  joystickRight: 'landscape:grid-cols-[17rem_1fr]',
  tank: 'landscape:grid-cols-[1fr_17rem_1fr]',
  throttleRudder: 'landscape:grid-cols-[auto_17rem_1fr]',
} as const;

export function App() {
  useSessionGuards();
  const [logOpen, setLogOpen] = useState(false);
  const mode = useBoatStore((state) => state.mode);
  const joystickSide = useBoatStore((state) => state.joystickSide);
  const resetAxes = useBoatStore((state) => state.resetAxes);

  const openLog = () => {
    resetAxes(); // ログ画面では操作部が消えるので、動いたままにしない
    setLogOpen(true);
  };

  if (logOpen) return <LogPanel onClose={() => setLogOpen(false)} />;

  const joystickOnRight = mode === 'joystick' && joystickSide === 'right';
  const columns = LANDSCAPE_COLUMNS[joystickOnRight ? 'joystickRight' : mode];
  const panelColumn = joystickOnRight ? 'landscape:col-start-1' : 'landscape:col-start-2';

  return (
    <main
      className={`flex h-dvh flex-col gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] landscape:grid landscape:grid-rows-[auto_1fr] landscape:p-2 ${columns}`}
    >
      <header className={`flex flex-col gap-2 landscape:row-start-1 landscape:gap-1.5 ${panelColumn}`}>
        <ConnectionBar onOpenLog={openLog} />
        <ModeTabs />
        <OutputMeters />
        <BalanceSlider />
        <JoystickSideToggle />
      </header>
      <DriveArea />
      <footer className={`flex items-center gap-3 landscape:row-start-2 landscape:flex-col landscape:items-stretch landscape:gap-2 landscape:self-end ${panelColumn}`}>
        <MaxOutputSlider />
        <StopButton />
      </footer>
    </main>
  );
}
