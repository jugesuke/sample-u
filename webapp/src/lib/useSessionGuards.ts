import { useEffect } from 'react';
import { boatLink, useBoatStore } from '../store';

/** 画面が隠れたら操作を中立に戻して送信を止める。接続中は画面消灯も防ぐ */
export function useSessionGuards(): void {
  const connected = useBoatStore((state) => state.status === 'connected');

  useEffect(() => {
    const handleVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      if (hidden) useBoatStore.getState().resetAxes();
      boatLink.setPaused(hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (!connected || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let active = true;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (active) lock = sentinel;
        else void sentinel.release();
      } catch {
        // 画面消灯の防止は補助機能なので、取得できなくても操縦は続けられる
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', acquire); // 画面が隠れると自動で解放される
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [connected]);
}
