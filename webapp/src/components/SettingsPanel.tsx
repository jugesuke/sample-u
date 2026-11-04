import type { ReactNode } from 'react';
import { useBoatStore } from '../store';
import { BalanceSlider } from './BalanceSlider';
import { JoystickSideToggle } from './JoystickSideToggle';
import { MaxOutputSlider } from './MaxOutputSlider';
import { ModeTabs } from './ModeTabs';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-card p-3">
      <h2 className="text-sm font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const mode = useBoatStore((state) => state.mode);
  const showBalance = useBoatStore((state) => state.showBalance);
  const setShowBalance = useBoatStore((state) => state.setShowBalance);

  return (
    <main className="flex h-dvh flex-col gap-2 overflow-y-auto p-3 pt-[max(0.75rem,env(safe-area-inset-top))] landscape:p-2">
      <header className="flex items-center justify-between">
        <h1 className="font-bold">設定</h1>
        <button
          className="min-h-11 w-20 whitespace-nowrap rounded-lg border border-ink font-bold"
          onClick={onClose}
        >
          閉じる
        </button>
      </header>
      <div className="flex flex-col gap-2 landscape:grid landscape:grid-cols-2 landscape:items-start">
        <div className="flex flex-col gap-2">
          <Section title="操作モード">
            <ModeTabs />
          </Section>
          {mode === 'joystick' && (
            <Section title="横画面のスティック位置">
              <JoystickSideToggle />
            </Section>
          )}
          <Section title="最大出力">
            <MaxOutputSlider />
          </Section>
        </div>
        <Section title="左右バランス">
          <BalanceSlider />
          <label className="flex min-h-11 items-center gap-2 font-bold">
            <input
              type="checkbox"
              className="size-6 shrink-0 accent-accent"
              checked={showBalance}
              onChange={(event) => setShowBalance(event.target.checked)}
            />
            操縦画面にも表示する
          </label>
        </Section>
      </div>
    </main>
  );
}
