/**
 * EitoDiceBanana CPU Simulator
 * Keyboard Peripheral — Task 11
 *
 * FIFO keyboard queue: 8 bytes.
 * Virtual MMIO addresses: 1F8h - 1FFh.
 * The peripheral does not consume physical RAM frames.
 */

const KEYBOARD_QUEUE_KEY = "EDB_KEYBOARD_QUEUE";
const KEYBOARD_QUEUE_CAPACITY = 8;
const KEYBOARD_MMIO_START = 0x1F8;
const KEYBOARD_MMIO_END = 0x1FF;

// ------------------------------------------------------------
// QUEUE STORAGE
// ------------------------------------------------------------

function keyboardWithLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function keyboardReadQueueRaw_() {
  const raw = PropertiesService
    .getDocumentProperties()
    .getProperty(KEYBOARD_QUEUE_KEY);

  if (!raw) return [];

  try {
    const queue = JSON.parse(raw);

    if (!Array.isArray(queue)) return [];

    if (queue.some(value => !isValidByte(value))) {
      return [];
    }

    return queue.slice(0, KEYBOARD_QUEUE_CAPACITY);

  } catch (error) {
    return [];
  }
}

function keyboardSaveQueueRaw_(queue) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(
      KEYBOARD_QUEUE_KEY,
      JSON.stringify(queue)
    );
}

function getKeyboardQueue_() {
  return keyboardWithLock_(function() {
    return keyboardReadQueueRaw_().slice();
  });
}

function keyboardQueueSize_() {
  return getKeyboardQueue_().length;
}

// ------------------------------------------------------------
// INPUT
// ------------------------------------------------------------

function keyboardEnqueue_(value) {
  if (!isValidByte(value)) {
    throw new Error(
      "Keyboard input must be an 8-bit value (0-255)."
    );
  }

  let newSize = 0;

  keyboardWithLock_(function() {
    const queue = keyboardReadQueueRaw_();

    if (queue.length >= KEYBOARD_QUEUE_CAPACITY) {
      throw new Error(
        "Keyboard queue full. Maximum capacity is 8 bytes."
      );
    }

    queue.push(value);

    keyboardSaveQueueRaw_(queue);
    newSize = queue.length;
  });

  updateKeyboardPanelSafely_();

  return newSize;
}

function keyboardEnqueueCharacter_(character) {
  const value = String(character);

  if (value.length !== 1) {
    throw new Error(
      "Enter exactly one character at a time."
    );
  }

  const byte = value.charCodeAt(0);

  if (!isValidByte(byte)) {
    throw new Error(
      "Character is outside the supported 8-bit range (0-255)."
    );
  }

  return keyboardEnqueue_(byte);
}

// ------------------------------------------------------------
// FIFO OUTPUT
// ------------------------------------------------------------

function keyboardDequeue_() {
  let value = null;

  keyboardWithLock_(function() {
    const queue = keyboardReadQueueRaw_();

    if (queue.length === 0) {
      throw new Error(
        "Keyboard queue is empty. Enter a character in E-S!D8 before executing IN."
      );
    }

    value = queue.shift();

    keyboardSaveQueueRaw_(queue);
  });

  updateKeyboardPanelSafely_();

  return value;
}

// ------------------------------------------------------------
// MEMORY-MAPPED I/O
// ------------------------------------------------------------

function isKeyboardMappedAddress_(address) {
  return Number.isInteger(address) &&
    address >= KEYBOARD_MMIO_START &&
    address <= KEYBOARD_MMIO_END;
}

/**
 * The eight virtual addresses display the current FIFO contents.
 * Empty positions return 00h.
 *
 * This is a read-only MMIO window.
 */
function keyboardReadMappedAddress_(address) {
  if (!isKeyboardMappedAddress_(address)) {
    throw new Error(
      "Address is outside the keyboard MMIO range."
    );
  }

  const queue = getKeyboardQueue_();
  const index = address - KEYBOARD_MMIO_START;

  return index < queue.length ? queue[index] : 0;
}

// ------------------------------------------------------------
// RESET
// ------------------------------------------------------------

function keyboardReset_() {
  keyboardWithLock_(function() {
    keyboardSaveQueueRaw_([]);
  });

  updateKeyboardPanelSafely_();

  return true;
}

