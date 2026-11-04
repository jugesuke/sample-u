// モーター回路の確認用スケッチ
//
// BLEとPWMを使わず、左右のモーターを前進と後進で順番に動かす。
// スマホの操作なしで電圧を測るためのもので、確認後は boat_controller を書き込み直す。
// 手順: docs/TESTING.md

constexpr uint8_t PIN_ML_IN_A = D10;
constexpr uint8_t PIN_ML_IN_B = D9;
constexpr uint8_t PIN_MR_IN_A = D8;
constexpr uint8_t PIN_MR_IN_B = D7;

constexpr uint32_t DRIVE_MS = 10000;
constexpr uint32_t STOP_MS = 2000;

void setInputs(uint8_t pinA, uint8_t pinB, uint8_t a, uint8_t b) {
  digitalWrite(pinA, a);
  digitalWrite(pinB, b);
}

void drive(uint8_t pinA, uint8_t pinB, uint8_t a, uint8_t b) {
  setInputs(pinA, pinB, a, b);
  delay(DRIVE_MS);
  setInputs(pinA, pinB, LOW, LOW);
  delay(STOP_MS);
}

void setup() {
  for (uint8_t pin : {PIN_ML_IN_A, PIN_ML_IN_B, PIN_MR_IN_A, PIN_MR_IN_B}) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, LOW);
  }
  delay(STOP_MS);
}

void loop() {
  drive(PIN_ML_IN_A, PIN_ML_IN_B, HIGH, LOW);  // 左 前進
  drive(PIN_ML_IN_A, PIN_ML_IN_B, LOW, HIGH);  // 左 後進
  drive(PIN_MR_IN_A, PIN_MR_IN_B, HIGH, LOW);  // 右 前進
  drive(PIN_MR_IN_A, PIN_MR_IN_B, LOW, HIGH);  // 右 後進
}
