
/**
 * EitoDiceBanana CPU Simulator
 * Cache Hierarchy - Phase 2 / Task 09
 *
 * L1I: 8 bytes, 1 line, instruction only
 * L1D: 8 bytes, 1 line, data only
 * L2: 32 bytes, 4 lines of 8 bytes, unified
 *
 * Addressing: Physical addresses 00h-FFh
 * L1 replacement: Single-line replacement
 * L2 replacement: FIFO
 * Write policy: Write-through + Write-allocate
 *
 * The cache accesses physical RAM through
 * the existing Memory.gs module.
 *
 * Integration with the MMU and CPU will be
 * implemented after independent testing.
 */

// ============================================
// CONFIGURATION
// ============================================

const CACHE_STATE_KEY = "EDB_CACHE_STATE";

const CACHE_LINE_SIZE = 8;
const CACHE_L1I_LINES = 1;
const CACHE_L1D_LINES = 1;
const CACHE_L2_LINES = 4;

const CACHE_LAYOUT = {
  sheet: "CACHE",
  title: "B2",
  tableStartRow: 9,
  eventStartRow: 29,
  eventCount: 10
};

// ============================================
// CACHE LINE AND STATE
// ============================================

function emptyCacheLine_() {
  return {
    valid: 0,
    tag: null,
    bytes: Array(CACHE_LINE_SIZE).fill(0),
    loadedAt: 0
  };
}

function defaultCacheState_() {
  return {
    version: 1,
    sequence: 0,

    l1i: emptyCacheLine_(),
    l1d: emptyCacheLine_(),

    l2: Array.from(
      { length: CACHE_L2_LINES },
      function() {
        return emptyCacheLine_();
      }
    ),

    stats: {
      l1iHits: 0,
      l1iMisses: 0,
      l1dHits: 0,
      l1dMisses: 0,
      l2Hits: 0,
      l2Misses: 0,
      ramAccesses: 0,
      writes: 0,
      l1Replacements: 0,
      l2Replacements: 0,
      invalidations: 0
    },

    lastAccess: {
      address: null,
      operation: "-",
      path: "-",
      result: "-",
      value: null
    },

    events: []
  };
}

function cacheProperties_() {
  return PropertiesService
    .getDocumentProperties();
}

function saveCacheState_(state) {
  cacheProperties_().setProperty(
    CACHE_STATE_KEY,
    JSON.stringify(state)
  );
}

function getCacheState_() {
  const raw = cacheProperties_()
    .getProperty(CACHE_STATE_KEY);

  if (!raw) {
    const state = defaultCacheState_();
    saveCacheState_(state);
    return state;
  }

  try {
    const state = JSON.parse(raw);

    if (
      !state ||
      !state.l1i ||
      !state.l1d ||
      !Array.isArray(state.l2) ||
      state.l2.length !== CACHE_L2_LINES ||
      !state.stats ||
      !Array.isArray(state.events)
    ) {
      throw new Error("Invalid cache state");
    }

    return state;

  } catch (error) {
    throw new Error(
      "Cache state is corrupted: " +
      error.message +
      ". Run resetCacheModule() if appropriate."
    );
  }
}

// ============================================
// VALIDATION AND ADDRESSING
// ============================================

function validateCacheConfiguration_() {
  if (
    CACHE_LINE_SIZE !== 8 ||
    CACHE_L1I_LINES !== 1 ||
    CACHE_L1D_LINES !== 1 ||
    CACHE_L2_LINES !== 4 ||
    CACHE_L2_LINES * CACHE_LINE_SIZE !== 32
  ) {
    throw new Error(
      "Invalid Task 09 cache configuration."
    );
  }

  return true;
}

function getCacheAddressInfo(address) {
  validateAddress_(address);

  return {
    address: address,
    block: Math.floor(
      address / CACHE_LINE_SIZE
    ),
    tag: Math.floor(
      address / CACHE_LINE_SIZE
    ),
    offset: address % CACHE_LINE_SIZE,
    blockStart:
      Math.floor(address / CACHE_LINE_SIZE) *
      CACHE_LINE_SIZE,
    frame: Math.floor(address / 32)
  };
}

