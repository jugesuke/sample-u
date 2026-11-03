// 水中モーター2基の船 制御ファームウェア
//
// 対象: Seeed Studio XIAO ESP32C3 + AM1025EA x2
// 環境: Arduino IDE / esp32 core 3.x(ボード: XIAO_ESP32C3)
// 仕様: docs/SPEC.md

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

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

// ---- BLE(webapp/src/lib/protocol.ts と揃える) ----------------------------

const char *const DEVICE_NAME = "SampleU-Boat";
const char *const SERVICE_UUID = "7c1f0a10-5b3e-4d2a-9f61-2a8e4c7d1b00";
const char *const COMMAND_CHAR_UUID = "7c1f0a11-5b3e-4d2a-9f61-2a8e4c7d1b00";

constexpr size_t COMMAND_FRAME_LENGTH = 2;  // [int8 左, int8 右]
constexpr int COMMAND_MAX = 100;

// ---- BLEタスクとloop()で共有する状態(sharedMuxで保護) --------------------

portMUX_TYPE sharedMux = portMUX_INITIALIZER_UNLOCKED;
int8_t sharedTargetLeft = 0;
int8_t sharedTargetRight = 0;
uint32_t sharedLastCommandMs = 0;
bool sharedHasCommand = false;  // 今回の接続で有効なフレームを受信済みか
bool sharedRestartAdvertising = false;

// ---- モーター出力 ----------------------------------------------------------

float currentLeft = 0;
float currentRight = 0;
uint32_t lastLoopMs = 0;

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
    portEXIT_CRITICAL(&sharedMux);
  }

  void onDisconnect(BLEServer *) override {
    portENTER_CRITICAL(&sharedMux);
    sharedHasCommand = false;
    sharedRestartAdvertising = true;
    portEXIT_CRITICAL(&sharedMux);
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    if (characteristic->getLength() != COMMAND_FRAME_LENGTH) {
      return;
    }
    const uint8_t *data = characteristic->getData();
    const int8_t left = constrain(static_cast<int8_t>(data[0]), -COMMAND_MAX, COMMAND_MAX);
    const int8_t right = constrain(static_cast<int8_t>(data[1]), -COMMAND_MAX, COMMAND_MAX);
    const uint32_t now = millis();

    portENTER_CRITICAL(&sharedMux);
    sharedTargetLeft = left;
    sharedTargetRight = right;
    sharedLastCommandMs = now;
    sharedHasCommand = true;
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

  setupBle();
  lastLoopMs = millis();
}

void loop() {
  portENTER_CRITICAL(&sharedMux);
  const int8_t targetLeft = sharedTargetLeft;
  const int8_t targetRight = sharedTargetRight;
  const uint32_t lastCommandMs = sharedLastCommandMs;
  const bool hasCommand = sharedHasCommand;
  const bool restartAdvertising = sharedRestartAdvertising;
  sharedRestartAdvertising = false;
  portEXIT_CRITICAL(&sharedMux);

  // 共有状態を読んだ後に時刻を取る(逆だと差分がアンダーフローして誤停止する)
  const uint32_t now = millis();

  if (restartAdvertising) {
    BLEDevice::startAdvertising();
  }

  if (hasCommand && now - lastCommandMs <= COMMAND_TIMEOUT_MS) {
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
  lastLoopMs = now;
  delay(LOOP_INTERVAL_MS);
}
