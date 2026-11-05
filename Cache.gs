
/**
 * EitoDiceBanana CPU Simulator
 * Multilevel Cache Hierarchy & Hit/Miss Performance Monitoring
 * Phase 2 / Tasks 09-10
 *
 * L1I: 8 bytes, instruction cache
 * L1D: 8 bytes, data cache
 * L2: 32 bytes, unified cache
 *
 * Line size: 8 bytes
 * Replacement: L1 single-line, L2 FIFO
 * Write policy: Write-through + Write-allocate
 */

const CACHE_STATE_KEY = "EDB_CACHE_STATE";
const CACHE_LINE_SIZE = 8;
const CACHE_L1I_LINES = 1;
const CACHE_L1D_LINES = 1;
const CACHE_L2_LINES = 4;

const CACHE_LAYOUT = {
  sheet: "CACHE",
  title: "B2",
  tableStartRow: 9,
  metricsStartRow: 20,
  eventStartRow: 32,
  eventCount: 10
};

// ============================================
// CACHE STATE
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
      value: null,
      hitStatus: "-",
      transferFlow: "-"
    },
    events: []
  };
}

function cacheProperties_() {
  return PropertiesService.getDocumentProperties();
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
    const fresh = defaultCacheState_();
    saveCacheState_(fresh);
    return fresh;
  }

  try {
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      !parsed.l1i ||
      !parsed.l1d ||
      !Array.isArray(parsed.l2) ||
      parsed.l2.length !== CACHE_L2_LINES ||
      !parsed.stats
    ) {
      const fresh = defaultCacheState_();
      saveCacheState_(fresh);
      return fresh;
    }

    if (!parsed.lastAccess) {
      parsed.lastAccess =
        defaultCacheState_().lastAccess;
    }

    return parsed;
  } catch (error) {
    const fresh = defaultCacheState_();
    saveCacheState_(fresh);
    return fresh;
  }
}

// ============================================
// CONFIGURATION AND ADDRESSING
// ============================================

function validateCacheConfiguration_() {
  if (
    CACHE_LINE_SIZE !== 8 ||
    CACHE_L1I_LINES !== 1 ||
    CACHE_L1D_LINES !== 1 ||
    CACHE_L2_LINES !== 4 ||
    PHYSICAL_RAM_SIZE !== 256
  ) {
    throw new Error("Invalid cache configuration.");
  }
  return true;
}

function getCacheAddressInfo(address) {
  validateAddress_(address);

  const block = Math.floor(
    address / CACHE_LINE_SIZE
  );
  const offset = address % CACHE_LINE_SIZE;

  return {
    address: address,
    block: block,
    tag: block,
    offset: offset,
    blockStart: block * CACHE_LINE_SIZE,
    blockEnd:
      block * CACHE_LINE_SIZE +
      CACHE_LINE_SIZE - 1
  };
}

function cacheHex_(value) {
  if (value === null || value === undefined) {
    return "--";
  }

  return value.toString(16)
    .toUpperCase()
    .padStart(2, "0");
}

function readPhysicalCacheLine_(block) {
  const start = block * CACHE_LINE_SIZE;
  const bytes = [];

  for (
    let offset = 0;
    offset < CACHE_LINE_SIZE;
    offset++
  ) {
    bytes.push(readRawMemory_(start + offset));
  }

  return bytes;
}

// ============================================
// CACHE LOOKUP AND INSERTION
// ============================================

function findL2Line_(state, tag) {
  for (let i = 0; i < state.l2.length; i++) {
    if (
      state.l2[i].valid === 1 &&
      state.l2[i].tag === tag
    ) {
      return i;
    }
  }

  return -1;
}

function createLoadedCacheLine_(state, tag, bytes) {
  state.sequence++;

  return {
    valid: 1,
    tag: tag,
    bytes: bytes.slice(),
    loadedAt: state.sequence
  };
}

function installL2Line_(state, tag, bytes) {
  for (let i = 0; i < state.l2.length; i++) {
    if (state.l2[i].valid === 0) {
      state.l2[i] = createLoadedCacheLine_(
        state, tag, bytes
      );
      return {
        index: i,
        replaced: false
      };
    }
  }

  let victimIndex = 0;
  let oldest = state.l2[0].loadedAt;

  for (let i = 1; i < state.l2.length; i++) {
    if (state.l2[i].loadedAt < oldest) {
      oldest = state.l2[i].loadedAt;
      victimIndex = i;
    }
  }

  state.stats.l2Replacements++;

  state.l2[victimIndex] = createLoadedCacheLine_(
    state, tag, bytes
  );

  return {
    index: victimIndex,
    replaced: true
  };
}

