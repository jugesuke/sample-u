import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    ble: {
      frames: [number, number][];
      maxConcurrentWrites: number;
      writeDelayMs: number;
      dropConnection: () => void;
    };
  }
}

// 実機の代わりに Web Bluetooth をモックする
async function installBluetoothMock(page: Page) {
  await page.addInitScript(() => {
    const ble: Window['ble'] = {
      frames: [],
      maxConcurrentWrites: 0,
      writeDelayMs: 0,
      dropConnection: () => {},
    };
    let concurrent = 0;
    const characteristic = {
      writeValueWithoutResponse: async (value: Int8Array) => {
        concurrent += 1;
        ble.maxConcurrentWrites = Math.max(ble.maxConcurrentWrites, concurrent);
        ble.frames.push([value[0], value[1]]);
        await new Promise((resolve) => setTimeout(resolve, ble.writeDelayMs));
        concurrent -= 1;
      },
    };
    const service = { getCharacteristic: async () => characteristic };
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
  const left = await center(page.getByRole('slider', { name: '左' }));
  const right = await center(page.getByRole('slider', { name: '右' }));

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
  await expect(linkStatus(page)).toHaveText('切断されました');

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
      await page.getByRole('button', { name: mode }).click();
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
  expect(await size(page.getByRole('button', { name: '船を選び直す' }))).toEqual(connect);
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