function cacheHex_(value) {
  if (value === null || value === undefined) {
    return "--";
  }

  return byteToHex_(value);
}

// ============================================
// PHYSICAL RAM LINE ACCESS
// ============================================

/**
 * Reads eight consecutive physical bytes
 * in one spreadsheet operation.
 *
 * Every cache block is aligned to 8 bytes.
 */
function readPhysicalCacheLine_(block) {
  if (
    !Number.isInteger(block) ||
    block < 0 ||
    block >= 32
  ) {
    throw new Error(
      "Invalid physical cache block: " + block
    );
  }

  const start = block * CACHE_LINE_SIZE;
  const position = addressToCell(start);

  const raw = memorySheet_()
    .getRange(
      position.row,
      position.column,
      1,
      CACHE_LINE_SIZE
    )
    .getDisplayValues()[0];

  return raw.map(function(value, index) {
    return parsePhysicalMemoryCell_(
      value,
      start + index
    );
  });
}

// ============================================
// CACHE HELPERS
// ============================================

function findL2Line_(state, tag) {
  return state.l2.findIndex(function(line) {
    return line.valid === 1 &&
      line.tag === tag;
  });
}

function createLoadedCacheLine_(
  tag,
  bytes,
  sequence
) {
  if (
    !Array.isArray(bytes) ||
    bytes.length !== CACHE_LINE_SIZE ||
    !bytes.every(isValidByte)
  ) {
    throw new Error(
      "Cache line must contain 8 valid bytes."
    );
  }

  return {
    valid: 1,
    tag: tag,
    bytes: bytes.slice(),
    loadedAt: sequence
  };
}

function installL2Line_(state, tag, bytes) {
  let index = state.l2.findIndex(
    function(line) {
      return line.valid === 0;
    }
  );

  if (index === -1) {
    let oldest = Infinity;

    state.l2.forEach(function(line, i) {
      if (line.loadedAt < oldest) {
        oldest = line.loadedAt;
        index = i;
      }
    });

    state.stats.l2Replacements++;
  }

  state.sequence++;

  state.l2[index] = createLoadedCacheLine_(
    tag,
    bytes,
    state.sequence
  );

  return index;
}

function installL1Line_(
  state,
  cacheType,
  tag,
  bytes
) {
  const key =
    cacheType === "INSTRUCTION"
      ? "l1i"
      : "l1d";

  if (
    state[key].valid === 1 &&
    state[key].tag !== tag
  ) {
    state.stats.l1Replacements++;
  }

  state.sequence++;

  state[key] = createLoadedCacheLine_(
    tag,
    bytes,
    state.sequence
  );
}

function addCacheEvent_(state, event, detail) {
  state.events.push({
    event: event,
    detail: detail,
    time: new Date().toISOString()
  });

  state.events = state.events.slice(-10);
}

// ============================================
// CENTRAL CACHE ACCESS
// ============================================

/**
 * Access hierarchy:
 *
 * L1I / L1D
 *      |
 *      v
 *     L2
 *      |
 *      v
 * Physical RAM
 *
 * Returns the requested byte.
 */
