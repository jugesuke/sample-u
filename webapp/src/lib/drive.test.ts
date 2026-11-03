import { describe, expect, it } from 'vitest';
import { axesToCommand, encodeFrame, limitCommand, mix } from './drive';

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
  it('2バイトの符号付き整数にする', () => {
    const frame = encodeFrame({ left: -100, right: 100 });
    expect(frame.byteLength).toBe(2);
    expect(Array.from(new Uint8Array(frame.buffer))).toEqual([0x9c, 0x64]);
  });
});