// ------------------------------------------------------------
// DISPLAY
// ------------------------------------------------------------

function keyboardDisplayCharacter_(value) {
  if (value === 32) return "SPACE";

  if (value >= 33 && value <= 126) {
    return String.fromCharCode(value);
  }

  if (value >= 160 && value <= 255) {
    return String.fromCharCode(value);
  }

  return "CTRL " +
    value.toString(16).toUpperCase().padStart(2, "0");
}

function updateKeyboardPanel_() {
  const sheet = SpreadsheetApp
    .getActive()
    .getSheetByName("E-S");

  if (!sheet) return;

  const queue = getKeyboardQueue_();
  const C = CONFIG.COLORS;

  const rows = [];

  for (let i = 0; i < KEYBOARD_QUEUE_CAPACITY; i++) {
    const occupied = i < queue.length;
    const value = occupied ? queue[i] : 0;

    const address = (
      KEYBOARD_MMIO_START + i
    ).toString(16)
      .toUpperCase()
      .padStart(3, "0") + "h";

    rows.push([
      i + 1,
      address,
      value.toString(16).toUpperCase().padStart(2, "0") + "h",
      occupied ? value : "-",
      occupied
        ? keyboardDisplayCharacter_(value)
        : "EMPTY"
    ]);
  }

  sheet.getRange("H8")
    .setValue(
      "QUEUE: " + queue.length +
      " / " + KEYBOARD_QUEUE_CAPACITY
    )
    .setFontColor(
      queue.length >= KEYBOARD_QUEUE_CAPACITY
        ? C.red
        : C.green
    )
    .setFontWeight("bold");

  sheet.getRange("B13:F20")
    .setValues(rows)
    .setBackground(C.panel)
    .setFontColor(C.white)
    .setHorizontalAlignment("center");
}

function updateKeyboardPanelSafely_() {
  try {
    updateKeyboardPanel_();
  } catch (error) {
    // The E-S panel may not have been installed yet.
  }
}

// ------------------------------------------------------------
// KEYBOARD SHEET UI
// ------------------------------------------------------------

/**
 * Installs only the keyboard panel.
 * Does not rebuild or clear the simulator sheets.
 */
function setupKeyboardPanel() {
  const sheet = SpreadsheetApp
    .getActive()
    .getSheetByName("E-S");

  if (!sheet) {
    throw new Error("E-S sheet not found.");
  }

  const C = CONFIG.COLORS;

  // Remove the old reserved-module placeholder only.
  sheet.getRange("B8:R22").breakApart();
  sheet.getRange("B8:R22").clearContent();

  // Main panel header.
  sheet.getRange("B6:R6")
    .breakApart()
    .merge()
    .setValue("KEYBOARD INPUT / 8-BYTE FIFO")
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  // Character input.
  sheet.getRange("B8")
    .setValue("INPUT CHARACTER")
    .setFontColor(C.muted)
    .setFontWeight("bold");

  sheet.getRange("D8")
    .setValue("")
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setNote(
      "Type exactly one character (8-bit range, 0-255) and press Enter."
    );

  sheet.getRange("F8")
    .setValue("TYPE ONE CHARACTER IN D8")
    .setFontColor(C.muted);

  sheet.getRange("H8:R8")
    .merge()
    .setBackground(C.panel)
    .setFontWeight("bold");

  // MMIO explanation.
  sheet.getRange("B10:R10")
    .merge()
    .setValue(
      "FIFO QUEUE | 8 BYTES | VIRTUAL MMIO: 1F8h - 1FFh | READ ONLY"
    )
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  // Queue table.
  sheet.getRange("B12:F12")
    .setValues([[
      "SLOT",
      "VIRTUAL ADDRESS",
      "BYTE (HEX)",
      "DECIMAL",
      "CHARACTER"
    ]])
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("B13:F20")
    .setBackground(C.panel)
    .setFontColor(C.white)
    .setHorizontalAlignment("center");

  // Architecture note.
  sheet.getRange("B22:R22")
    .merge()
    .setValue(
      "IN reg, [KBD] consumes the next FIFO byte through En_KBD. " +
      "The MMIO window does not occupy physical RAM."
    )
    .setFontColor(C.muted)
    .setWrap(true);

  sheet.setColumnWidth(2, 70);
  sheet.setColumnWidth(3, 125);
  sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 120);

  updateKeyboardPanel_();

  SpreadsheetApp.flush();

  SpreadsheetApp.getActive().toast(
    "Keyboard panel installed",
    "EitoDiceBanana",
    4
  );
}

