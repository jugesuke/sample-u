import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    ble: {
      frames: [number, number][];
      seqs: number[];
      maxConcurrentWrites: number;
      writeDelayMs: number;
      dropConnection: () => void;
      emitLog: (text: string) => void;
    };
  }
}

// 実機の代わりに Web Bluetooth をモックする
async function installBluetoothMock(page: Page) {
  await page.addInitScript(() => {
    const ble: Window['ble'] = {
      frames: [],
      seqs: [],
      maxConcurrentWrites: 0,
      writeDelayMs: 0,
      dropConnection: () => {},
      emitLog: () => {},
    };
    let concurrent = 0;
    const characteristic = {
      writeValueWithoutResponse: async (value: Uint8Array) => {
        concurrent += 1;
        ble.maxConcurrentWrites = Math.max(ble.maxConcurrentWrites, concurrent);
        ble.seqs.push(value[0] | (value[1] << 8));
        ble.frames.push([(value[2] << 24) >> 24, (value[3] << 24) >> 24]);
        await new Promise((resolve) => setTimeout(resolve, ble.writeDelayMs));
        concurrent -= 1;
      },
    };
    const logCharacteristic = Object.assign(new EventTarget(), {
      value: undefined as DataView | undefined,
      startNotifications: async () => {},
    });
    ble.emitLog = (text) => {
      logCharacteristic.value = new DataView(new TextEncoder().encode(text).buffer);
      logCharacteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    };
    const service = {
      getCharacteristic: async (uuid: string) =>
        uuid.startsWith('7c1f0a12') ? logCharacteristic : characteristic,
    };
    const server = { getPrimaryService: async () => service };
    const device = new EventTarget() as EventTarget & { gatt: unknown };
    const drop = () => device.dispatchEvent(new Event('gattserverdisconnected'));
    device.gatt = { connect: async () => server, disconnect: drop };
    ble.dropConnection = drop;
    window.ble = ble;
    Object.defineProperty(navigator, 'bluetooth', {
      value: { requestDevice: async () => device },
    });
  });
}

const linkStatus = (page: Page) => page.getByRole('status', { name: '接続状態' });

async function openConnected(page: Page) {
  await installBluetoothMock(page);
  await page.goto('/');
  await page.getByRole('button', { name: '船に接続' }).click();
  await expect(linkStatus(page)).toHaveText('接続済み');
}

const latestFrame = (page: Page) => page.evaluate(() => window.ble.frames.at(-1));
const frameCount = (page: Page) => page.evaluate(() => window.ble.frames.length);

async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// 両手同時操作を確認するため、CDPで実際のマルチタッチを送る
type TouchPoint = { x: number; y: number; id: number };
async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  touchPoints: TouchPoint[],
) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
}

async function waitForOutput(page: Page, left: number, right: number) {
  await expect(page.getByRole('status', { name: 'Lモーター出力' })).toHaveText(String(left));
  await expect(page.getByRole('status', { name: 'Rモーター出力' })).toHaveText(String(right));
  await expect.poll(() => latestFrame(page)).toEqual([left, right]);
}

async function pushJoystickForward(page: Page, cdp: CDPSession) {
  const { x, y } = await center(page.getByTestId('joystick'));
  await touch(cdp, 'touchStart', [{ x, y, id: 1 }]);
  await touch(cdp, 'touchMove', [{ x, y: y - 300, id: 1 }]);
  return { x, y };
}

test('Web Bluetooth非対応のブラウザでは案内を表示する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', { value: undefined });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('AndroidのChrome');
  await expect(page.getByRole('button', { name: '船に接続' })).toHaveCount(0);
});

test('接続中は停止フレームを定期的に送り、書き込みは重ならない', async ({ page }) => {
  await openConnected(page);
  await page.evaluate(() => {
    window.ble.writeDelayMs = 120;
    window.ble.frames.length = 0;
  });
  await page.waitForTimeout(1000);
  expect(await frameCount(page)).toBeGreaterThanOrEqual(4);
  expect(await page.evaluate(() => window.ble.maxConcurrentWrites)).toBe(1);
  expect(await latestFrame(page)).toEqual([0, 0]);
});