function installL1Line_(state, type, tag, bytes) {
  const key =
    type === "INSTRUCTION" ? "l1i" : "l1d";

  if (
    state[key].valid === 1 &&
    state[key].tag !== tag
  ) {
    state.stats.l1Replacements++;
  }

  state[key] = createLoadedCacheLine_(
    state, tag, bytes
  );

  return state[key];
}

function addCacheEvent_(state, event, detail) {
  state.events.push({
    time: new Date().toISOString(),
    event: event,
    detail: detail
  });

  if (state.events.length > 50) {
    state.events = state.events.slice(-50);
  }
}

// ============================================
// HIT RATE CALCULATIONS
// ============================================

function calculateCacheHitRate_(hits, misses) {
  const h = Number(hits) || 0;
  const m = Number(misses) || 0;
  const total = h + m;

  if (total === 0) {
    return {
      hits: 0,
      misses: 0,
      total: 0,
      rate: 0,
      formatted: "0.0%"
    };
  }

  const rate = (h / total) * 100;

  return {
    hits: h,
    misses: m,
    total: total,
    rate: rate,
    formatted: rate.toFixed(1) + "%"
  };
}

function getCachePerformanceMetrics() {
  const stats = getCacheState_().stats;

  const l1i = calculateCacheHitRate_(
    stats.l1iHits,
    stats.l1iMisses
  );

  const l1d = calculateCacheHitRate_(
    stats.l1dHits,
    stats.l1dMisses
  );

  const l2 = calculateCacheHitRate_(
    stats.l2Hits,
    stats.l2Misses
  );

  const totalHits =
    stats.l1iHits +
    stats.l1dHits +
    stats.l2Hits;

  const totalMisses =
    stats.l1iMisses +
    stats.l1dMisses +
    stats.l2Misses;

  const overall = calculateCacheHitRate_(
    totalHits,
    totalMisses
  );

  return {
    l1i: l1i,
    l1d: l1d,
    l2: l2,
    overall: overall,
    rawStats: stats
  };
}

// ============================================
// CACHE HIT/MISS ACCESS
// ============================================

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
    type === "INSTRUCTION" ? "l1i" : "l1d";

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
  let hitStatus;
  let transferFlow;

  // L1 HIT
  if (
    l1.valid === 1 &&
    l1.tag === info.tag
  ) {
    state.stats[hitKey]++;
    value = l1.bytes[info.offset];
    path = l1Key.toUpperCase();
    result = "L1 HIT";
    hitStatus = "HIT";

    transferFlow =
      type === "INSTRUCTION"
        ? "L1I → CPU"
        : "L1D → CPU";

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
      hitStatus = "L2 HIT";

      transferFlow =
        type === "INSTRUCTION"
          ? "L2 → L1I → CPU"
          : "L2 → L1D → CPU";

      addCacheEvent_(
        state,
        result,
        "L2 block " + info.block +
        " → " + l1Key.toUpperCase()
      );

    } else {
      // L2 MISS
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
      hitStatus = "MISS";

      transferFlow =
        type === "INSTRUCTION"
          ? "RAM → L2 → L1I → CPU"
          : "RAM → L2 → L1D → CPU";

      addCacheEvent_(
        state,
        "LINE LOADED",
        "RAM → L2, block " + info.block
      );

      addCacheEvent_(
        state,
        result,
        "RAM → L2 → " + l1Key.toUpperCase()
      );
    }

    installL1Line_(
      state,
      type,
      info.tag,
      bytes
    );

    value = bytes[info.offset];
  }

  state.lastAccess = {
    address: address,
    operation:
      type === "INSTRUCTION" ? "FETCH" : "READ",
    path: path,
    result: result,
    value: value,
    hitStatus: hitStatus,
    transferFlow: transferFlow
  };

  saveCacheState_(state);
  syncCacheDashboard_(state);

  return value;
}

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

