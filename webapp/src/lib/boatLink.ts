import { COMMAND_CHAR_UUID, SEND_INTERVAL_MS, SERVICE_UUID } from './protocol';

export type LinkStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

type Frame = Int8Array<ArrayBuffer>;

export function bluetoothSupport(): 'ok' | 'insecure' | 'unsupported' {
  if (!window.isSecureContext) return 'insecure';
  return navigator.bluetooth ? 'ok' : 'unsupported';
}

/** 船とのBLE接続と、指令の定期送信を担当する */
export class BoatLink {
  private device?: BluetoothDevice;
  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private timer?: number;
  private writing = false;
  private paused = false;

  constructor(
    private readonly nextFrame: () => Frame,
    private readonly stoppedFrame: Frame,
    private readonly onStatus: (status: LinkStatus, error?: string) => void,
  ) {}

  /** ブラウザの機器選択画面を開いて接続する。ボタン操作の中から呼ぶ必要がある */
  async choose(): Promise<void> {
    const previous = this.device;
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
      });
      previous?.removeEventListener('gattserverdisconnected', this.handleDisconnected);
      previous?.gatt?.disconnect();
      this.device = device;
      device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    } catch (error) {
      // 選択画面をキャンセルしたときは何も変えない
      if (error instanceof DOMException && error.name === 'NotFoundError') return;
      this.onStatus(previous ? 'disconnected' : 'idle', describeError(error));
      return;
    }
    await this.connect();
  }

  async connect(): Promise<void> {
    const gatt = this.device?.gatt;
    if (!gatt) return;
    this.onStatus('connecting');
    try {
      const server = await gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      this.characteristic = await service.getCharacteristic(COMMAND_CHAR_UUID);
      this.startSending();
      this.onStatus('connected');
    } catch (error) {
      this.stopSending();
      gatt.disconnect();
      this.onStatus('disconnected', describeError(error));
    }
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
  }

  /** 画面が隠れている間は送信を止める。ファーム側のタイムアウトでモーターも止まる */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) void this.write(this.stoppedFrame);
  }

  private readonly handleDisconnected = () => {
    this.stopSending();
    this.onStatus('disconnected');
  };

  private startSending(): void {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      if (!this.paused) void this.write(this.nextFrame());
    }, SEND_INTERVAL_MS);
  }

  private stopSending(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.characteristic = undefined;
  }

  // 同時に複数書き込むとGATTエラーになるため、前の書き込みが終わるまで次を送らない。
  // 飛ばした分は次の周期で最新値を送るので問題ない。
  private async write(frame: Frame): Promise<void> {
    if (this.writing || !this.characteristic) return;
    this.writing = true;
    try {
      await this.characteristic.writeValueWithoutResponse(frame);
    } catch (error) {
      // 接続が切れた場合は gattserverdisconnected で処理される
      console.warn('指令の送信に失敗しました', error);
    } finally {
      this.writing = false;
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