test('ジョイスティック: 前に倒すと前進し、真横でその場旋回、離すと0に戻る', async ({ page, context }) => {
  await openConnected(page);
  const cdp = await context.newCDPSession(page);
  const { x, y } = await pushJoystickForward(page, cdp);
  await waitForOutput(page, 100, 100);

  await touch(cdp, 'touchMove', [{ x: x + 300, y, id: 1 }]);
  await waitForOutput(page, 100, -100);

  await touch(cdp, 'touchEnd', []);
  await waitForOutput(page, 0, 0);
});

test('左右独立: 両手で同時に操作でき、離すと0に戻る', async ({ page, context }) => {
  await openConnected(page);
  await page.getByRole('button', { name: '左右独立' }).click();
  const cdp = await context.newCDPSession(page);
  const left = await center(page.getByRole('slider', { name: '左', exact: true }));
  const right = await center(page.getByRole('slider', { name: '右', exact: true }));

  const leftTop = { x: left.x, y: left.y - 2000, id: 1 };
  const rightBottom = { x: right.x, y: right.y + 2000, id: 2 };
  await touch(cdp, 'touchStart', [{ ...left, id: 1 }]);
  await touch(cdp, 'touchStart', [{ ...left, id: 1 }, { ...right, id: 2 }]);
  await touch(cdp, 'touchMove', [leftTop, rightBottom]);
  await waitForOutput(page, 100, -100);

  // 片手だけ離しても、もう片方は保持される(CDPのtouchEndは指定した指だけを離す)
  await touch(cdp, 'touchEnd', [rightBottom]);
  await waitForOutput(page, 100, 0);

  await touch(cdp, 'touchEnd', []);
  await waitForOutput(page, 0, 0);
});

test('スロットル+舵: 横持ちで両手操作でき、ミキシングされる', async ({ page, context }) => {
  await page.setViewportSize({ width: 839, height: 412 });
  await openConnected(page);
  await page.getByRole('button', { name: 'スロットル+舵' }).click();
  const cdp = await context.newCDPSession(page);
  const throttle = await center(page.getByRole('slider', { name: 'スロットル' }));
  const rudder = await center(page.getByRole('slider', { name: '舵' }));

  await touch(cdp, 'touchStart', [{ ...throttle, id: 1 }]);
  await touch(cdp, 'touchStart', [{ ...throttle, id: 1 }, { ...rudder, id: 2 }]);
  await touch(cdp, 'touchMove', [
    { x: throttle.x, y: throttle.y - 2000, id: 1 },
    { x: rudder.x + 2000, y: rudder.y, id: 2 },
  ]);
  await waitForOutput(page, 100, 0);

  await touch(cdp, 'touchEnd', []);
  await waitForOutput(page, 0, 0);
});

test('最大出力で送信値が制限される', async ({ page, context }) => {
  await openConnected(page);
  await page.getByRole('slider', { name: '最大出力' }).focus();
  await page.keyboard.press('Home'); // 最小の10%にする
  await expect(page.getByText('最大 10%')).toBeVisible();

  const cdp = await context.newCDPSession(page);
  await pushJoystickForward(page, cdp);
  await waitForOutput(page, 10, 10);
  await touch(cdp, 'touchEnd', []);
});

test('STOPは解除するまで0を送り続ける', async ({ page, context }) => {
  await openConnected(page);
  const cdp = await context.newCDPSession(page);
  const { x, y } = await pushJoystickForward(page, cdp);
  await waitForOutput(page, 100, 100);

  await page.getByRole('button', { name: 'STOP' }).dispatchEvent('click');
  await waitForOutput(page, 0, 0);
  await touch(cdp, 'touchMove', [{ x, y: y - 299, id: 1 }]);
  await page.waitForTimeout(150);
  expect(await latestFrame(page)).toEqual([0, 0]);

  await touch(cdp, 'touchEnd', []);
  await page.getByRole('button', { name: '停止中(解除)' }).click();
  await expect(page.getByRole('button', { name: 'STOP' })).toBeVisible();
});

test('切断されると表示して送信を止め、再接続できる', async ({ page }) => {
  await openConnected(page);
  await page.evaluate(() => window.ble.dropConnection());
  await expect(linkStatus(page)).toHaveText('切断済み');

  const count = await frameCount(page);
  await page.waitForTimeout(200);
  expect(await frameCount(page)).toBe(count);

  await page.getByRole('button', { name: '再接続' }).click();
  await expect(linkStatus(page)).toHaveText('接続済み');
  await expect.poll(() => frameCount(page)).toBeGreaterThan(count);
});

