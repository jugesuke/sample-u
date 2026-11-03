// 水中モーター2基の船 制御ファームウェア
//
// 対象: Seeed Studio XIAO ESP32C3 + AM1025EA x2
// 環境: Arduino IDE / esp32 core 3.3.12(ボード: XIAO_ESP32C3、BLEスタックはNimBLE)
// 仕様: docs/SPEC.md

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <esp_system.h>
#include <stdarg.h>

// ---- 調整用の定数 ----------------------------------------------------------

// 前進指令でモーターが逆に回るときは true にする
constexpr bool MOTOR_L_INVERT = false;
constexpr bool MOTOR_R_INVERT = false;

constexpr uint8_t PIN_ML_IN_A = D10;
constexpr uint8_t PIN_ML_IN_B = D9;
constexpr uint8_t PIN_MR_IN_A = D8;
constexpr uint8_t PIN_MR_IN_B = D7;

constexpr uint32_t PWM_FREQ_HZ = 20000;  // AM1025EAの入力範囲は 20Hz〜65kHz
constexpr uint8_t PWM_RES_BITS = 10;
constexpr uint32_t PWM_MAX = (1u << PWM_RES_BITS) - 1;

constexpr uint32_t COMMAND_TIMEOUT_MS = 500;  // この間受信がなければ停止する
constexpr uint32_t RAMP_FULL_SCALE_MS = 300;  // 出力 0→100% に掛ける時間
constexpr uint32_t LOOP_INTERVAL_MS = 10;
constexpr uint32_t STATUS_INTERVAL_MS = 1000;  // 接続中に状態をログへ出す間隔

// ---- BLE(webapp/src/lib/protocol.ts と揃える) ----------------------------

const char *const DEVICE_NAME = "SampleU-Boat";
const char *const SERVICE_UUID = "7c1f0a10-5b3e-4d2a-9f61-2a8e4c7d1b00";
const char *const COMMAND_CHAR_UUID = "7c1f0a11-5b3e-4d2a-9f61-2a8e4c7d1b00";
const char *const LOG_CHAR_UUID = "7c1f0a12-5b3e-4d2a-9f61-2a8e4c7d1b00";

constexpr size_t COMMAND_FRAME_LENGTH = 2;  // [int8 左, int8 右]
constexpr int COMMAND_MAX = 100;

constexpr size_t LOG_LINE_COUNT = 64;   // 未送信のログを溜めておく行数
constexpr size_t LOG_LINE_LENGTH = 80;
constexpr size_t LOG_CHUNK_LENGTH = 20;  // どのMTUでも1回の通知に収まる長さ

// ---- BLEタスクとloop()で共有する状態(sharedMuxで保護) --------------------

portMUX_TYPE sharedMux = portMUX_INITIALIZER_UNLOCKED;
int8_t sharedTargetLeft = 0;
int8_t sharedTargetRight = 0;
uint32_t sharedLastCommandMs = 0;
bool sharedHasCommand = false;  // 今回の接続で有効なフレームを受信済みか
bool sharedRestartAdvertising = false;
bool sharedConnected = false;
bool sharedLogSubscribed = false;
uint32_t sharedFrameCount = 0;     // 前回の状態ログ以降の有効フレーム数
uint32_t sharedMaxGapMs = 0;       // 前回の状態ログ以降の最大受信間隔
uint32_t sharedInvalidFrames = 0;  // 起動後の不正フレーム数(累計)

// ---- ログ(sharedMuxで保護) ------------------------------------------------

char logLines[LOG_LINE_COUNT][LOG_LINE_LENGTH];
size_t logHead = 0;       // 最も古い行
size_t logCount = 0;
size_t logSendOffset = 0;  // 最も古い行のうち送信済みのバイト数
uint32_t logDropped = 0;   // 溢れて捨てた行数(累計)
BLECharacteristic *logCharacteristic = nullptr;

// 1行を記録する。BLEタスクとloop()のどちらからでも呼べる
void logEvent(const char *format, ...) {
  char line[LOG_LINE_LENGTH];
  const int prefix = snprintf(line, sizeof(line), "%lu ", static_cast<unsigned long>(millis()));
  va_list args;
  va_start(args, format);
  vsnprintf(line + prefix, sizeof(line) - prefix, format, args);
  va_end(args);

  portENTER_CRITICAL(&sharedMux);
  if (logCount == LOG_LINE_COUNT && logSendOffset > 0) {
    logDropped++;  // 送信途中の行は壊さず、新しい行を捨てる
  } else {
    if (logCount == LOG_LINE_COUNT) {
      logHead = (logHead + 1) % LOG_LINE_COUNT;
      logCount--;
      logDropped++;
    }
    memcpy(logLines[(logHead + logCount) % LOG_LINE_COUNT], line, sizeof(line));
    logCount++;
  }
  portEXIT_CRITICAL(&sharedMux);
}