function accessPhysicalCache_(address, type) {
  validateAddress_(address);
  validateCacheConfiguration_();

  if (
    type !== "INSTRUCTION" &&
    type !== "DATA"
  ) {
    throw new Error(
      "Invalid cache access type: " + type
    );
  }

  const state = getCacheState_();
  const info = getCacheAddressInfo(address);

  const l1Key =
    type === "INSTRUCTION"
      ? "l1i"
      : "l1d";

  const hitKey =
    type === "INSTRUCTION"
      ? "l1iHits"
      : "l1dHits";

  const missKey =
    type === "INSTRUCTION"
      ? "l1iMisses"
      : "l1dMisses";

  const l1 = state[l1Key];

  let value;
  let path;
  let result;

  // L1 HIT
  if (
    l1.valid === 1 &&
    l1.tag === info.tag
  ) {
    state.stats[hitKey]++;

    value = l1.bytes[info.offset];
    path = l1Key.toUpperCase();
    result = "L1 HIT";

    addCacheEvent_(
      state,
      result,
      path + " block " + info.block
    );

  } else {
    // L1 MISS
    state.stats[missKey]++;

    const l2Index = findL2Line_(
      state,
      info.tag
    );

    let bytes;

    if (l2Index !== -1) {
      // L2 HIT
      state.stats.l2Hits++;

      bytes = state.l2[l2Index].bytes.slice();
      path = "L2";
      result = "L1 MISS / L2 HIT";

    } else {
      // L2 MISS / RAM ACCESS
      state.stats.l2Misses++;
      state.stats.ramAccesses++;

      bytes = readPhysicalCacheLine_(
        info.block
      );

      installL2Line_(
        state,
        info.tag,
        bytes
      );

      path = "RAM";
      result = "L1 MISS / L2 MISS";

      addCacheEvent_(
        state,
        "LINE LOADED",
        "RAM -> L2, block " + info.block
      );
    }

    installL1Line_(
      state,
      type,
      info.tag,
      bytes
    );

    value = bytes[info.offset];

    addCacheEvent_(
      state,
      result,
      path + " -> " + l1Key.toUpperCase()
    );
  }

  state.lastAccess = {
    address: address,
    operation:
      type === "INSTRUCTION"
        ? "FETCH"
        : "READ",
    path: path,
    result: result,
    value: value
  };

  saveCacheState_(state);
  syncCacheDashboard_(state);

  return value;
}

// ============================================
// PUBLIC CACHE READ OPERATIONS
// ============================================

function cacheReadInstruction(address) {
  return accessPhysicalCache_(
    address,
    "INSTRUCTION"
  );
}

function cacheReadData(address) {
  return accessPhysicalCache_(
    address,
    "DATA"
  );
}

// ============================================
// DATA CACHE WRITE
// ============================================

/**
 * WRITE-THROUGH + WRITE-ALLOCATE
 *
 * 1. Ensure that the block is present in L1D.
 * 2. Write the new value to physical RAM.
 * 3. Update L1D.
 * 4. Update the corresponding L2 line.
 * 5. Invalidate matching L1I, if necessary.
 *
 * No dirty cache lines are required.
 */
function cacheWriteData(address, value) {
  validateAddress_(address);
  validateByte_(value);

  // Write-allocate: load the block if absent.
  accessPhysicalCache_(address, "DATA");

  const state = getCacheState_();
  const info = getCacheAddressInfo(address);

  // Write-through to physical RAM.
  Write(address, value);

  // Update L1D.
  if (
    state.l1d.valid === 1 &&
    state.l1d.tag === info.tag
  ) {
    state.l1d.bytes[info.offset] = value;
  }

  // Update L2.
  const index = findL2Line_(
    state,
    info.tag
  );

  if (index !== -1) {
    state.l2[index].bytes[info.offset] =
      value;
  }

  // Instruction coherence:
  // invalidate L1I if code bytes were modified.
  if (
    state.l1i.valid === 1 &&
    state.l1i.tag === info.tag
  ) {
    state.l1i = emptyCacheLine_();
    state.stats.invalidations++;

    addCacheEvent_(
      state,
      "L1I INVALIDATED",
      "Physical block " + info.block
    );
  }

  state.stats.writes++;

  state.lastAccess = {
    address: address,
    operation: "WRITE",
    path: "L1D -> L2 -> RAM",
    result: "WRITE-THROUGH",
    value: value
  };

  addCacheEvent_(
    state,
    "WRITE-THROUGH",
    cacheHex_(address) + "h = " +
    cacheHex_(value) + "h"
  );

  saveCacheState_(state);
  syncCacheDashboard_(state);

  return value;
}

// ============================================
// PHYSICAL FRAME INVALIDATION
// ============================================

/**
 * Invalidates all cached blocks belonging
 * to a physical RAM frame.
 *
 * Must be called when the paging system
 * replaces the contents of a frame.
 *
 * A frame is 32 bytes = four cache blocks.
 */