test('画面が隠れると停止値を1回送って送信を止め、戻ると再開する', async ({ page, context }) => {
  await openConnected(page);
  const cdp = await context.newCDPSession(page);
  await pushJoystickForward(page, cdp);
  await waitForOutput(page, 100, 100);

  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'visibilityState', { value, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);

  await setVisibility('hidden');
  await expect.poll(() => latestFrame(page)).toEqual([0, 0]);
  const count = await frameCount(page);
  await page.waitForTimeout(200);
  expect(await frameCount(page)).toBe(count);

  await touch(cdp, 'touchEnd', []);
  await setVisibility('visible');
  await expect.poll(() => frameCount(page)).toBeGreaterThan(count);
});

test('選んだモードと最大出力は再読み込み後も残る', async ({ page }) => {
  await installBluetoothMock(page);
  await page.goto('/');
  await page.getByRole('button', { name: '左右独立' }).click();
  await page.getByRole('slider', { name: '最大出力' }).focus();
  await page.keyboard.press('Home');
  await page.reload();
  await expect(page.getByRole('button', { name: '左右独立' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('最大 10%')).toBeVisible();
});

for (const { name, viewport } of [
  { name: 'portrait', viewport: { width: 412, height: 839 } },
  { name: 'landscape', viewport: { width: 839, height: 412 } },
]) {
  test(`全モードが画面に収まる (${name})`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await openConnected(page);
    for (const [index, mode] of ['スティック', '左右独立', 'スロットル+舵'].entries()) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight,
        main: document.querySelector('main')!.scrollHeight - window.innerHeight,
      }));
      expect(overflow).toEqual({ x: 0, y: 0, main: 0 });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath(`${name}-${index}.png`) });
    }
  });
}

// 本物のNoto Sans JPを読み込んでから文字幅を測る。読み込めなければ失敗する
async function expectTextFits(button: Locator) {
  await expect(button).toBeVisible();
  const result = await button.evaluate(async (element) => {
    const style = getComputedStyle(element);
    const faces = await document.fonts.load(
      `${style.fontWeight} ${style.fontSize} "Noto Sans JP"`,
      element.textContent ?? '',
    );
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      text: element.textContent,
      loaded: faces.length > 0 && faces.every((face) => face.status === 'loaded'),
      textWidth: range.getBoundingClientRect().width,
      available:
        element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    };
  });
  expect(result.loaded, `${result.text} のフォント`).toBe(true);
  expect(result.textWidth, `${result.text} の文字幅`).toBeLessThanOrEqual(result.available);
}

