
/**
 * EitoDiceBanana - Task 04
 * Internal/external buses and tri-state buffers.
 *
 * Integration with ControlUnit.gs - Task 05.
 *
 * This module owns:
 * - Bus resolution
 * - Tri-state buffers
 * - Bus contention validation
 * - Bus state
 * - Visual inspection
 *
 * Control words and micro-programs
 * belong to ControlUnit.gs.
 */

const BUSES_LAYOUT = {
  sheet: 'BUSES',
  panels: {
    internalBusState: 'D8',
    internalBusDriver: 'D9',
    internalBusHex: 'D10',
    internalBusBin: 'D11',

    addressBusState: 'D15',
    addressBusDriver: 'D16',
    addressBusHex: 'D17',

    dataBusState: 'D21',
    dataBusDriver: 'D22',
    dataBusHex: 'D23',
    dataBusDirection: 'D24',

    controlMemR: 'K8',
    controlMemW: 'K9',
    controlIOR: 'K10',
    controlIOW: 'K11',
    clock: 'K12',

    cwBinary: 'J15',
    activeSignals: 'J17',
    stepDescription: 'J19',

    internalBuffers: 'B28',
    addressBuffers: 'B32',
    dataBuffers: 'B36'
  }
};

const BUSES_STATE_KEY = 'EDB_BUSES_STATE';

const BUS_INTERNAL_SOURCES = [
  'PC', 'IR', 'MAR', 'MDR',
  'AX', 'BX', 'CX', 'DX',
  'ALU', 'IMMEDIATE', 'KEYBOARD'
];

const BUS_DATA_SOURCES = [
  'RAM', 'MDR', 'KEYBOARD', 'CACHE'
];

// ============================================
// BUS STATE
// ============================================

function defaultBusesState_() {
  const internal = {};
  const data = {};

  BUS_INTERNAL_SOURCES.forEach(function(name) {
    internal[name] = 'ZZZZZZZZ';
  });

  BUS_DATA_SOURCES.forEach(function(name) {
    data[name] = 'ZZZZZZZZ';
  });

  return {
    internal: {
      state: 'HIGH_Z',
      source: null,
      value: null
    },

    address: {
      state: 'HIGH_Z',
      source: null,
      value: null
    },

    data: {
      state: 'HIGH_Z',
      source: null,
      value: null,
      direction: '-'
    },

    control: {
      Mem_R: 0,
      Mem_W: 0,
      IO_R: 0,
      IO_W: 0,
      Clock: 0
    },

    buffers: {
      internal: internal,
      address: {
        MAR: 'ZZZZZZZZ'
      },
      data: data
    }
  };
}

function getBusesState_() {
  const raw = PropertiesService
    .getDocumentProperties()
    .getProperty(BUSES_STATE_KEY);

  if (!raw) {
    return defaultBusesState_();
  }

  try {
    return Object.assign(
      defaultBusesState_(),
      JSON.parse(raw)
    );
  } catch (error) {
    return defaultBusesState_();
  }
}

function saveBusesState_(state) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(
      BUSES_STATE_KEY,
      JSON.stringify(state)
    );
}

// ============================================
// TRI-STATE BUFFERS
// ============================================

function busBits_(value) {
  if (!isValidByte(value)) {
    throw new Error(
      'Bus driver must provide an 8-bit value.'
    );
  }

  return value.toString(2).padStart(8, '0');
}

function busBuffer_(enabled, value) {
  return enabled
    ? busBits_(value)
    : 'ZZZZZZZZ';
}

function busActive_(source, value, extra) {
  const bus = {
    state: 'ACTIVE',
    source: source,
    value: value
  };

  if (extra) {
    Object.assign(bus, extra);
  }

  return bus;
}

// ============================================
// BUS ARBITRATION
// ============================================

