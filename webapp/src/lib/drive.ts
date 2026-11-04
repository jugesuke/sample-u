import { COMMAND_MAX } from './protocol';

export type DriveMode = 'joystick' | 'tank' | 'throttleRudder';

/** 操作部の入力(-100〜100)。a/b の意味はモードで変わる(axesToCommand 参照) */
export interface Axes {
  a: number;
  b: number;
}

export interface MotorCommand {
  left: number;
  right: number;
}

export const STOPPED: MotorCommand = { left: 0, right: 0 };

export const MAX_BALANCE = 30;

/** 直進の調整。正なら右、負なら左のモーターを、その割合(%)だけ弱める */
export function applyBalance({ left, right }: MotorCommand, balance: number): MotorCommand {
  return {
    left: (left * (100 + Math.min(balance, 0))) / 100,
    right: (right * (100 - Math.max(balance, 0))) / 100,
  };
}

/** 旋回と前後進を左右モーターの出力へ変換する。どちらかが上限を超えるときは比率を保って縮める */
export function mix(turn: number, forward: number): MotorCommand {
  const left = forward + turn;
  const right = forward - turn;
  const scale = Math.max(1, Math.abs(left) / COMMAND_MAX, Math.abs(right) / COMMAND_MAX);
  return { left: left / scale, right: right / scale };
}

/** tank: a=左, b=右 / joystick・throttleRudder: a=旋回, b=前後進 */
export function axesToCommand(mode: DriveMode, axes: Axes): MotorCommand {
  return mode === 'tank' ? { left: axes.a, right: axes.b } : mix(axes.a, axes.b);
}

/** 最大出力(%)を掛けて整数へ丸める */
export function limitCommand(command: MotorCommand, maxOutput: number): MotorCommand {
  const limit = (value: number) => {
    const clamped = Math.max(-COMMAND_MAX, Math.min(COMMAND_MAX, value));
    return Math.round((clamped * maxOutput) / 100) + 0; // +0 で -0 を 0 にする
  };
  return { left: limit(command.left), right: limit(command.right) };
}

/** BLEフレーム: [uint16 通し番号(リトルエンディアン), int8 左, int8 右] */
export function encodeFrame(seq: number, command: MotorCommand): Uint8Array<ArrayBuffer> {
  return Uint8Array.of(seq & 0xff, seq >> 8, command.left, command.right);
}
