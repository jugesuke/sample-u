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

/** BLEフレーム: [int8 左, int8 右] */
export function encodeFrame(command: MotorCommand): Int8Array<ArrayBuffer> {
  return Int8Array.of(command.left, command.right);
}
