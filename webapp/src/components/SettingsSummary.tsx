import { applyBalance } from '../lib/drive';
import { useBoatStore } from '../store';

/** 設定画面に隠れた値で出力が絞られていることに、操縦画面で気づけるようにする */
export function SettingsSummary() {
  const maxOutput = useBoatStore((state) => state.maxOutput);
  const balance = useBoatStore((state) => state.balance);
  const showBalance = useBoatStore((state) => state.showBalance);
  const { left, right } = applyBalance({ left: 100, right: 100 }, balance);

  return (
    <output aria-label="現在の設定" className="min-w-0 flex-1 text-xs font-bold whitespace-nowrap">
      <span className="block">最大 {maxOutput}%</span>
      {!showBalance && <span className="block font-mono">L{left} R{right}</span>}
    </output>
  );
}