// ------------------------------------------------------------
// INPUT TRIGGER
// ------------------------------------------------------------

/**
 * Run once to install the keyboard input trigger.
 */
function installKeyboardInputTrigger() {
  const ss = SpreadsheetApp.getActive();

  ScriptApp.getProjectTriggers()
    .filter(trigger =>
      trigger.getHandlerFunction() === "edbKeyboardOnEdit"
    )
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("edbKeyboardOnEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ss.toast(
    "Keyboard input trigger installed",
    "EitoDiceBanana",
    4
  );
}

function edbKeyboardOnEdit(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== "E-S") return;
  if (range.getA1Notation() !== "D8") return;

  const raw = e.value;

  if (raw === undefined || raw === null || raw === "") {
    return;
  }

  // Clear the input cell so the next character can be entered.
  range.clearContent();

  try {
    const size = keyboardEnqueueCharacter_(String(raw));

    SpreadsheetApp.getActive().toast(
      "Character added to keyboard queue (" + size + "/8)",
      "KEYBOARD",
      3
    );

  } catch (error) {
    SpreadsheetApp.getActive().toast(
      error.message,
      "KEYBOARD INPUT ERROR",
      6
    );
  }
}

// ------------------------------------------------------------
// TEST HELPERS
// ------------------------------------------------------------

function assertKeyboard_(condition, message) {
  if (!condition) {
    throw new Error(
      "KEYBOARD TEST FAILED: " + message
    );
  }
}

// ------------------------------------------------------------
// QUEUE / MMIO TESTS
// ------------------------------------------------------------

function testKeyboardModule() {
  keyboardReset_();

  // Insert eight bytes.
  for (let i = 0; i < 8; i++) {
    keyboardEnqueue_(0x41 + i);
  }

  assertKeyboard_(
    keyboardQueueSize_() === 8,
    "Queue must contain exactly eight bytes."
  );

  // Reject the ninth byte.
  let overflowRejected = false;

  try {
    keyboardEnqueue_(0x49);
  } catch (error) {
    overflowRejected = /full/i.test(error.message);
  }

  assertKeyboard_(
    overflowRejected,
    "Queue must reject input when full."
  );

  // Verify the eight MMIO addresses.
  for (let i = 0; i < 8; i++) {
    assertKeyboard_(
      keyboardReadMappedAddress_(
        KEYBOARD_MMIO_START + i
      ) === 0x41 + i,
      "Incorrect MMIO value at slot " + i
    );
  }

  // Verify FIFO order.
  for (let i = 0; i < 8; i++) {
    const value = keyboardDequeue_();

    assertKeyboard_(
      value === 0x41 + i,
      "FIFO order failed at item " + i
    );
  }

  assertKeyboard_(
    keyboardQueueSize_() === 0,
    "Queue must be empty after eight removals."
  );

  // Empty queue must be handled.
  let emptyRejected = false;

  try {
    keyboardDequeue_();
  } catch (error) {
    emptyRejected = /empty/i.test(error.message);
  }

  assertKeyboard_(
    emptyRejected,
    "Reading an empty queue must be rejected."
  );

  // Empty MMIO positions must return 00h.
  assertKeyboard_(
    keyboardReadMappedAddress_(0x1F8) === 0,
    "Empty MMIO slot must return 00h."
  );

  // Verify assembler encoding.
  const encoded = assembleInstruction(
    "IN AX, [KBD]"
  );

  assertKeyboard_(
    JSON.stringify(encoded) === JSON.stringify([0x05, 0x00]),
    "IN AX, [KBD] encoding is incorrect."
  );

  keyboardReset_();

  return {
    passed: true,
    capacity: KEYBOARD_QUEUE_CAPACITY,
    mmioStart: "1F8h",
    mmioEnd: "1FFh",
    tests: 8
  };
}