function invalidateCachePhysicalFrame(frame) {
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= 8
  ) {
    throw new Error(
      "Invalid frame for cache invalidation: " +
      frame
    );
  }

  const state = getCacheState_();

  const firstBlock = frame * 4;
  const lastBlock = firstBlock + 3;

  function belongsToFrame(line) {
    return (
      line.valid === 1 &&
      line.tag >= firstBlock &&
      line.tag <= lastBlock
    );
  }

  let count = 0;

  if (belongsToFrame(state.l1i)) {
    state.l1i = emptyCacheLine_();
    count++;
  }

  if (belongsToFrame(state.l1d)) {
    state.l1d = emptyCacheLine_();
    count++;
  }

  state.l2 = state.l2.map(function(line) {
    if (belongsToFrame(line)) {
      count++;
      return emptyCacheLine_();
    }

    return line;
  });

  state.stats.invalidations += count;

  addCacheEvent_(
    state,
    "FRAME INVALIDATION",
    "Frame " + frame +
    " / " + count + " lines"
  );

  saveCacheState_(state);
  syncCacheDashboard_(state);

  return count;
}

// ============================================
// CACHE STATISTICS
// ============================================

function getCacheStatistics() {
  return getCacheState_().stats;
}

function getCacheContents() {
  const state = getCacheState_();

  return {
    l1i: state.l1i,
    l1d: state.l1d,
    l2: state.l2
  };
}

// ============================================
// CACHE DASHBOARD
// ============================================

function cacheSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(CACHE_LAYOUT.sheet);

  if (!sheet) {
    throw new Error(
      'CACHE sheet was not found.'
    );
  }

  return sheet;
}

/**
 * Initializes the CACHE visualization.
 * Does not clear any other sheet.
 */
function renderCacheDashboard() {
  const sheet = cacheSheet_();
  const C = CONFIG.COLORS;

  sheet.getRange("B2:M40")
    .setBackground(C.background)
    .setFontColor(C.white);

  sheet.getRange("B2")
    .setValue(
      "EitoDiceBanana - MULTILEVEL CACHE"
    )
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setFontSize(14);

  sheet.getRange("B4")
    .setValue("L1I: 8 B / 1 LINE")
    .setFontColor(C.green)
    .setFontWeight("bold");

  sheet.getRange("F4")
    .setValue("L1D: 8 B / 1 LINE")
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  sheet.getRange("J4")
    .setValue("L2: 32 B / 4 LINES")
    .setFontColor(C.green)
    .setFontWeight("bold");

  sheet.getRange("B6")
    .setValue(
      "POLICY: FIFO / WRITE-THROUGH / WRITE-ALLOCATE"
    )
    .setFontColor(C.muted);

  const headers = [[
    "CACHE",
    "TAG",
    "VALID",
    "TYPE",
    "B0",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "B6",
    "B7"
  ]];

  sheet.getRange("B8:M8")
    .setValues(headers)
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("B18")
    .setValue("LAST MEMORY ACCESS")
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  const accessLabels = [
    ["B19", "ADDRESS"],
    ["B20", "OPERATION"],
    ["B21", "PATH"],
    ["B22", "RESULT"],
    ["B23", "VALUE"]
  ];

  accessLabels.forEach(function(item) {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setFontColor(C.muted);
  });

  sheet.getRange("G18")
    .setValue("CACHE STATISTICS")
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  const statLabels = [
    "L1I HITS",
    "L1I MISSES",
    "L1D HITS",
    "L1D MISSES",
    "L2 HITS",
    "L2 MISSES",
    "RAM LINE LOADS",
    "WRITES",
    "L2 REPLACEMENTS",
    "INVALIDATIONS"
  ];

  statLabels.forEach(function(label, index) {
    sheet.getRange(19 + index, 7)
      .setValue(label)
      .setFontColor(C.muted);
  });

  sheet.getRange("B27")
    .setValue("RECENT CACHE EVENTS")
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  sheet.getRange("B28:D28")
    .setValues([[
      "TIME",
      "EVENT",
      "DETAIL"
    ]])
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 170);
  sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 110);

  for (let col = 6; col <= 13; col++) {
    sheet.setColumnWidth(col, 105);
  }

  sheet.setColumnWidth(14, 210);

  syncCacheDashboard_(
    getCacheState_()
  );

  SpreadsheetApp.flush();
}

