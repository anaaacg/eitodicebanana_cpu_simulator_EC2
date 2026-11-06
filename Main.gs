
/**
 * EitoDiceBanana CPU Simulator
 * Main Controller - Phase 1
 *
 * Stable cooperative PAUSE mechanism.
 *
 * RUN and PAUSE communicate through
 * an independent Document Property.
 */

const EDB_RUN_CONFIG = {
  maxPhases: 4000,
  maxDurationMs: 150000,
  pausePollMs: 50,

  delays: {
    lento: 1000,
    normal: 500,
    rapido: 100
  }
};

const EDB_PAUSE_KEY = "EDB_PAUSE_REQUEST";

// ============================================
// MENU
// ============================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("EitoDiceBanana")
    .addItem("▶ STEP", "uiStep")
    .addItem("⏩ RUN", "uiRun")
    .addItem("⏸ PAUSE", "uiPause")
    .addItem("↩ RESUME", "uiResume")
    .addSeparator()
    .addItem("↺ RESET", "uiReset")
    .addItem("📥 LOAD PROGRAM", "uiLoadProgram")
    .addSeparator()
    .addItem("1️⃣ DEMO 1: Arithmetic & Mem", "loadDemo1")
    .addItem("2️⃣ DEMO 2: Loops & Labels", "loadDemo2")
    .addItem("3️⃣ DEMO 3: Keyboard & LCD I/O", "loadDemo3")
    .addToUi();
}

// ============================================
// SHARED HELPERS
// ============================================

function edbToast_(message, seconds) {
  SpreadsheetApp.getActive().toast(
    message,
    "EitoDiceBanana",
    seconds || 3
  );
}

function edbProperties_() {
  return PropertiesService.getDocumentProperties();
}

/**
 * Independent pause request.
 *
 * This property cannot be overwritten by
 * saveExecutionState_() in Execution.gs.
 */
function edbRequestPause_(requested) {
  edbProperties_().setProperty(
    EDB_PAUSE_KEY,
    requested ? "1" : "0"
  );
}

function edbPauseRequested_() {
  return edbProperties_().getProperty(
    EDB_PAUSE_KEY
  ) === "1";
}

/**
 * Exclusive access for STEP, RUN, RESET, LOAD.
 * PAUSE may signal without acquiring this lock.
 */
