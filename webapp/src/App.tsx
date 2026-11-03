import { useState } from 'react';
import { ConnectionBar } from './components/ConnectionBar';
import { DriveArea } from './components/DriveArea';
import { LogPanel } from './components/LogPanel';
import { MaxOutputSlider } from './components/MaxOutputSlider';
import { ModeTabs } from './components/ModeTabs';
import { OutputMeters } from './components/OutputMeters';
import { StopButton } from './components/StopButton';
import { useSessionGuards } from './lib/useSessionGuards';
import { useBoatStore } from './store';

export function App() {
  useSessionGuards();
  const [logOpen, setLogOpen] = useState(false);
  const resetAxes = useBoatStore((state) => state.resetAxes);

  const openLog = () => {
    resetAxes(); // ログ画面では操作部が消えるので、動いたままにしない
    setLogOpen(true);
  };

  if (logOpen) return <LogPanel onClose={() => setLogOpen(false)} />;

  return (
    <main className="flex h-dvh flex-col gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] landscape:gap-1 landscape:p-2">
      <header className="flex flex-col gap-2 landscape:flex-row landscape:flex-wrap landscape:items-center landscape:gap-x-3 landscape:gap-y-1">
        <ConnectionBar onOpenLog={openLog} />
        <ModeTabs />
        <OutputMeters />
      </header>
      <DriveArea />
      <footer className="flex items-center gap-3">
        <MaxOutputSlider />
        <StopButton />
      </footer>
    </main>
  );
}