// ============================================
// DASHBOARD SYNCHRONIZATION
// ============================================

function syncCacheDashboard_(cacheState) {
  const sheet = cacheSheet_();
  const C = CONFIG.COLORS;

  const state =
    cacheState || getCacheState_();

  const lines = [
    ["L1I", state.l1i, "INSTRUCTION"],
    ["L1D", state.l1d, "DATA"],
    ["L2-0", state.l2[0], "UNIFIED"],
    ["L2-1", state.l2[1], "UNIFIED"],
    ["L2-2", state.l2[2], "UNIFIED"],
    ["L2-3", state.l2[3], "UNIFIED"]
  ];

  const matrix = lines.map(function(item) {
    const line = item[1];

    return [
      item[0],
      line.valid === 1
        ? line.tag.toString(16)
            .toUpperCase()
        : "--",
      line.valid,
      item[2]
    ].concat(
      line.valid === 1
        ? line.bytes.map(cacheHex_)
        : Array(8).fill("--")
    );
  });

  sheet.getRange(9, 2, 6, 12)
    .setNumberFormat("@")
    .setValues(matrix)
    .setBackground(C.panel)
    .setFontColor(C.white)
    .setHorizontalAlignment("center");

  lines.forEach(function(item, index) {
    const valid = item[1].valid === 1;

    sheet.getRange(9 + index, 4)
      .setFontColor(
        valid ? C.green : C.red
      )
      .setFontWeight("bold");
  });

  const last = state.lastAccess;

  const accessValues = [
    last.address === null
      ? "--"
      : cacheHex_(last.address) + "h",
    last.operation,
    last.path,
    last.result,
    last.value === null
      ? "--"
      : cacheHex_(last.value) + "h"
  ];

  sheet.getRange("D19:D23")
    .setValues(
      accessValues.map(function(value) {
        return [value];
      })
    )
    .setBackground(C.panelAlt)
    .setFontColor(C.white)
    .setFontWeight("bold");

  const stats = state.stats;

  const statValues = [
    stats.l1iHits,
    stats.l1iMisses,
    stats.l1dHits,
    stats.l1dMisses,
    stats.l2Hits,
    stats.l2Misses,
    stats.ramAccesses,
    stats.writes,
    stats.l2Replacements,
    stats.invalidations
  ];

  sheet.getRange(19, 10, 10, 1)
    .setValues(
      statValues.map(function(value) {
        return [value];
      })
    )
    .setBackground(C.panelAlt)
    .setFontColor(C.green)
    .setFontWeight("bold");

  const eventRows = Array.from(
    { length: CACHE_LAYOUT.eventCount },
    function() {
      return ["", "", ""];
    }
  );

  state.events.slice(-10)
    .forEach(function(event, index, events) {
      const row =
        CACHE_LAYOUT.eventCount -
        events.length + index;

      eventRows[row] = [
        event.time.substring(11, 19),
        event.event,
        event.detail
      ];
    });

  sheet.getRange(
    CACHE_LAYOUT.eventStartRow,
    2,
    CACHE_LAYOUT.eventCount,
    3
  )
    .setValues(eventRows)
    .setBackground(C.panel)
    .setFontColor(C.white);

  for (let i = 0; i < eventRows.length; i++) {
    const eventName = eventRows[i][1];

    const color =
      eventName.indexOf("HIT") !== -1
        ? C.green
        : eventName.indexOf("MISS") !== -1
          ? C.yellow
          : eventName.indexOf("INVALIDAT") !== -1
            ? C.red
            : C.white;

    sheet.getRange(
      CACHE_LAYOUT.eventStartRow + i,
      3
    ).setFontColor(color);
  }
}

// ============================================
// RESET
// ============================================

function resetCacheModule() {
  const state = defaultCacheState_();

  saveCacheState_(state);

  syncCacheDashboard_(state);

  Logger.log(
    "PASS: Cache hierarchy reset"
  );

  return state;
}

// ============================================
// TASK 09 TESTS
// ============================================