// 改行で終わるテキストを LOG_CHUNK_LENGTH ずつ通知する。受信側で行に組み立て直す
void sendLogChunk() {
  uint8_t chunk[LOG_CHUNK_LENGTH];
  size_t length = 0;

  portENTER_CRITICAL(&sharedMux);
  if (sharedConnected && sharedLogSubscribed && logCount > 0) {
    const char *line = logLines[logHead];
    const size_t lineLength = strlen(line);
    while (length < LOG_CHUNK_LENGTH && logSendOffset < lineLength) {
      chunk[length++] = line[logSendOffset++];
    }
    if (length < LOG_CHUNK_LENGTH) {
      chunk[length++] = '\n';
      logHead = (logHead + 1) % LOG_LINE_COUNT;
      logCount--;
      logSendOffset = 0;
    }
  }
  portEXIT_CRITICAL(&sharedMux);

  if (length > 0) {
    logCharacteristic->setValue(chunk, length);
    logCharacteristic->notify();
  }
}

const char *resetReasonName() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXTERNAL";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INT_WDT";
    case ESP_RST_TASK_WDT: return "TASK_WDT";
    case ESP_RST_WDT: return "WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_SDIO: return "SDIO";
    default: return "UNKNOWN";
  }
}

// ---- モーター出力 ----------------------------------------------------------

float currentLeft = 0;
float currentRight = 0;
uint32_t lastLoopMs = 0;
uint32_t lastStatusMs = 0;
bool commandsActive = false;  // 指令を受信して動作できる状態か

// スローディケイ駆動: 片側をH固定、もう片側をPWMして駆動/ブレーキを交互に行う。
// L/L を交互に使うとPWM周期ごとにICが待機モードへ入るため避けている。
void applyMotor(uint8_t pinA, uint8_t pinB, float speed, bool invert) {
  if (invert) {
    speed = -speed;
  }
  const uint32_t drive = lroundf(fabsf(speed) / COMMAND_MAX * PWM_MAX);
  if (drive == 0) {
    ledcWrite(pinA, 0);  // L/L: 惰性停止
    ledcWrite(pinB, 0);
  } else if (speed > 0) {
    ledcWrite(pinA, PWM_MAX);
    ledcWrite(pinB, PWM_MAX - drive);
  } else {
    ledcWrite(pinA, PWM_MAX - drive);
    ledcWrite(pinB, PWM_MAX);
  }
}

void applyOutputs() {
  applyMotor(PIN_ML_IN_A, PIN_ML_IN_B, currentLeft, MOTOR_L_INVERT);
  applyMotor(PIN_MR_IN_A, PIN_MR_IN_B, currentRight, MOTOR_R_INVERT);
}

float rampToward(float current, float target, float maxStep) {
  if (target > current) {
    return min(current + maxStep, target);
  }
  return max(current - maxStep, target);
}

// ---- BLEコールバック -------------------------------------------------------

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {
    portENTER_CRITICAL(&sharedMux);
    sharedHasCommand = false;
    sharedConnected = true;
    sharedFrameCount = 0;
    sharedMaxGapMs = 0;
    portEXIT_CRITICAL(&sharedMux);
    logEvent("connected");
  }

  void onDisconnect(BLEServer *) override {
    portENTER_CRITICAL(&sharedMux);
    sharedHasCommand = false;
    sharedConnected = false;
    sharedLogSubscribed = false;
    sharedRestartAdvertising = true;
    logSendOffset = 0;  // 受信側は途中の行を捨てるので、次回は行の先頭から送る
    portEXIT_CRITICAL(&sharedMux);
    logEvent("disconnected");
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    if (characteristic->getLength() != COMMAND_FRAME_LENGTH) {
      portENTER_CRITICAL(&sharedMux);
      sharedInvalidFrames++;
      portEXIT_CRITICAL(&sharedMux);
      return;
    }
    const uint8_t *data = characteristic->getData();
    const int8_t left = constrain(static_cast<int8_t>(data[0]), -COMMAND_MAX, COMMAND_MAX);
    const int8_t right = constrain(static_cast<int8_t>(data[1]), -COMMAND_MAX, COMMAND_MAX);
    const uint32_t now = millis();

    portENTER_CRITICAL(&sharedMux);
    if (sharedHasCommand && now - sharedLastCommandMs > sharedMaxGapMs) {
      sharedMaxGapMs = now - sharedLastCommandMs;
    }
    sharedFrameCount++;
    sharedTargetLeft = left;
    sharedTargetRight = right;
    sharedLastCommandMs = now;
    sharedHasCommand = true;
    portEXIT_CRITICAL(&sharedMux);
  }
};