function resolveControlBuses_(word, context) {
  if (!word || !word.signals) {
    throw new Error(
      'Bus resolver requires a Control Word.'
    );
  }

  validateControlWord_(word);

  const s = word.signals;
  const ctx = context || {};
  const buses = defaultBusesState_();
  const sources = [];

  function source(signal, name, value) {
    if (!s[signal]) return;

    if (!isValidByte(value)) {
      throw new Error(
        name + ' output is not an 8-bit value.'
      );
    }

    sources.push({
      name: name,
      value: value
    });
  }

  // CPU register transmitters
  source('En_PC', 'PC', getRegister('PC'));
  source('En_IR', 'IR', getRegister('IR'));
  source(
    'En_MAR_Int',
    'MAR',
    getRegister('MAR')
  );

  if (!s.Mem_W) {
    source(
      'En_MDR',
      'MDR',
      getRegister('MDR')
    );
  }

  ['AX', 'BX', 'CX', 'DX'].forEach(
    function(name) {
      source(
        'En_' + name,
        name,
        getRegister(name)
      );
    }
  );

  // ALU and immediate transmitters
  if (s.En_ALU) {
    source(
      'En_ALU',
      'ALU',
      ctx.aluResult
    );
  }

  if (s.En_IMM) {
    source(
      'En_IMM',
      'IMMEDIATE',
      ctx.immediate
    );
  }

  // Keyboard transmitter
  if (s.En_KBD) {
    const value =
      ctx.keyboardValue !== undefined
        ? ctx.keyboardValue
        : (
          Array.isArray(ctx.keyboardQueue) &&
          ctx.keyboardQueue.length
            ? ctx.keyboardQueue[0]
            : undefined
        );

    source(
      'En_KBD',
      'KEYBOARD',
      value
    );
  }

  // Prevent internal bus contention
  if (sources.length > 1) {
    throw new Error(
      'Internal bus contention: ' +
      sources.map(function(item) {
        return item.name;
      }).join(', ')
    );
  }

  if (sources.length === 1) {
    buses.internal = busActive_(
      sources[0].name,
      sources[0].value
    );
  }

  // Individual internal buffers
  BUS_INTERNAL_SOURCES.forEach(
    function(name) {
      buses.buffers.internal[name] =
        busBuffer_(
          buses.internal.source === name,
          buses.internal.value
        );
    }
  );

  // External address bus
  if (s.En_MAR) {
    buses.address = busActive_(
      'MAR',
      getRegister('MAR')
    );
  }

  buses.buffers.address.MAR = busBuffer_(
    s.En_MAR,
    getRegister('MAR')
  );

  // ==========================================
  // BIDIRECTIONAL EXTERNAL DATA BUS
  // ==========================================

  const read = Boolean(s.Mem_R);
  const write = Boolean(s.Mem_W);
  const ioRead = Boolean(s.IO_R);
  const ioWrite = Boolean(s.IO_W);

  const transferCount = [
    read,
    write,
    ioRead,
    ioWrite
  ].filter(Boolean).length;

  if (transferCount > 1) {
    throw new Error(
      'External data bus contention: ' +
      'incompatible memory/I/O transfers.'
    );
  }

  if (read) {
    buses.data = busActive_(
      'RAM',
      Read(getRegister('MAR')),
      {
        direction: 'RAM -> MDR'
      }
    );

  } else if (write) {
    buses.data = busActive_(
      'MDR',
      getRegister('MDR'),
      {
        direction: 'MDR -> RAM'
      }
    );

  } else if (ioRead) {
    if (!s.En_KBD) {
      throw new Error(
        'IO_R requires En_KBD.'
      );
    }

    const keyboardValue =
      ctx.keyboardValue !== undefined
        ? ctx.keyboardValue
        : (
          Array.isArray(ctx.keyboardQueue) &&
          ctx.keyboardQueue.length
            ? ctx.keyboardQueue[0]
            : undefined
        );

    if (!isValidByte(keyboardValue)) {
      throw new Error(
        'Keyboard has no valid byte to transmit.'
      );
    }

    buses.data = busActive_(
      'KEYBOARD',
      keyboardValue,
      {
        direction: 'I/O -> CPU'
      }
    );

  } else if (ioWrite) {
    if (!s.En_MDR) {
      throw new Error(
        'IO_W requires En_MDR.'
      );
    }

    buses.data = busActive_(
      'MDR',
      getRegister('MDR'),
      {
        direction: 'CPU -> I/O'
      }
    );
  }

  // Individual external data buffers
  BUS_DATA_SOURCES.forEach(
    function(name) {
      buses.buffers.data[name] =
        busBuffer_(
          buses.data.source === name,
          buses.data.value
        );
    }
  );

  // Control bus state
  buses.control = {
    Mem_R: read ? 1 : 0,
    Mem_W: write ? 1 : 0,
    IO_R: ioRead ? 1 : 0,
    IO_W: ioWrite ? 1 : 0,
    Clock: s.Clock ? 1 : 0
  };

  return buses;
}

// ============================================
// SHEET ACCESS
// ============================================

function busesSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(BUSES_LAYOUT.sheet);

  if (!sheet) {
    throw new Error(
      'BUSES sheet not found.'
    );
  }

  return sheet;
}

// ============================================
// BUSES DASHBOARD
// ============================================

