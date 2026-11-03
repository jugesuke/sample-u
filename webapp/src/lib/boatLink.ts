import { encodeFrame, STOPPED, type MotorCommand } from './drive';
import { LineAssembler, parseBoatLine, type LogLevel, type LogSource } from './logStream';
import {
  COMMAND_CHAR_UUID,
  LOG_CHAR_UUID,
  REPORT_INTERVAL_MS,
  REPORT_MIN_INTERVAL_MS,
  SEND_INTERVAL_MS,
  SERVICE_UUID,
} from './protocol';

export type LinkStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

/** 送信する指令と、その元になった操作入力の説明 */
export interface Drive {
  command: MotorCommand;
  input: string;
}

export function bluetoothSupport(): 'ok' | 'insecure' | 'unsupported' {
  if (!window.isSecureContext) return 'insecure';
  return navigator.bluetooth ? 'ok' : 'unsupported';
}

/** 船とのBLE接続と、指令の定期送信を担当する */
export class BoatLink {
  private device?: BluetoothDevice;
  private characteristic?: BluetoothRemoteGATTCharacteristic;
  private logCharacteristic?: BluetoothRemoteGATTCharacteristic;
  private readonly logAssembler = new LineAssembler();
  private timer?: number;
  private writing = false;
  private paused = false;

  private seq = 0;
  private sent = 0; // 以下の3つは前回のtx行以降の集計
  private skipped = 0;
  private failed = 0;
  private lastError = '';
  private lastReportAt = 0;
  private lastReported = '';

  constructor(
    private readonly nextDrive: () => Drive,
    private readonly onStatus: (status: LinkStatus, error?: string) => void,
    private readonly onLog: (level: LogLevel, source: LogSource, text: string) => void,
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
      this.onLog('ERROR', 'app', `機器の選択に失敗: ${describeError(error)}`);
      return;
    }
    await this.connect();
  }

  async connect(): Promise<void> {
    const gatt = this.device?.gatt;
    if (!gatt) return;
    this.onStatus('connecting');
    this.onLog('INFO', 'app', `接続開始: ${this.device?.name ?? '名前なし'}`);
    try {
      const server = await gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      this.characteristic = await service.getCharacteristic(COMMAND_CHAR_UUID);
      await this.subscribeLog(service);
      this.startSending();
      this.onStatus('connected');
      this.onLog('INFO', 'app', '接続完了');
    } catch (error) {
      this.stopSending();
      gatt.disconnect();
      this.onStatus('disconnected', describeError(error));
      this.onLog('ERROR', 'app', `接続失敗: ${describeError(error)}`);
    }
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
  }

  /** 画面が隠れている間は送信を止める。ファーム側のタイムアウトでモーターも止まる */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.onLog('INFO', 'app', paused ? '画面非表示: 送信停止' : '画面表示: 送信再開');
    if (paused) void this.write(STOPPED);
  }

  private readonly handleDisconnected = () => {
    this.stopSending();
    this.onStatus('disconnected');
    this.onLog('INFO', 'app', '切断');
  };

  private readonly handleLogChunk = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    const chunk = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    for (const line of this.logAssembler.push(chunk)) {
      const { level, text } = parseBoatLine(line);
      this.onLog(level, 'boat', text);
    }
  };

  // ログは補助機能なので、購読できなくても操縦は続けられるようにする
  private async subscribeLog(service: BluetoothRemoteGATTService): Promise<void> {
    try {
      this.logCharacteristic = await service.getCharacteristic(LOG_CHAR_UUID);
      this.logCharacteristic.addEventListener('characteristicvaluechanged', this.handleLogChunk);
      await this.logCharacteristic.startNotifications();
    } catch (error) {
      this.onLog('WARN', 'app', `船のログを受信できません: ${describeError(error)}`);
    }
  }

  private startSending(): void {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), SEND_INTERVAL_MS);
  }

  private stopSending(): void {
    window.clearInterval(this.timer);
    this.timer = undefined;
    this.characteristic = undefined;
    this.logCharacteristic?.removeEventListener('characteristicvaluechanged', this.handleLogChunk);
    this.logCharacteristic = undefined;
    this.logAssembler.reset();
  }

  private tick(): void {
    if (this.paused) return;
    const drive = this.nextDrive();
    // 同時に複数書き込むとGATTエラーになるため、前の書き込みが終わるまで次を送らない。
    // 飛ばした分は次の周期で最新値を送るので問題ない。
    if (this.writing) this.skipped += 1;
    else void this.write(drive.command);
    this.report(drive);
  }

  private async write(command: MotorCommand): Promise<void> {
    if (this.writing || !this.characteristic) return;
    this.writing = true;
    this.seq = (this.seq + 1) & 0xffff;
    try {
      await this.characteristic.writeValueWithoutResponse(encodeFrame(this.seq, command));
      this.sent += 1;
    } catch (error) {
      // 接続が切れた場合は gattserverdisconnected で処理される
      this.failed += 1;
      this.lastError = describeError(error);
    } finally {
      this.writing = false;
    }
  }

  // 操作入力から送信までを1行に記録する。値が変わったときと、変化がなくても一定間隔で出す
  private report({ command, input }: Drive): void {
    const now = performance.now();
    const elapsed = now - this.lastReportAt;
    const values = `L=${command.left} R=${command.right} ${input}`;
    const changed = values !== this.lastReported;
    if (elapsed < REPORT_MIN_INTERVAL_MS || (!changed && elapsed < REPORT_INTERVAL_MS)) return;

    const problem = this.skipped > 0 || this.failed > 0;
    const error = this.lastError && ` error=${this.lastError}`;
    this.onLog(
      problem ? 'WARN' : 'DEBUG',
      'app',
      `tx seq=${this.seq} ${values} n=${this.sent} skip=${this.skipped} fail=${this.failed}${error}`,
    );
    this.lastReportAt = now;
    this.lastReported = values;
    this.sent = 0;
    this.skipped = 0;
    this.failed = 0;
    this.lastError = '';
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