class LogCallbacks : public BLECharacteristicCallbacks {
  void onSubscribe(BLECharacteristic *, ble_gap_conn_desc *, uint16_t subValue) override {
    portENTER_CRITICAL(&sharedMux);
    sharedLogSubscribed = subValue != 0;
    portEXIT_CRITICAL(&sharedMux);
  }
};

void setupBle() {
  BLEDevice::init(DEVICE_NAME);

  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *command = service->createCharacteristic(
      COMMAND_CHAR_UUID, BLECharacteristic::PROPERTY_WRITE_NR);
  command->setCallbacks(new CommandCallbacks());

  logCharacteristic = service->createCharacteristic(
      LOG_CHAR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  logCharacteristic->setCallbacks(new LogCallbacks());

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);  // 128bit UUIDと名前は1つの広告に収まらない
  BLEDevice::startAdvertising();
}

// ---- Arduino ---------------------------------------------------------------

void setup() {
  const uint8_t pins[] = {PIN_ML_IN_A, PIN_ML_IN_B, PIN_MR_IN_A, PIN_MR_IN_B};

  // 起動直後に最優先でモーターを止める
  for (uint8_t pin : pins) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
  }
  for (uint8_t pin : pins) {
    ledcAttach(pin, PWM_FREQ_HZ, PWM_RES_BITS);
    ledcWrite(pin, 0);
  }

  logEvent("boot reason=%s build=%s %s", resetReasonName(), __DATE__, __TIME__);
  setupBle();
  lastLoopMs = millis();
}

void loop() {
  portENTER_CRITICAL(&sharedMux);
  const int8_t targetLeft = sharedTargetLeft;
  const int8_t targetRight = sharedTargetRight;
  const uint32_t lastCommandMs = sharedLastCommandMs;
  const bool hasCommand = sharedHasCommand;
  const bool connected = sharedConnected;
  const bool restartAdvertising = sharedRestartAdvertising;
  sharedRestartAdvertising = false;
  portEXIT_CRITICAL(&sharedMux);

  // 共有状態を読んだ後に時刻を取る(逆だと差分がアンダーフローして誤停止する)
  const uint32_t now = millis();

  if (restartAdvertising) {
    BLEDevice::startAdvertising();
  }

  const bool active = hasCommand && now - lastCommandMs <= COMMAND_TIMEOUT_MS;
  if (active != commandsActive) {
    commandsActive = active;
    if (active) {
      logEvent("commands active");
    } else if (connected) {
      logEvent("failsafe stop: no command for %lums", static_cast<unsigned long>(now - lastCommandMs));
    } else {
      logEvent("failsafe stop: disconnected");
    }
  }

  if (active) {
    const float maxStep =
        static_cast<float>(now - lastLoopMs) * COMMAND_MAX / RAMP_FULL_SCALE_MS;
    currentLeft = rampToward(currentLeft, targetLeft, maxStep);
    currentRight = rampToward(currentRight, targetRight, maxStep);
  } else {
    // フェイルセーフ: ランプを通さず即停止する
    currentLeft = 0;
    currentRight = 0;
  }

  applyOutputs();

  if (connected && now - lastStatusMs >= STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    portENTER_CRITICAL(&sharedMux);
    const uint32_t frames = sharedFrameCount;
    const uint32_t maxGap = sharedMaxGapMs;
    const uint32_t invalid = sharedInvalidFrames;
    const uint32_t dropped = logDropped;
    sharedFrameCount = 0;
    sharedMaxGapMs = 0;
    portEXIT_CRITICAL(&sharedMux);
    logEvent("st L%d>%d R%d>%d rx=%lu gap=%lums bad=%lu drop=%lu heap=%luk",
             targetLeft, static_cast<int>(lroundf(currentLeft)),
             targetRight, static_cast<int>(lroundf(currentRight)),
             static_cast<unsigned long>(frames), static_cast<unsigned long>(maxGap),
             static_cast<unsigned long>(invalid), static_cast<unsigned long>(dropped),
             static_cast<unsigned long>(ESP.getFreeHeap() / 1024));
  }

  sendLogChunk();
  lastLoopMs = now;
  delay(LOOP_INTERVAL_MS);
}