function cacheWriteData(address, value) {
  validateAddress_(address);
  validateByte_(value);

  // Write-allocate
  accessPhysicalCache_(address, "DATA");

  const state = getCacheState_();
  const info = getCacheAddressInfo(address);

  // Write-through
  Write(address, value);

  if (
    state.l1d.valid === 1 &&
    state.l1d.tag === info.tag
  ) {
    state.l1d.bytes[info.offset] = value;
  }

  const index = findL2Line_(
    state,
    info.tag
  );

  if (index !== -1) {
    state.l2[index].bytes[info.offset] = value;
  }

  // Invalidate instruction line if modified
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
    path: "L1D → L2 → RAM",
    result: "WRITE-THROUGH",
    value: value,
    hitStatus: "WRITE-THROUGH",
    transferFlow: "CPU → L1D → L2 → RAM"
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

function renderCacheDashboard() {
  const sheet = cacheSheet_();
  const C = CONFIG.COLORS;

  sheet.getRange("B2:N45")
    .setBackground(C.background)
    .setFontColor(C.white);

  sheet.getRange("B2")
    .setValue(
      "EitoDiceBanana — MULTILEVEL CACHE (L1I / L1D / L2) & MONITORING"
    )
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setFontSize(14);

  sheet.getRange("B4")
    .setValue("L1I: 8 B / 1 LINE (INSTRUCTION)")
    .setFontColor(C.green)
    .setFontWeight("bold");

  sheet.getRange("F4")
    .setValue("L1D: 8 B / 1 LINE (DATA)")
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  sheet.getRange("J4")
    .setValue("L2: 32 B / 4 LINES (UNIFIED / FIFO)")
    .setFontColor(C.green)
    .setFontWeight("bold");

  sheet.getRange("B6")
    .setValue(
      "POLICIES: FIFO REPLACEMENT | WRITE-THROUGH | WRITE-ALLOCATE"
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
    .setValue("LAST MEMORY ACCESS & FLOW")
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  const accessLabels = [
    ["B19", "ADDRESS"],
    ["B20", "OPERATION"],
    ["B21", "PATH"],
    ["B22", "RESULT"],
    ["B23", "VALUE"],
    ["B24", "TRANSFER FLOW"],
    ["B25", "HIT / MISS STATUS"]
  ];

  accessLabels.forEach(function(item) {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setFontColor(C.muted)
      .setFontWeight("bold");
  });

  sheet.getRange("G18")
    .setValue(
      "CACHE PERFORMANCE & HIT RATES (TASK 10)"
    )
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  const perfHeaders = [[
    "LEVEL",
    "HITS",
    "MISSES",
    "TOTAL ACCESSES",
    "HIT RATE"
  ]];

  sheet.getRange("G19:K19")
    .setValues(perfHeaders)
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const levelLabels = [
    ["G20", "L1I (Instructions)"],
    ["G21", "L1D (Data)"],
    ["G22", "L2 (Unified)"],
    ["G23", "OVERALL (System)"]
  ];

  levelLabels.forEach(function(item) {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setFontColor(C.white)
      .setFontWeight("bold");
  });

  const auxStats = [
    ["G25", "RAM LINE LOADS"],
    ["G26", "WRITES (Write-Through)"],
    ["G27", "L2 REPLACEMENTS (FIFO)"],
    ["G28", "FRAME INVALIDATIONS"]
  ];

  auxStats.forEach(function(item) {
    sheet.getRange(item[0])
      .setValue(item[1])
      .setFontColor(C.muted);
  });

  sheet.getRange("B30")
    .setValue("RECENT CACHE EVENTS & ANIMATIONS")
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  sheet.getRange("B31:D31")
    .setValues([["TIME", "EVENT", "DETAIL"]])
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold");

  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 170);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(5, 110);

  for (let col = 6; col <= 13; col++) {
    sheet.setColumnWidth(col, 105);
  }

  sheet.setColumnWidth(14, 210);

  syncCacheDashboard_(getCacheState_());
  SpreadsheetApp.flush();
}

function syncCacheDashboard_(cacheState) {
  const sheet = cacheSheet_();
  const C = CONFIG.COLORS;
  const state = cacheState || getCacheState_();

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
        ? line.tag.toString(16).toUpperCase()
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
    sheet.getRange(9 + index, 4)
      .setFontColor(
        item[1].valid === 1 ? C.green : C.red
      )
      .setFontWeight("bold");
  });

  // A result may contain both MISS and HIT.
  // Color according to the final status.
  const last = state.lastAccess || {};
  const status = String(last.hitStatus || "");
  const isHit =
    status === "HIT" || status === "L2 HIT";
  const isMiss = status === "MISS";

  const accessValues = [
    [
      last.address === null ||
      last.address === undefined
        ? "--"
        : cacheHex_(last.address) + "h"
    ],
    [last.operation || "-"],
    [last.path || "-"],
    [last.result || "-"],
    [
      last.value === null ||
      last.value === undefined
        ? "--"
        : cacheHex_(last.value) + "h"
    ],
    [last.transferFlow || "-"],
    [last.hitStatus || "-"]
  ];

  sheet.getRange("D19:D25")
    .setValues(accessValues)
    .setBackground(C.panelAlt)
    .setFontColor(C.white)
    .setFontWeight("bold");

  sheet.getRange("D22")
    .setFontColor(
      isHit ? C.green :
      isMiss ? C.red : C.yellow
    );

  sheet.getRange("D25")
    .setFontColor(
      isHit ? C.green :
      isMiss ? C.red : C.yellow
    );

  const metrics = getCachePerformanceMetrics();

  const perfMatrix = [
    [
      metrics.l1i.hits,
      metrics.l1i.misses,
      metrics.l1i.total,
      metrics.l1i.formatted
    ],
    [
      metrics.l1d.hits,
      metrics.l1d.misses,
      metrics.l1d.total,
      metrics.l1d.formatted
    ],
    [
      metrics.l2.hits,
      metrics.l2.misses,
      metrics.l2.total,
      metrics.l2.formatted
    ],
    [
      metrics.overall.hits,
      metrics.overall.misses,
      metrics.overall.total,
      metrics.overall.formatted
    ]
  ];

  sheet.getRange("H20:K23")
    .setValues(perfMatrix)
    .setBackground(C.panelAlt)
    .setFontColor(C.white)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange("H20:H23")
    .setFontColor(C.green);

  sheet.getRange("I20:I23")
    .setFontColor(C.red);

  [
    metrics.l1i,
    metrics.l1d,
    metrics.l2,
    metrics.overall
  ].forEach(function(m, index) {
    sheet.getRange(20 + index, 11)
      .setFontColor(
        m.rate >= 50
          ? C.green
          : m.total === 0
            ? C.muted
            : C.yellow
      )
      .setFontWeight("bold");
  });

  const stats = state.stats;

  const auxValues = [
    [stats.ramAccesses],
    [stats.writes],
    [stats.l2Replacements],
    [stats.invalidations]
  ];

  sheet.getRange("I25:I28")
    .setValues(auxValues)
    .setBackground(C.panelAlt)
    .setFontColor(C.yellow)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const eventRows = Array.from(
    { length: CACHE_LAYOUT.eventCount },
    function() {
      return ["", "", ""];
    }
  );

  state.events.slice(-CACHE_LAYOUT.eventCount)
    .forEach(function(event, index, events) {
      const row =
        CACHE_LAYOUT.eventCount -
        events.length +
        index;

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
          ? C.red
          : eventName.indexOf("INVALIDAT") !== -1
            ? C.yellow
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

  try {
    syncCacheDashboard_(state);
  } catch (error) {
    // Dashboard may be unavailable.
  }

  Logger.log(
    "PASS: Cache hierarchy and performance counters reset to 0"
  );

  return state;
}

// ============================================
// BENCHMARK
// ============================================

function runCacheBenchmarkProgram() {
  const benchmarkAddress = 0x43;
  const originalByte =
    readRawMemory_(benchmarkAddress);

  resetCacheModule();

  Logger.log(
    "=== RUNNING TASK 10 CACHE BENCHMARK PROGRAM ==="
  );

  try {
    cacheReadInstruction(0x00);
    cacheReadInstruction(0x01);
    cacheReadInstruction(0x02);
    cacheReadInstruction(0x03);

    cacheReadData(0x40);
    cacheReadData(0x41);
    cacheReadData(0x42);

    cacheWriteData(benchmarkAddress, 0xAA);

    cacheReadInstruction(0x20);
    cacheReadInstruction(0x00);

    const metrics =
      getCachePerformanceMetrics();

    Logger.log(
      "L1I: Hits=" + metrics.l1i.hits +
      ", Misses=" + metrics.l1i.misses +
      ", HitRate=" + metrics.l1i.formatted
    );

    Logger.log(
      "L1D: Hits=" + metrics.l1d.hits +
      ", Misses=" + metrics.l1d.misses +
      ", HitRate=" + metrics.l1d.formatted
    );

    Logger.log(
      "L2: Hits=" + metrics.l2.hits +
      ", Misses=" + metrics.l2.misses +
      ", HitRate=" + metrics.l2.formatted
    );

    Logger.log(
      "OVERALL: Hits=" + metrics.overall.hits +
      ", Misses=" + metrics.overall.misses +
      ", HitRate=" + metrics.overall.formatted
    );

    Logger.log(
      "=== CACHE BENCHMARK PROGRAM COMPLETE ==="
    );

    return metrics;

  } finally {
    // Restore RAM without affecting performance counters.
    Write(benchmarkAddress, originalByte);

    // Repair any cached copy of that byte.
    const state = getCacheState_();
    const info = getCacheAddressInfo(
      benchmarkAddress
    );

    [state.l1i, state.l1d]
      .concat(state.l2)
      .forEach(function(line) {
        if (
          line.valid === 1 &&
          line.tag === info.tag
        ) {
          line.bytes[info.offset] = originalByte;
        }
      });

    saveCacheState_(state);
    syncCacheDashboard_(state);
  }
}

// ============================================
// TASK 10 TESTS
// ============================================

function assertCache_(condition, message) {
  if (!condition) {
    throw new Error(
      "TASK 10 CACHE TEST FAILED: " + message
    );
  }
}

function testCacheHitMissMonitoring() {
  Logger.log(
    "=== STARTING TASK 10 CACHE HIT/MISS MONITORING TESTS ==="
  );

  const props = cacheProperties_();
  const oldCache =
    props.getProperty(CACHE_STATE_KEY);

  try {
    // TEST 1: Zero-access hit rates
    resetCacheModule();
    const zeroMetrics =
      getCachePerformanceMetrics();

    assertCache_(
      zeroMetrics.l1i.rate === 0 &&
      zeroMetrics.l1i.formatted === "0.0%",
      "L1I zero rate"
    );

    assertCache_(
      zeroMetrics.l1d.rate === 0 &&
      zeroMetrics.l1d.formatted === "0.0%",
      "L1D zero rate"
    );

    assertCache_(
      zeroMetrics.l2.rate === 0 &&
      zeroMetrics.l2.formatted === "0.0%",
      "L2 zero rate"
    );

    assertCache_(
      zeroMetrics.overall.rate === 0 &&
      zeroMetrics.overall.formatted === "0.0%",
      "Overall zero rate"
    );

    Logger.log(
      "PASS CR-8,9: Zero accesses handle cleanly without division errors (0.0%)"
    );

    // TEST 2: L1I independent counters
    resetCacheModule();

    cacheReadInstruction(0x08);

    let stats = getCacheStatistics();

    assertCache_(
      stats.l1iMisses === 1 &&
      stats.l1iHits === 0,
      "L1I Miss count"
    );

    assertCache_(
      stats.l1dMisses === 0 &&
      stats.l1dHits === 0,
      "L1D unaffected by instruction fetch"
    );

    cacheReadInstruction(0x09);
    cacheReadInstruction(0x0A);

    stats = getCacheStatistics();

    assertCache_(
      stats.l1iHits === 2 &&
      stats.l1iMisses === 1,
      "L1I Hit count"
    );

    const l1iMetrics = calculateCacheHitRate_(
      stats.l1iHits,
      stats.l1iMisses
    );

    assertCache_(
      l1iMetrics.rate === (2 / 3) * 100,
      "L1I Hit Rate calculation"
    );

    assertCache_(
      l1iMetrics.formatted === "66.7%",
      "L1I Hit Rate format"
    );

    Logger.log(
      "PASS CR-1,4,5,6: L1I Hit/Miss detection and counters"
    );

    // TEST 3: L1D independent counters
    resetCacheModule();

    cacheReadData(0x30);

    stats = getCacheStatistics();

    assertCache_(
      stats.l1dMisses === 1 &&
      stats.l1dHits === 0,
      "L1D Miss count"
    );

    assertCache_(
      stats.l1iMisses === 0 &&
      stats.l1iHits === 0,
      "L1I unaffected by data read"
    );

    cacheReadData(0x31);
    cacheReadData(0x32);
    cacheReadData(0x33);

    stats = getCacheStatistics();

    assertCache_(
      stats.l1dHits === 3 &&
      stats.l1dMisses === 1,
      "L1D Hit count"
    );

    const l1dMetrics = calculateCacheHitRate_(
      stats.l1dHits,
      stats.l1dMisses
    );

    assertCache_(
      l1dMetrics.rate === 75 &&
      l1dMetrics.formatted === "75.0%",
      "L1D 75% rate"
    );

    Logger.log(
      "PASS CR-2,4,5,6: L1D Hit/Miss detection and counters"
    );

    // TEST 4: L2 only counts L1 misses
    resetCacheModule();

    cacheReadInstruction(0x10);

    stats = getCacheStatistics();

    assertCache_(
      stats.l2Misses === 1 &&
      stats.l2Hits === 0,
      "L2 Miss on cold fetch"
    );

    cacheReadInstruction(0x11);

    stats = getCacheStatistics();

    assertCache_(
      stats.l2Misses === 1 &&
      stats.l2Hits === 0,
      "L2 counters unchanged on L1 hit"
    );

    cacheReadInstruction(0x40);

    stats = getCacheStatistics();

    assertCache_(
      stats.l2Misses === 2 &&
      stats.l2Hits === 0,
      "Second L2 miss"
    );

    cacheReadInstruction(0x10);

    stats = getCacheStatistics();

    assertCache_(
      stats.l2Hits === 1 &&
      stats.l2Misses === 2,
      "L2 Hit registered"
    );

    const l2Metrics = calculateCacheHitRate_(
      stats.l2Hits,
      stats.l2Misses
    );

    assertCache_(
      l2Metrics.formatted === "33.3%",
      "L2 Hit Rate format"
    );

    Logger.log(
      "PASS CR-3,7: L2 counters update only on L1 misses"
    );

    // TEST 5: Visual information
    const state = getCacheState_();

    assertCache_(
      state.lastAccess.transferFlow.length > 0,
      "Transfer flow must be present"
    );

    assertCache_(
      state.lastAccess.hitStatus === "L2 HIT",
      "Hit status must be L2 HIT"
    );

    Logger.log(
      "PASS CR-12,14: Transfer flow and Hit/Miss status recorded"
    );

    // TEST 6: Reset counters
    resetCacheModule();

    const cleanStats = getCacheStatistics();

    assertCache_(
      cleanStats.l1iHits === 0 &&
      cleanStats.l1iMisses === 0 &&
      cleanStats.l1dHits === 0 &&
      cleanStats.l1dMisses === 0 &&
      cleanStats.l2Hits === 0 &&
      cleanStats.l2Misses === 0,
      "All counters must be zero after reset"
    );

    Logger.log(
      "PASS CR-16: Performance counters reset cleanly"
    );

    // TEST 7: Benchmark
    const benchMetrics =
      runCacheBenchmarkProgram();

    assertCache_(
      benchMetrics.l1i.hits >= 3,
      "Benchmark L1I hits"
    );

    assertCache_(
      benchMetrics.l1d.hits >= 2,
      "Benchmark L1D hits"
    );

    assertCache_(
      benchMetrics.l2.hits >= 1,
      "Benchmark L2 hits"
    );

    assertCache_(
      benchMetrics.overall.total > 0,
      "Benchmark total accesses"
    );

    Logger.log(
      "PASS CR-10,11,13,15,17,18: Benchmark workload verified"
    );

    Logger.log(
      "=== ALL TASK 10 CACHE HIT/MISS TESTS PASSED ==="
    );

    return {
      passed: true,
      criteriaTested: 18,
      benchmark: benchMetrics
    };

  } finally {
    // Benchmark restores RAM[43h] itself.
    if (oldCache === null) {
      props.deleteProperty(CACHE_STATE_KEY);
      resetCacheModule();
    } else {
      props.setProperty(
        CACHE_STATE_KEY,
        oldCache
      );

      try {
        syncCacheDashboard_(
          JSON.parse(oldCache)
        );
      } catch (error) {
        // UI unavailable.
      }
    }
  }
}

// Preserve Task 09 test entry point.
function testCacheModule() {
  return testCacheHitMissMonitoring();
}
