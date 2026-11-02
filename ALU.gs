
/**
 * EitoDiceBanana CPU Simulator
 * ALU Module - Phase 1
 *
 * 8-bit arithmetic and logical operations.
 * Functional registers: AX and BX.
 *
 * Flags:
 * ZF - Zero Flag
 * CF - Carry / Borrow Flag
 * SF - Sign Flag
 */

// ============================================
// 8-BIT UTILITIES
// ============================================

function toByte(value) {
  return value & 0xFF;
}

/**
 * Validates ALU operands.
 */
function validateALUOperand_(value) {
  if (!isValidByte(value)) {
    throw new Error(
      "Invalid ALU operand: " + value +
      ". Expected 0-255."
    );
  }
}

/**
 * Updates all flags after arithmetic.
 *
 * rawResult: result before 8-bit truncation.
 * byteResult: result after truncation.
 */
function updateArithmeticFlags_(rawResult, byteResult) {
  updateCarryFlag(rawResult);
  updateResultFlags(byteResult);
}

/**
 * Updates flags after a logical operation.
 * Logical operations clear CF.
 */
function updateLogicalFlags_(result) {
  setFlag("CF", 0);
  updateResultFlags(result);
}


// ============================================
// ARITHMETIC OPERATIONS
// ============================================

function aluAdd(a, b) {
  validateALUOperand_(a);
  validateALUOperand_(b);

  const raw = a + b;
  const result = toByte(raw);

  updateArithmeticFlags_(raw, result);

  return result;
}

function aluSub(a, b) {
  validateALUOperand_(a);
  validateALUOperand_(b);

  const raw = a - b;
  const result = toByte(raw);

  updateArithmeticFlags_(raw, result);

  return result;
}

function aluInc(value) {
  validateALUOperand_(value);

  const raw = value + 1;
  const result = toByte(raw);

  updateArithmeticFlags_(raw, result);

  return result;
}

function aluDec(value) {
  validateALUOperand_(value);

  const raw = value - 1;
  const result = toByte(raw);

  updateArithmeticFlags_(raw, result);

  return result;
}


// ============================================
// COMPARISON
// ============================================

/**
 * CMP performs a subtraction only to update flags.
 * It does not modify the source operands.
 */
function aluCmp(a, b) {
  validateALUOperand_(a);
  validateALUOperand_(b);

  const raw = a - b;
  const result = toByte(raw);

  updateArithmeticFlags_(raw, result);
}


// ============================================
// LOGICAL OPERATIONS
// ============================================

function aluAnd(a, b) {
  validateALUOperand_(a);
  validateALUOperand_(b);

  const result = toByte(a & b);

  updateLogicalFlags_(result);

  return result;
}

function aluOr(a, b) {
  validateALUOperand_(a);
  validateALUOperand_(b);

  const result = toByte(a | b);

  updateLogicalFlags_(result);

  return result;
}

function aluXor(a, b) {
  validateALUOperand_(a);
  validateALUOperand_(b);

  const result = toByte(a ^ b);

  updateLogicalFlags_(result);

  return result;
}

function aluNot(value) {
  validateALUOperand_(value);

  const result = toByte(~value);

  updateLogicalFlags_(result);

  return result;
}


// ============================================
// TEST HELPERS
// ============================================

function assertALU_(condition, message) {
  if (!condition) {
    throw new Error("ALU TEST FAILED: " + message);
  }
}


// ============================================
// COMPLETE ALU TEST
// ============================================

function testALUModule() {
  Logger.log("=== ALU MODULE TEST ===");

  resetCPURegisters();

  // ADD
  assertALU_(
    aluAdd(5, 3) === 8,
    "ADD 5 + 3"
  );
  Logger.log("PASS: ADD");

  // ADD overflow
  assertALU_(
    aluAdd(255, 1) === 0 &&
    getFlag("ZF") === 1 &&
    getFlag("CF") === 1,
    "ADD overflow"
  );
  Logger.log("PASS: ADD overflow");

  // SUB
  assertALU_(
    aluSub(10, 3) === 7,
    "SUB 10 - 3"
  );
  Logger.log("PASS: SUB");

  // SUB borrow
  assertALU_(
    aluSub(0, 1) === 255 &&
    getFlag("CF") === 1 &&
    getFlag("SF") === 1,
    "SUB borrow"
  );
  Logger.log("PASS: SUB borrow");

  // INC
  assertALU_(
    aluInc(255) === 0 &&
    getFlag("ZF") === 1,
    "INC overflow"
  );
  Logger.log("PASS: INC");

  // DEC
  assertALU_(
    aluDec(0) === 255 &&
    getFlag("SF") === 1,
    "DEC underflow"
  );
  Logger.log("PASS: DEC");

  // CMP equal
  aluCmp(5, 5);
  assertALU_(
    getFlag("ZF") === 1,
    "CMP equal"
  );
  Logger.log("PASS: CMP");

  // AND
  assertALU_(
    aluAnd(0x0F, 0x33) === 0x03,
    "AND"
  );
  Logger.log("PASS: AND");

  // OR
  assertALU_(
    aluOr(0x0F, 0x33) === 0x3F,
    "OR"
  );
  Logger.log("PASS: OR");

  // XOR
  assertALU_(
    aluXor(0x0F, 0x33) === 0x3C,
    "XOR"
  );
  Logger.log("PASS: XOR");

  // NOT
  assertALU_(
    aluNot(0x0F) === 0xF0,
    "NOT"
  );
  Logger.log("PASS: NOT");

  // Invalid operand
  let rejected = false;

  try {
    aluAdd(256, 1);
  } catch (error) {
    rejected = true;
  }

  assertALU_(rejected, "Invalid operand rejected");
  Logger.log("PASS: Invalid operand validation");

  resetCPURegisters();

  Logger.log("=== ALL ALU TESTS PASSED ===");
}
