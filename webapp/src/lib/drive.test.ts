import { describe, expect, it } from 'vitest';
import { applyBalance, axesToCommand, encodeFrame, limitCommand, mix } from './drive';

describe('mix', () => {
  it('前進は左右同じ出力になる', () => {
    expect(mix(0, 80)).toEqual({ left: 80, right: 80 });
  });

  it('右旋回は左モーターを速くする', () => {
    expect(mix(30, 50)).toEqual({ left: 80, right: 20 });
  });

  it('真横に倒すとその場で旋回する', () => {
    expect(mix(100, 0)).toEqual({ left: 100, right: -100 });
    expect(mix(-100, 0)).toEqual({ left: -100, right: 100 });
  });

  it('上限を超えるときは左右の比率を保って縮める', () => {
    expect(mix(100, 100)).toEqual({ left: 100, right: 0 });
    const scaled = mix(50, 100);
    expect(scaled.left).toBe(100);
    expect(scaled.right).toBeCloseTo(33.33, 1);
  });
});

describe('axesToCommand', () => {
  it('tankは左右をそのまま使う', () => {
    expect(axesToCommand('tank', { a: 40, b: -60 })).toEqual({ left: 40, right: -60 });
  });

  it('joystickとthrottleRudderはミキシングする', () => {
    expect(axesToCommand('joystick', { a: 10, b: 20 })).toEqual({ left: 30, right: 10 });
    expect(axesToCommand('throttleRudder', { a: 10, b: 20 })).toEqual({ left: 30, right: 10 });
  });
});

describe('applyBalance', () => {
  it('0なら変えない', () => {
    expect(applyBalance({ left: 80, right: -60 }, 0)).toEqual({ left: 80, right: -60 });
  });

  it('正なら右、負なら左だけを弱める', () => {
    expect(applyBalance({ left: 100, right: 100 }, 10)).toEqual({ left: 100, right: 90 });
    expect(applyBalance({ left: 100, right: 100 }, -20)).toEqual({ left: 80, right: 100 });
  });

  it('後進でも同じ割合で弱める', () => {
    expect(applyBalance({ left: -100, right: -100 }, 10)).toEqual({ left: -100, right: -90 });
  });
});

describe('limitCommand', () => {
  it('最大出力を掛けて整数にする', () => {
    expect(limitCommand({ left: 100, right: -50 }, 60)).toEqual({ left: 60, right: -30 });
    expect(limitCommand({ left: 33.33, right: 0 }, 100)).toEqual({ left: 33, right: 0 });
  });

  it('範囲外は ±100 に収める', () => {
    expect(limitCommand({ left: 150, right: -150 }, 100)).toEqual({ left: 100, right: -100 });
  });

  it('-0 を返さない', () => {
    expect(Object.is(limitCommand({ left: -0.1, right: 0 }, 100).left, 0)).toBe(true);
  });
});

describe('encodeFrame', () => {
  it('通し番号と左右の指令を4バイトにする', () => {
    const frame = encodeFrame(0x1234, { left: -100, right: 100 });
    expect(Array.from(frame)).toEqual([0x34, 0x12, 0x9c, 0x64]);
  });
});
