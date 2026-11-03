# 船コントローラー

水中モーター2基で走る船(XIAO ESP32C3 + AM1025EA x2)を、AndroidのChromeからBluetoothで操縦するファームウェアとWebアプリです。仕様は [docs/SPEC.md](docs/SPEC.md) を参照してください。

| ディレクトリ | 内容 |
|---|---|
| [firmware/boat_controller/](firmware/boat_controller/) | Arduino IDE用スケッチ |
| [webapp/](webapp/) | Webアプリ(React + TypeScript、pnpm) |
| [docs/](docs/) | 仕様書 |

## ファームウェアの書き込み

1. `firmware/boat_controller/boat_controller.ino` を手元のPCへダウンロードします。Arduino IDEの決まりで、フォルダ名は `boat_controller` のままにしてください。
2. Arduino IDEの「追加のボードマネージャのURL」に次を追加します。
   ```
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```
3. ボードマネージャで `esp32`(Espressif Systems)の 3.3.12 をインストールします。BLEの実装がcoreのバージョンで変わるので、他のバージョンではコンパイルできないことがあります。
4. ボードに `XIAO_ESP32C3` を選びます。
5. XIAOを基板から外してUSBで接続し、書き込みます。USBと電池を同時につながないでください。

追加のライブラリは不要です。

## Webアプリ

### 開発

```sh
cd webapp
pnpm install
pnpm dev        # 開発サーバー
pnpm test       # 単体テスト
pnpm test:e2e   # 画面テスト(先に pnpm build が必要)
pnpm build      # 型チェックとビルド
```

画面テストはWeb Bluetoothをモックしています。初回は `pnpm exec playwright install chromium` が必要です。

### GitHub Pagesでの公開

Web Bluetoothはhttpsが必須なので、GitHub Pagesで配信します。

1. GitHubにリポジトリを作成してpushします。
2. リポジトリの Settings > Pages > Source を「GitHub Actions」にします。
3. `main` か `master` へのpushで [deploy-pages.yml](.github/workflows/deploy-pages.yml) が動き、公開されます。

スマホのChromeで公開URLを開き、メニューの「ホーム画面に追加」を選ぶと、アプリとして使えます。ネットにつながる場所で一度開いておけば、圏外の水辺でも起動できます。

## デバッグ

走行中はUSBをつなげないので、船の動作ログはBluetoothでアプリに送ります。アプリの「ログ」ボタンで表示し、「保存」で全レベルの全行をテキストファイルにできます。接続前の出来事も最大64行まで船に残っていて、接続すると届きます。

指令の流れを追うときは、表示レベルを `DEBUG` にして、アプリの `tx` 行と船の `rx` 行を `seq`(通し番号)で見比べます。

```
tx seq=1234 L=72 R=24 mode=joystick a=30 b=60 max=80 stop=0 n=4 skip=0 fail=0
rx seq=1234 L=72 R=24 out=70,30 duty=1023/307,1023/716 n=4 lost=0 gap=58ms bad=0 drop=0
```

| ログの状態 | 判断 |
|---|---|
| `tx` が出ない、`seq` が増えない、`skip`、`fail` が多い | 送信の問題 |
| `tx` の `seq` は増えるが、`rx` が追いつかない、`lost` が多い | 無線区間の問題 |
| `rx` の `L`、`R` は正しいが `out` が追従しない | 船の制御の問題 |
| `duty` は出ているがモーターが回らない | 回路側の問題 |
| `boot reason=BROWNOUT` などのERROR | 走行中の再起動 |

形式と切り分けの詳細は[仕様書 7章](docs/SPEC.md#7-ログ)を参照してください。

## 実機での確認

モックと違い、実機でしか確認できない項目です。最初は**プロペラを外して**行ってください。

- [ ] 電源投入時にモーターが回らないか(回路の都合で、一瞬回る可能性があります。[仕様書 10章](docs/SPEC.md#10-回路上の注意))
- [ ] Android Chromeから `SampleU-Boat` に接続できる
- [ ] 各モードで左右のモーターが正しく回る。前進で逆に回るモーターは、スケッチ冒頭の `MOTOR_L_INVERT` / `MOTOR_R_INVERT` を `true` にする
- [ ] 操作中に、切断、画面オフ、スマホのBluetooth OFFを行うと、0.5秒以内に止まる
- [ ] 全開や急な反転で、再起動やBLE切断が起きない
- [ ] 接続するとアプリの「ログ」に `boot` の行が届き、`DEBUG` 表示で `tx` と `rx` の `seq` が揃って増える
- [ ] 消耗した電池(2V台前半)でも左右のモーターが正常に動き、ドライバICが異常に発熱しない