// ------------------------------------------------------------
// CPU INTEGRATION TEST
// ------------------------------------------------------------

function testTask11KeyboardCPUIntegration() {
  keyboardReset_();

  keyboardEnqueue_(0x41); // A
  keyboardEnqueue_(0x42); // B

  const program = assembleProgram([
    "IN AX, [KBD]",
    "IN DX, [KBD]",
    "HLT"
  ]);

  // This test loads a test program into the simulator.
  loadProgram(program, 0x00);

  let state = getExecutionState_();
  let guard = 0;
  const received = [];

  while (!state.halted && guard < 100) {
    state = stepCpu();

    if (
      state.lastMicroStep ===
      "IN_T0_KEYBOARD_TO_REGISTER"
    ) {
      received.push(
        state.lastBuses.internal.value
      );

      assertKeyboard_(
        state.lastBuses.internal.state === "ACTIVE",
        "Keyboard must activate the internal bus."
      );

      assertKeyboard_(
        state.lastBuses.internal.source === "KEYBOARD",
        "Keyboard must be the active internal bus transmitter."
      );

      assertKeyboard_(
        state.lastActiveSignals.indexOf("En_KBD") !== -1,
        "En_KBD must be active during IN."
      );

      const signals = {};
      state.lastActiveSignals.forEach(function(signal) {
        if (signal.indexOf("=") === -1) {
          signals[signal] = 1;
        }
      });

      const activeSnapshot = buildBusSnapshot_(
        state.lastBuses,
        signals,
        1
      );

      assertKeyboard_(
        activeSnapshot.buffers.internal.KBD === "ACTIVE",
        "KBD tri-state buffer must be ACTIVE when En_KBD is enabled."
      );
    }

    guard++;
  }

  assertKeyboard_(
    state.halted,
    "CPU must finish the test program."
  );

  assertKeyboard_(
    getRegister("AX") === 0x41,
    "AX must receive character A (41h)."
  );

  assertKeyboard_(
    getRegister("DX") === 0x42,
    "DX must receive character B (42h)."
  );

  assertKeyboard_(
    JSON.stringify(received) === JSON.stringify([0x41, 0x42]),
    "CPU must receive keyboard bytes in FIFO order."
  );

  assertKeyboard_(
    keyboardQueueSize_() === 0,
    "IN must remove consumed characters from the queue."
  );

  // En_KBD disabled: KBD buffer must be HIGH_Z.
  const idleWord = createControlWord_({});
  const idleBuses = resolveControlBuses_(idleWord, {});
  const idleSnapshot = buildBusSnapshot_(
    idleBuses,
    idleWord.signals,
    0
  );

  assertKeyboard_(
    idleSnapshot.buffers.internal.KBD === "HIGH_Z",
    "KBD buffer must be HIGH_Z when En_KBD is disabled."
  );

  return {
    passed: true,
    AX: getRegister("AX"),
    DX: getRegister("DX"),
    received: received,
    queueRemaining: keyboardQueueSize_(),
    cpuHalted: state.halted
  };
}

/**
 * Synchronizes the BUSES dashboard with the last CPU micro-operation.
 *
 * The existing Buses.gs module already contains:
 * - KBD in the internal tri-state buffer map.
 * - buildBusSnapshot_()
 * - syncBusesDisplay_()
 */
function syncTask11BusesFromExecution_(state) {
  if (!state || !state.lastBuses) return;

  if (
    typeof buildBusSnapshot_ !== "function" ||
    typeof syncBusesDisplay_ !== "function"
  ) {
    return;
  }

  try {
    const signals = {};

    (state.lastActiveSignals || []).forEach(function(signal) {
      if (signal.indexOf("=") === -1) {
        signals[signal] = 1;
      }
    });

    const snapshot = buildBusSnapshot_(
      state.lastBuses,
      signals,
      1
    );

    saveBusesState_(snapshot);

    syncBusesDisplay_(
      snapshot,
      null,
      state.lastMicroStep
    );

  } catch (error) {
    // The CPU must continue running even if the BUSES sheet is unavailable.
    Logger.log(
      "Keyboard bus display warning: " + error.message
    );
  }
}
