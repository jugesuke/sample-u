import { bluetoothSupport } from '../lib/boatLink';
import { boatLink, useBoatStore } from '../store';

const STATUS_LABEL = {
  idle: '未接続',
  connecting: '接続中…',
  connected: '接続済み',
  disconnected: '切断されました',
} as const;

// 状態が変わってもサイズが変わらないよう、幅と枠線の太さを揃える
const buttonBase = 'min-h-11 w-28 whitespace-nowrap rounded-lg border font-bold';
const primaryButton = `${buttonBase} border-accent bg-accent text-white disabled:opacity-50`;
const secondaryButton = `${buttonBase} border-ink`;

export function ConnectionBar() {
  const status = useBoatStore((state) => state.status);
  const error = useBoatStore((state) => state.error);
  const support = bluetoothSupport();

  if (support !== 'ok') {
    return (
      <p role="alert" className="rounded-lg bg-stop p-3 font-bold text-white">
        {support === 'insecure'
          ? 'Bluetoothを使うにはhttpsでこのページを開いてください。'
          : 'このブラウザはWeb Bluetoothに対応していません。AndroidのChromeで開いてください。'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-2 font-bold" role="status" aria-label="接続状態">
        <span
          aria-hidden
          className={`size-3 rounded-full ${status === 'connected' ? 'bg-accent' : 'bg-signal'}`}
        />
        {STATUS_LABEL[status]}
      </span>
      <div className="ml-auto flex gap-2">
        {status === 'connected' && (
          <button className={secondaryButton} onClick={() => boatLink.disconnect()}>
            切断
          </button>
        )}
        {status === 'idle' && (
          <button className={primaryButton} onClick={() => void boatLink.choose()}>
            船に接続
          </button>
        )}
        {status === 'connecting' && (
          <button className={primaryButton} disabled>
            接続中…
          </button>
        )}
        {status === 'disconnected' && (
          <>
            <button className={secondaryButton} onClick={() => void boatLink.choose()}>
              船を選び直す
            </button>
            <button className={primaryButton} onClick={() => void boatLink.connect()}>
              再接続
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="w-full text-sm font-bold text-stop">
          接続できませんでした: {error}
        </p>
      )}
    </div>
  );
}