test('日本語フォントが読み込まれ、表示に使われる', async ({ page }) => {
  await openConnected(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain(
    'Noto Sans JP',
  );
  await expectTextFits(page.getByRole('button', { name: 'STOP' }));
});

test('状態が変わってもボタンのサイズは変わらない', async ({ page }) => {
  await installBluetoothMock(page);
  await page.goto('/');

  const size = async (button: Locator) => {
    await expectTextFits(button);
    const box = (await button.boundingBox())!;
    return { width: box.width, height: box.height };
  };

  const stop = await size(page.getByRole('button', { name: 'STOP' }));
  await page.getByRole('button', { name: 'STOP' }).click();
  expect(await size(page.getByRole('button', { name: '停止中(解除)' }))).toEqual(stop);
  await page.getByRole('button', { name: '停止中(解除)' }).click();

  const connect = await size(page.getByRole('button', { name: '船に接続' }));
  await page.getByRole('button', { name: '船に接続' }).click();
  expect(await size(page.getByRole('button', { name: '切断' }))).toEqual(connect);
  await page.evaluate(() => window.ble.dropConnection());
  expect(await size(page.getByRole('button', { name: '再接続' }))).toEqual(connect);
  expect(await size(page.getByRole('button', { name: '選び直す' }))).toEqual(connect);
});

for (const viewport of [
  { width: 360, height: 640 },
  { width: 640, height: 360 },
  { width: 412, height: 839 },
  { width: 839, height: 412 },
]) {
  test(`全ボタンの文字が収まり、画面からはみ出さない (${viewport.width}x${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await installBluetoothMock(page);
    await page.goto('/');

    const checkAll = async () => {
      for (const button of await page.getByRole('button').all()) {
        await expectTextFits(button);
      }
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.querySelector('main')!.scrollHeight - window.innerHeight,
      }));
      expect(overflow).toEqual({ x: 0, y: 0 });
    };

    await checkAll(); // 未接続
    await page.getByRole('button', { name: 'STOP' }).click();
    await checkAll(); // 停止中
    await page.getByRole('button', { name: '停止中(解除)' }).click();
    await page.getByRole('button', { name: '船に接続' }).click();
    await checkAll(); // 接続済み
    await page.evaluate(() => window.ble.dropConnection());
    await checkAll(); // 切断後
  });
}

test('船のログは分割されて届いても1行で表示され、保存とクリアができる', async ({ page }) => {
  await openConnected(page);
  await page.evaluate(() => {
    window.ble.emitLog('WARN 1000 failsafe sto');
    window.ble.emitLog('p: no command\nINFO 2000 ');
    window.ble.emitLog('commands active\n');
  });

  await page.getByRole('button', { name: 'ログ' }).click();
  const log = page.getByRole('log', { name: '動作ログ' });
  await expect(log).toContainText('WARN  boat 1000 failsafe stop: no command');
  await expect(log).toContainText('INFO  boat 2000 commands active');
  await expect(log).toContainText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO  app  接続完了/);

  for (const name of ['保存', 'クリア', '閉じる']) {
    await expectTextFits(page.getByRole('button', { name }));
  }

  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = (blob) => {
      (window as unknown as { savedLog: Blob }).savedLog = blob as Blob;
      return original.call(URL, blob);
    };
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '保存' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^boat-log-[\dT-]+Z\.txt$/);
  const saved = await page.evaluate(() =>
    (window as unknown as { savedLog: Blob }).savedLog.text(),
  );
  expect(saved).toContain('boat 1000 failsafe stop: no command');
  expect(saved).toContain('DEBUG app  tx seq='); // 表示の絞り込みに関係なく全行を保存する

  await page.getByRole('button', { name: 'クリア' }).click();
  await expect(log).toContainText('ログはまだありません');
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(linkStatus(page)).toHaveText('接続済み');
});

test('ログ画面を開くと操作は中立に戻り、受信は続く', async ({ page, context }) => {
  await openConnected(page);
  const cdp = await context.newCDPSession(page);
  await pushJoystickForward(page, cdp);
  await waitForOutput(page, 100, 100);

  await page.getByRole('button', { name: 'ログ' }).dispatchEvent('click');
  await expect.poll(() => latestFrame(page)).toEqual([0, 0]);
  await touch(cdp, 'touchEnd', []);

  await page.evaluate(() => window.ble.emitLog('INFO 3000 while open\n'));
  await expect(page.getByRole('log', { name: '動作ログ' })).toContainText('3000 while open');
});

test('ログは再読み込み後も残り、クリアすると消える', async ({ page }) => {
  await openConnected(page);
  await page.evaluate(() => window.ble.emitLog('INFO 4000 before reload\n'));
  await page.reload();

  await page.getByRole('button', { name: 'ログ' }).click();
  const log = page.getByRole('log', { name: '動作ログ' });
  await expect(log).toContainText('boat 4000 before reload');

  await page.getByRole('button', { name: 'クリア' }).click();
  await expect(log).toContainText('ログはまだありません');
  await page.reload();
  await page.getByRole('button', { name: 'ログ' }).click();
  await expect(log).not.toContainText('4000 before reload');
});

test('送信の通し番号が連続し、操作入力とともにDEBUGログに残る', async ({ page, context }) => {
  await openConnected(page);
  const cdp = await context.newCDPSession(page);
  await pushJoystickForward(page, cdp);
  await waitForOutput(page, 100, 100);
  await touch(cdp, 'touchEnd', []);
  await waitForOutput(page, 0, 0);

  const seqs = await page.evaluate(() => window.ble.seqs);
  expect(seqs.length).toBeGreaterThan(1);
  expect(seqs).toEqual(seqs.map((_, index) => seqs[0] + index));

  await page.getByRole('button', { name: 'ログ' }).click();
  const log = page.getByRole('log', { name: '動作ログ' });
  await expect(log).not.toContainText(' tx seq=');
  await page.getByLabel('表示レベル').selectOption('DEBUG');
  await expect(log).toContainText(/DEBUG app {2}tx seq=\d+ L=100 R=100 mode=joystick a=0 b=100 max=100 bal=0 stop=0 n=\d+ skip=0 fail=0/);
  await expect(log).toContainText(/tx seq=\d+ L=0 R=0 mode=joystick a=0 b=0/);
});

test('書き込みが詰まるとWARNとして記録される', async ({ page }) => {
  await openConnected(page);
  await page.evaluate(() => {
    window.ble.writeDelayMs = 300;
  });
  await page.getByRole('button', { name: 'ログ' }).click();
  await expect(page.getByRole('log', { name: '動作ログ' })).toContainText(/WARN {2}app {2}tx seq=\d+ .* skip=[1-9]/);
});

test('Pixel 7aの幅では切断後も接続まわりが1行に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await openConnected(page);
  await page.evaluate(() => window.ble.dropConnection());
  await expect(linkStatus(page)).toHaveText('切断済み');

  const tops = await Promise.all(
    ['ログ', '選び直す', '再接続'].map(async (name) => {
      const button = page.getByRole('button', { name });
      await expectTextFits(button);
      return (await button.boundingBox())!.y;
    }),
  );
  expect(new Set(tops).size).toBe(1);
});

for (const { mode, label, length, axis } of [
  { mode: '左右独立', label: '左', length: 320, axis: 'height' },
  { mode: 'スロットル+舵', label: 'スロットル', length: 320, axis: 'height' },
  { mode: 'スロットル+舵', label: '舵', length: 400, axis: 'width' },
] as const) {
  test(`横画面でスライダーを長く使える (${mode}: ${label})`, async ({ page }) => {
    await page.setViewportSize({ width: 839, height: 412 });
    await installBluetoothMock(page);
    await page.goto('/');
    await page.getByRole('button', { name: mode }).click();
    const track = page.getByRole('slider', { name: label, exact: true }).locator('xpath=ancestor::*[@data-orientation][last()]');
    const box = (await track.boundingBox())!;
    expect(box[axis]).toBeGreaterThanOrEqual(length);
  });
}

test('横画面のジョイスティックは画面の高さを使う', async ({ page }) => {
  await page.setViewportSize({ width: 839, height: 412 });
  await installBluetoothMock(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'スティック', exact: true }).click();
  const box = (await page.getByTestId('joystick').boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(370);
  expect(box.width).toBeGreaterThanOrEqual(500);
});

test('横画面のスティックを左右に切り替えられ、移動後も操作でき、選択が残る', async ({ page, context }) => {
  await page.setViewportSize({ width: 839, height: 412 });
  await openConnected(page);
  const joystick = page.getByTestId('joystick');
  const stop = page.getByRole('button', { name: 'STOP' });

  expect((await joystick.boundingBox())!.x).toBeLessThan((await stop.boundingBox())!.x);

  await page.getByRole('button', { name: 'スティックを右へ' }).click();
  await expectTextFits(page.getByRole('button', { name: 'スティックを左へ' }));
  expect((await joystick.boundingBox())!.x).toBeGreaterThan((await stop.boundingBox())!.x);

  const cdp = await context.newCDPSession(page);
  await pushJoystickForward(page, cdp);
  await waitForOutput(page, 100, 100);
  await touch(cdp, 'touchEnd', []);
  await waitForOutput(page, 0, 0);

  await page.reload();
  await expect(page.getByRole('button', { name: 'スティックを左へ' })).toBeVisible();
});

test('スティックの左右切替は縦画面と他のモードでは出ない', async ({ page }) => {
  await installBluetoothMock(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^スティックを/ })).toBeHidden();

  await page.setViewportSize({ width: 839, height: 412 });
  await expect(page.getByRole('button', { name: /^スティックを/ })).toBeVisible();
  await page.getByRole('button', { name: '左右独立' }).click();
  await expect(page.getByRole('button', { name: /^スティックを/ })).toBeHidden();
});

test('左右バランスで片側だけ弱まり、設定が残り、0で戻せる', async ({ page, context }) => {
  await openConnected(page);
  await page.getByRole('slider', { name: '左右バランス' }).focus();
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('status', { name: '左右の出力比' })).toHaveText('L100 R90');

  const cdp = await context.newCDPSession(page);
  await pushJoystickForward(page, cdp);
  await waitForOutput(page, 100, 90);
  await touch(cdp, 'touchEnd', []);
  await waitForOutput(page, 0, 0);

  await page.reload();
  await expect(page.getByRole('status', { name: '左右の出力比' })).toHaveText('L100 R90');
  await page.getByRole('button', { name: '左右バランスを中央に戻す' }).click();
  await expect(page.getByRole('status', { name: '左右の出力比' })).toHaveText('L100 R100');
});