function testCacheModule() {
  const props = cacheProperties_();

  const oldCache =
    props.getProperty(CACHE_STATE_KEY);

  // Preserve physical RAM value modified by
  // the write-through test.
  const testAddress = 0x90;
  const oldValue = readRawMemory_(testAddress);

  function assert(condition, message) {
    if (!condition) {
      throw new Error(
        "TASK 09 CACHE TEST FAILED: " +
        message
      );
    }
  }

  Logger.log(
    "=== TASK 09 CACHE TESTS ==="
  );

  try {
    resetCacheModule();

    // TEST 1: Cache capacities
    assert(
      CACHE_L1I_LINES *
        CACHE_LINE_SIZE === 8,
      "L1I capacity"
    );

    assert(
      CACHE_L1D_LINES *
        CACHE_LINE_SIZE === 8,
      "L1D capacity"
    );

    assert(
      CACHE_L2_LINES *
        CACHE_LINE_SIZE === 32,
      "L2 capacity"
    );

    Logger.log(
      "PASS: L1I=8B, L1D=8B, L2=32B"
    );

    // TEST 2: Instruction fetch
    const firstInstruction =
      cacheReadInstruction(0x00);

    const secondInstruction =
      cacheReadInstruction(0x00);

    assert(
      firstInstruction === secondInstruction,
      "Instruction read mismatch"
    );

    let stats = getCacheStatistics();

    assert(
      stats.l1iHits >= 1 &&
      stats.l1iMisses >= 1,
      "Instruction L1 HIT/MISS"
    );

    Logger.log(
      "PASS: L1I instruction fetch HIT/MISS"
    );

    // TEST 3: Unified L2 HIT
    cacheReadData(0x00);

    stats = getCacheStatistics();

    assert(
      stats.l2Hits >= 1,
      "L2 unified cache HIT"
    );

    Logger.log(
      "PASS: Unified L2 HIT"
    );

    // TEST 4: Data write-through
    cacheWriteData(
      testAddress,
      0xA5
    );

    assert(
      readRawMemory_(testAddress) === 0xA5,
      "Write-through RAM consistency"
    );

    assert(
      cacheReadData(testAddress) === 0xA5,
      "L1D value consistency"
    );

    Logger.log(
      "PASS: L1D WRITE-THROUGH / RAM"
    );

    // TEST 5: L2 replacement
    resetCacheModule();

    [
      0x80,
      0x88,
      0x90,
      0x98,
      0xA0
    ].forEach(function(address) {
      cacheReadData(address);
    });

    stats = getCacheStatistics();

    assert(
      stats.l2Replacements >= 1,
      "FIFO replacement"
    );

    Logger.log(
      "PASS: L2 FIFO replacement"
    );

    // TEST 6: Frame invalidation
    const invalidated =
      invalidateCachePhysicalFrame(5);

    assert(
      invalidated >= 1,
      "Physical frame invalidation"
    );

    const contents = getCacheContents();

    assert(
      contents.l2.every(function(line) {
        return (
          line.valid === 0 ||
          line.tag < 20 ||
          line.tag > 23
        );
      }),
      "Frame 5 must not remain cached"
    );

    Logger.log(
      "PASS: Physical frame cache invalidation"
    );

    Logger.log(
      "=== ALL TASK 09 CACHE TESTS PASSED ==="
    );

    return {
      passed: true,
      l1iBytes: 8,
      l1dBytes: 8,
      l2Bytes: 32,
      lineBytes: 8,
      writePolicy: "WRITE-THROUGH",
      replacementPolicy: "FIFO"
    };

  } finally {
    // Restore the physical byte.
    Write(testAddress, oldValue);

    // Restore the prior cache state.
    if (oldCache === null) {
      props.deleteProperty(CACHE_STATE_KEY);

      syncCacheDashboard_(
        defaultCacheState_()
      );

    } else {
      props.setProperty(
        CACHE_STATE_KEY,
        oldCache
      );

      syncCacheDashboard_(
        JSON.parse(oldCache)
      );
    }

    Logger.log(
      "Cache state and test byte restored"
    );
  }
}
