import { useState } from 'react';
import { BalanceSlider } from './components/BalanceSlider';
import { ConnectionBar } from './components/ConnectionBar';
import { DriveArea } from './components/DriveArea';
import { LogPanel } from './components/LogPanel';
import { OutputMeters } from './components/OutputMeters';
import { SettingsPanel } from './components/SettingsPanel';
import { SettingsSummary } from './components/SettingsSummary';
import { StopButton } from './components/StopButton';
import { useSessionGuards } from './lib/useSessionGuards';
import { useBoatStore } from './store';

// 横画面では操作部を左右に置き、接続やSTOPなどは2列目にまとめる
const LANDSCAPE_COLUMNS = {
  joystick: 'landscape:grid-cols-[1fr_15rem]',
  joystickRight: 'landscape:grid-cols-[15rem_1fr]',
  tank: 'landscape:grid-cols-[1fr_15rem_1fr]',
  throttleRudder: 'landscape:grid-cols-[auto_15rem_1fr]',
} as const;

export function App() {
  useSessionGuards();
  const [screen, setScreen] = useState<'drive' | 'log' | 'settings'>('drive');
  const mode = useBoatStore((state) => state.mode);
  const joystickSide = useBoatStore((state) => state.joystickSide);
  const showBalance = useBoatStore((state) => state.showBalance);
  const resetAxes = useBoatStore((state) => state.resetAxes);

  const open = (next: 'log' | 'settings') => {
    resetAxes(); // 別の画面では操作部が消えるので、動いたままにしない
    setScreen(next);
  };
  const close = () => setScreen('drive');

  if (screen === 'log') return <LogPanel onClose={close} />;
  if (screen === 'settings') return <SettingsPanel onClose={close} />;

  const joystickOnRight = mode === 'joystick' && joystickSide === 'right';
  const columns = LANDSCAPE_COLUMNS[joystickOnRight ? 'joystickRight' : mode];
  const panelColumn = joystickOnRight ? 'landscape:col-start-1' : 'landscape:col-start-2';

  return (
    <main
      className={`flex h-dvh flex-col gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] landscape:grid landscape:grid-rows-[auto_1fr] landscape:p-2 ${columns}`}
    >
      <header className={`flex flex-col gap-2 landscape:row-start-1 landscape:gap-1.5 ${panelColumn}`}>
        <ConnectionBar onOpenLog={() => open('log')} />
        <OutputMeters />
        {showBalance && <BalanceSlider />}
      </header>
      <DriveArea />
      <footer className={`flex items-center gap-3 landscape:row-start-2 landscape:flex-col landscape:items-stretch landscape:gap-2 landscape:self-end ${panelColumn}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2 landscape:flex-none">
          <SettingsSummary />
          <button
            className="min-h-11 w-16 shrink-0 whitespace-nowrap rounded-lg border border-ink font-bold"
            onClick={() => open('settings')}
          >
            設定
          </button>
        </div>
        <StopButton />
      </footer>
    </main>
  );
}