function renderBusesDashboard() {
  const sh = busesSheet_();
  const C = CONFIG.COLORS;

  sh.getRange('A1:T50').breakApart();
  sh.getRange('A1:T50').clear();

  sh.getRange('A1:T50')
    .setBackground(C.background)
    .setFontColor(C.white)
    .setFontFamily('Roboto Mono');

  sh.setHiddenGridlines(true);
  sh.setColumnWidths(1, 20, 95);

  function header(range, text) {
    sh.getRange(range)
      .merge()
      .setValue(text)
      .setFontColor(C.yellow)
      .setBackground(C.panelAlt)
      .setFontWeight('bold');
  }

  function label(cell, text) {
    sh.getRange(cell)
      .setValue(text)
      .setFontColor(C.muted);
  }

  function value(cell) {
    sh.getRange(cell)
      .setBackground(C.panel)
      .setFontColor(C.yellow);
  }

  header(
    'B2:R2',
    'EitoDiceBanana / SYSTEM BUSES & TRI-STATE BUFFERS'
  );

  header(
    'B6:G6',
    'INTERNAL BUS (8 BIT)'
  );

  [
    ['B8', 'STATE', 'D8'],
    ['B9', 'DRIVER', 'D9'],
    ['B10', 'HEX', 'D10'],
    ['B11', 'BINARY', 'D11']
  ].forEach(function(row) {
    label(row[0], row[1]);
    value(row[2]);
  });

  header(
    'B13:G13',
    'EXTERNAL ADDRESS BUS (8 BIT)'
  );

  [
    ['B15', 'STATE', 'D15'],
    ['B16', 'DRIVER', 'D16'],
    ['B17', 'HEX', 'D17']
  ].forEach(function(row) {
    label(row[0], row[1]);
    value(row[2]);
  });

  header(
    'B19:G19',
    'BIDIRECTIONAL EXTERNAL DATA BUS (8 BIT)'
  );

  [
    ['B21', 'STATE', 'D21'],
    ['B22', 'DRIVER', 'D22'],
    ['B23', 'HEX', 'D23'],
    ['B24', 'DIRECTION', 'D24']
  ].forEach(function(row) {
    label(row[0], row[1]);
    value(row[2]);
  });

  header(
    'I6:R6',
    'CONTROL BUS'
  );

  [
    ['I8', 'Mem_R', 'K8'],
    ['I9', 'Mem_W', 'K9'],
    ['I10', 'IO_R', 'K10'],
    ['I11', 'IO_W', 'K11'],
    ['I12', 'Clock', 'K12']
  ].forEach(function(row) {
    label(row[0], row[1]);
    value(row[2]);
  });

  header(
    'I13:R13',
    'CONTROL WORD / MICRO-STEP'
  );

  [
    ['I15', 'WORD', 'J15'],
    ['I17', 'SIGNALS', 'J17'],
    ['I19', 'STEP', 'J19']
  ].forEach(function(row) {
    label(row[0], row[1]);
    value(row[2]);
  });

  header(
    'B26:R26',
    'PER-TRANSMITTER TRI-STATE BUFFERS (0 / 1 / Z)'
  );

  header(
    'B27:R27',
    'INTERNAL: PC IR MAR MDR AX BX CX DX ALU IMM KBD'
  );

  sh.getRange('B28:R30')
    .merge()
    .setBackground(C.panel)
    .setWrap(true)
    .setFontColor(C.yellow);

  header(
    'B31:R31',
    'ADDRESS: MAR'
  );

  sh.getRange('B32:R33')
    .merge()
    .setBackground(C.panel)
    .setWrap(true)
    .setFontColor(C.yellow);

  header(
    'B35:R35',
    'EXTERNAL DATA: RAM MDR KEYBOARD CACHE'
  );

  sh.getRange('B36:R38')
    .merge()
    .setBackground(C.panel)
    .setWrap(true)
    .setFontColor(C.yellow);

  sh.setRowHeights(28, 3, 23);
  sh.setRowHeights(36, 3, 23);

  syncBusesDisplay_(
    defaultBusesState_(),
    createControlWord_({}),
    'IDLE'
  );

  SpreadsheetApp.flush();
}

// ============================================
// UPDATE BUSES DISPLAY
// ============================================