function edbWithCpuLock_(callback) {
  const lock = LockService.getDocumentLock();

  if (!lock) {
    throw new Error(
      "Document lock unavailable."
    );
  }

  if (!lock.tryLock(0)) {
    edbToast_(
      "CPU is executing. Press PAUSE first.",
      4
    );
    return null;
  }

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function edbGetRunDelay_() {
  const speed = String(
    cpuSheet_().getRange("G29").getValue()
  ).trim().toLowerCase();

  const normalized =
    speed === "rápido" ? "rapido" : speed;

  return EDB_RUN_CONFIG.delays[normalized] ??
    EDB_RUN_CONFIG.delays.normal;
}

/**
 * Sleeps in short intervals to check PAUSE.
 * Returns false when a pause is requested.
 */
function edbInterruptibleSleep_(durationMs) {
  let remaining = durationMs;

  while (remaining > 0) {
    if (edbPauseRequested_()) {
      return false;
    }

    const chunk = Math.min(
      remaining,
      EDB_RUN_CONFIG.pausePollMs
    );

    Utilities.sleep(chunk);
    remaining -= chunk;
  }

  return !edbPauseRequested_();
}

/**
 * Applies pause safely from the RUN process
 * after the current CPU phase finishes.
 */
function edbApplyPause_() {
  pauseCpu();
  SpreadsheetApp.flush();

  return getExecutionState_();
}

// ============================================
// STEP
// ============================================

function uiStep() {
  try {
    edbWithCpuLock_(() => {
      let state = getExecutionState_();

      if (state.halted) {
        edbToast_(
          "CPU halted. Press RESET or LOAD.",
          4
        );
        return;
      }

      // A manual STEP explicitly resumes execution.
      edbRequestPause_(false);

      if (state.paused) {
        resumeCpu();
      }

      stepCpu();
      SpreadsheetApp.flush();
    });

  } catch (error) {
    showSimulatorError_(error);
  }
}

// ============================================
// CONTINUOUS RUN
// ============================================

function edbRunContinuous_() {
  let state = getExecutionState_();

  if (state.halted) {
    edbToast_("CPU already halted.", 4);
    return state;
  }

  // A new RUN explicitly clears an old pause.
  // This happens only once, never inside the loop.
  edbRequestPause_(false);

  if (state.paused) {
    state = resumeCpu();
  }

  const delay = edbGetRunDelay_();
  const startedAt = Date.now();

  let completedPhases = 0;
  let stopReason = "PHASE_LIMIT";

  while (
    completedPhases < EDB_RUN_CONFIG.maxPhases
  ) {
    if (
      Date.now() - startedAt >=
      EDB_RUN_CONFIG.maxDurationMs
    ) {
      stopReason = "TIME_LIMIT";
      break;
    }

    // Check the independent signal.
    if (edbPauseRequested_()) {
      stopReason = "PAUSE";
      break;
    }

    state = getExecutionState_();

    if (state.halted) {
      stopReason = "HALT";
      break;
    }

    if (state.paused) {
      stopReason = "PAUSE";
      break;
    }

    // Execute a single phase.
    state = stepCpu();
    completedPhases++;

    SpreadsheetApp.flush();

    // Check again: PAUSE may have been pressed
    // while stepCpu() was updating the sheets.
    if (edbPauseRequested_()) {
      stopReason = "PAUSE";
      break;
    }

    if (state.halted) {
      stopReason = "HALT";
      break;
    }

    // Wait while checking for PAUSE every 50 ms.
    if (
      delay > 0 &&
      !edbInterruptibleSleep_(delay)
    ) {
      stopReason = "PAUSE";
      break;
    }
  }

  // Final check before returning.
  state = getExecutionState_();

  if (edbPauseRequested_() && !state.halted) {
    stopReason = "PAUSE";
  } else if (state.halted) {
    stopReason = "HALT";
  }

  if (stopReason === "PAUSE") {
    state = edbApplyPause_();

    edbToast_(
      "Execution paused at phase " +
      state.steps,
      4
    );

  } else if (stopReason === "HALT") {
    edbToast_(
      "Program finished: HALT | " +
      completedPhases + " phases",
      5
    );

  } else if (stopReason === "TIME_LIMIT") {
    edbToast_(
      "Time limit reached. Press RUN to continue.",
      5
    );

  } else {
    edbToast_(
      "Phase limit reached. Press RUN to continue.",
      5
    );
  }

  return state;
}

function uiRun() {
  try {
    edbWithCpuLock_(() => {
      edbRunContinuous_();
    });

  } catch (error) {
    showSimulatorError_(error);
  }
}

// ============================================
// PAUSE
// ============================================

function uiPause() {
  try {
    const state = getExecutionState_();

    if (state.halted) {
      edbToast_(
        "CPU is already halted.",
        3
      );
      return;
    }

    // First, write the independent signal.
    // RUN cannot overwrite this property
    // when it saves its execution state.
    edbRequestPause_(true);

    const lock = LockService.getDocumentLock();

    if (lock && lock.tryLock(0)) {
      // RUN is not holding the CPU lock.
      // We can safely update the visible status.
      try {
        pauseCpu();
        SpreadsheetApp.flush();
      } finally {
        lock.releaseLock();
      }

      edbToast_(
        "Execution paused",
        3
      );

    } else {
      // RUN is active. It will apply the pause
      // safely after its current phase finishes.
      edbToast_(
        "PAUSE requested",
        3
      );
    }

  } catch (error) {
    showSimulatorError_(error);
  }
}

// ============================================
// RESUME
// ============================================

function uiResume() {
  try {
    edbWithCpuLock_(() => {
      const state = getExecutionState_();

      if (state.halted) {
        edbToast_(
          "CPU halted. Reset first.",
          3
        );
        return;
      }

      edbRequestPause_(false);
      resumeCpu();

      edbToast_(
        "CPU ready. Press RUN to continue.",
        4
      );
    });

  } catch (error) {
    showSimulatorError_(error);
  }
}

// ============================================
// RESET
// ============================================

function uiReset() {
  try {
    edbWithCpuLock_(() => {
      edbRequestPause_(false);

      resetCpu();
      SpreadsheetApp.flush();

      edbToast_(
        "CPU reset completed",
        3
      );
    });

  } catch (error) {
    showSimulatorError_(error);
  }
}

// ============================================
// LOAD PROGRAM
// ============================================

function uiLoadProgram() {
  try {
    edbWithCpuLock_(() => {
      edbRequestPause_(false);

      loadProgramFromInterface();
      SpreadsheetApp.flush();
    });

  } catch (error) {
    showSimulatorError_(error);
  }
}

// ============================================
// ERROR HANDLING
// ============================================

function showSimulatorError_(error) {
  const message = error && error.message
    ? error.message
    : String(error);

  SpreadsheetApp.getUi().alert(
    "EitoDiceBanana - Error\n\n" +
    message
  );
}