function syncBusesDisplay_(buses, word, stepName) {
  const sh = busesSheet_();
  const p = BUSES_LAYOUT.panels;
  const C = CONFIG.COLORS;

  if (
    sh.getRange('B6').getValue() !==
    'INTERNAL BUS (8 BIT)'
  ) {
    return;
  }

  const b = buses || defaultBusesState_();

  function put(cell, value) {
    sh.getRange(cell).setValue(value);
  }

  function state(cell, value) {
    sh.getRange(cell)
      .setValue(value)
      .setFontColor(
        value === 'ACTIVE'
          ? C.green
          : value === 'CONTENTION'
            ? C.red
            : C.muted
      );
  }

  function hex(value) {
    return isValidByte(value)
      ? byteToHex_(value) + 'h'
      : '--';
  }

  function bin(value) {
    return isValidByte(value)
      ? busBits_(value)
      : 'ZZZZZZZZ';
  }

  // Internal bus
  state(
    p.internalBusState,
    b.internal.state
  );

  put(
    p.internalBusDriver,
    b.internal.source || '-'
  );

  put(
    p.internalBusHex,
    hex(b.internal.value)
  );

  put(
    p.internalBusBin,
    bin(b.internal.value)
  );

  // Address bus
  state(
    p.addressBusState,
    b.address.state
  );

  put(
    p.addressBusDriver,
    b.address.source || '-'
  );

  put(
    p.addressBusHex,
    hex(b.address.value)
  );

  // Data bus
  state(
    p.dataBusState,
    b.data.state
  );

  put(
    p.dataBusDriver,
    b.data.source || '-'
  );

  put(
    p.dataBusHex,
    hex(b.data.value)
  );

  put(
    p.dataBusDirection,
    b.data.direction || '-'
  );

  // Control signals
  [
    'Mem_R',
    'Mem_W',
    'IO_R',
    'IO_W',
    'Clock'
  ].forEach(function(name) {
    const cellMap = {
      Mem_R: p.controlMemR,
      Mem_W: p.controlMemW,
      IO_R: p.controlIOR,
      IO_W: p.controlIOW,
      Clock: p.clock
    };

    sh.getRange(cellMap[name])
      .setValue(b.control[name] || 0)
      .setFontColor(
        b.control[name]
          ? C.green
          : C.muted
      );
  });

  // Control Word
  put(
    p.cwBinary,
    word
      ? (
        word.binary ||
        controlWordToBinary_(word)
      )
      : '-'
  );

  put(
    p.activeSignals,
    word
      ? (
        getActiveControlSignals_(word)
          .join(', ') || 'NONE'
      )
      : 'NONE'
  );

  put(
    p.stepDescription,
    stepName || '-'
  );

  // Buffer values
  const groups = b.buffers || {};

  function summary(group) {
    return Object.keys(group || {})
      .map(function(name) {
        return name + ': ' + group[name];
      })
      .join('    ') || 'NONE';
  }

  put(
    p.internalBuffers,
    summary(groups.internal)
  );

  put(
    p.addressBuffers,
    summary(groups.address)
  );

  put(
    p.dataBuffers,
    summary(groups.data)
  );
}

// ============================================
// RESET BUSES
// ============================================

function resetBusesModule() {
  const idle = defaultBusesState_();

  saveBusesState_(idle);

  syncBusesDisplay_(
    idle,
    createControlWord_({}),
    'IDLE'
  );

  return idle;
}

// ============================================
// TASK 04 TESTS
// ============================================

/**
 * NOTE:
 * These tests modify CPU registers and RAM[85h].
 */

function testBusesModule() {
  const assert = function(ok, message) {
    if (!ok) {
      throw new Error(
        'TASK 04: ' + message
      );
    }
  };

  Logger.log(
    '=== TASK 04 BUS TESTS ==='
  );

  // TEST 1: HIGH-Z
  const idle = resolveControlBuses_(
    createControlWord_({})
  );

  assert(
    idle.internal.state === 'HIGH_Z' &&
    idle.address.state === 'HIGH_Z' &&
    idle.data.state === 'HIGH_Z',
    'All idle buses must be HIGH_Z'
  );

  Logger.log(
    'PASS: All idle buses and buffers HIGH_Z'
  );

  // TEST 2: CPU REGISTERS
  [
    'AX', 'BX', 'CX', 'DX',
    'PC', 'IR', 'MDR'
  ].forEach(function(reg) {
    setRegister(reg, 0x42);

    const signals = {};
    signals['En_' + reg] = 1;

    const buses = resolveControlBuses_(
      createControlWord_({
        signals: signals
      })
    );

    assert(
      buses.internal.source === reg &&
      buses.internal.value === 0x42,
      'Driver ' + reg
    );

    assert(
      buses.buffers.internal[reg] ===
      '01000010',
      '8-bit driver ' + reg
    );

    Object.keys(buses.buffers.internal)
      .filter(function(name) {
        return name !== reg;
      })
      .forEach(function(name) {
        assert(
          buses.buffers.internal[name] ===
          'ZZZZZZZZ',
          name + ' not HIGH_Z'
        );
      });
  });

  // MAR is also connected internally.
  setRegister('MAR', 0x42);

  const marInternal = resolveControlBuses_(
    createControlWord_({
      signals: {
        En_MAR_Int: 1
      }
    })
  );

  assert(
    marInternal.internal.source === 'MAR' &&
    marInternal.internal.value === 0x42,
    'MAR must connect to internal bus'
  );

  Logger.log(
    'PASS: Eight CPU register drivers including MAR'
  );

  // TEST 3: CONTENTION
  let blocked = false;

  try {
    resolveControlBuses_(
      createControlWord_({
        signals: {
          En_AX: 1,
          En_BX: 1
        }
      })
    );
  } catch (error) {
    blocked = /contention/i.test(
      error.message
    );
  }

  assert(
    blocked,
    'Simultaneous drivers must be rejected'
  );

  Logger.log(
    'PASS: Internal bus contention rejected'
  );

  // TEST 4: BIDIRECTIONAL DATA BUS
  setRegister('MAR', 0x85);
  setRegister('MDR', 0x99);

  Write(0x85, 0xAA);

  // RAM -> MDR
  const read = resolveControlBuses_(
    createControlWord_({
      signals: {
        En_MAR: 1,
        Mem_R: 1,
        Ld_MDR: 1,
        Clock: 1
      }
    })
  );

  assert(
    read.data.source === 'RAM' &&
    read.data.value === 0xAA,
    'RAM -> MDR read bus'
  );

  assert(
    read.buffers.data.MDR === 'ZZZZZZZZ',
    'MDR must not drive read bus'
  );

  // CORRECTION:
  // A previous Read() may have changed MDR.
  // Restore the intended write payload.

  setRegister('MDR', 0x99);

  // MDR -> RAM
  const write = resolveControlBuses_(
    createControlWord_({
      signals: {
        En_MAR: 1,
        En_MDR: 1,
        Mem_W: 1,
        Clock: 1
      }
    })
  );

  Logger.log(
    'DEBUG MDR=' + getRegister('MDR') +
    ' | SOURCE=' + write.data.source +
    ' | VALUE=' + write.data.value
  );

  assert(
    write.data.source === 'MDR' &&
    write.data.value === 0x99,
    'MDR -> RAM write bus'
  );

  assert(
    write.buffers.data.RAM ===
    'ZZZZZZZZ',
    'RAM must not drive write bus'
  );

  Logger.log(
    'PASS: Bidirectional data bus and per-source High-Z'
  );

  // TEST 5: CLOCK
  assert(
    read.control.Clock === 1 &&
    read.control.Mem_R === 1,
    'Clock/Read signals'
  );

  Logger.log(
    'PASS: Control lines include Clock'
  );

  // TEST 6: REGISTER TRANSFER
  setRegister('AX', 0x5A);
  setRegister('CX', 0x00);

  const transfer = executeMicroOperation_(
    makeMicroStep_(
      'TASK04_AX_TO_CX',
      {
        En_AX: 1,
        Ld_CX: 1
      }
    ),
    {}
  );

  assert(
    getRegister('CX') === 0x5A &&
    transfer.buses.internal.source === 'AX',
    'AX -> internal bus -> CX transfer'
  );

  assert(
    transfer.controlWord.signals.Clock === 1,
    'Micro-step must assert Clock'
  );

  Logger.log(
    'PASS: Complete AX -> CX micro-operation'
  );

  // TEST 7: MEMORY WRITE
  setRegister('MAR', 0x85);
  setRegister('MDR', 0x99);

  executeMicroOperation_(
    makeMicroStep_(
      'TASK04_WRITE',
      {
        En_MAR: 1,
        En_MDR: 1,
        Mem_W: 1
      }
    ),
    {}
  );

  assert(
    Read(0x85) === 0x99,
    'Clocked MDR -> RAM write'
  );

  // TEST 8: MEMORY READ
  Write(0x85, 0xAA);

  executeMicroOperation_(
    makeMicroStep_(
      'TASK04_READ',
      {
        En_MAR: 1,
        Mem_R: 1,
        Ld_MDR: 1
      }
    ),
    {}
  );

  assert(
    getRegister('MDR') === 0xAA,
    'Clocked RAM -> MDR read'
  );

  Logger.log(
    'PASS: Complete clocked RAM read and write'
  );

  Logger.log(
    '=== ALL TASK 04 BUS TESTS PASSED ==='
  );

  return {
    passed: true
  };
}
