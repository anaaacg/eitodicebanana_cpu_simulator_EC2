
/**
 * EitoDiceBanana CPU Simulator
 * Computer Architecture - UCB
 *
 * Phase 2 Configuration
 */

const CONFIG = {

  PROJECT: {
    name: "EitoDiceBanana",
    subtitle: "8-BIT CPU SIMULATOR",
    version: "2.0.0",
    phase: 2
  },

  COLORS: {
    background: "#171719",
    panel: "#242427",
    panelAlt: "#303034",
    yellow: "#FFCC4D",
    white: "#FFF9E9",
    muted: "#A9A9AC",
    green: "#34D399",
    red: "#F87171",
    border: "#414141"
  },

  CPU: {
    bits: 8,
    maxValue: 255,

    activeRegisters: [
      "AX",
      "BX",
      "CX",
      "DX"
    ],

    reservedRegisters: [],

    controlRegisters: [
      "PC",
      "IR",
      "MAR",
      "MDR"
    ],

    flags: [
      "ZF",
      "CF",
      "SF"
    ],

    phases: [
      "FETCH",
      "DECODE",
      "EXECUTE",
      "STORE"
    ]
  },

  MEMORY: {
    size: 256,
    minAddress: 0,
    maxAddress: 255,

    codeStart: 0x00,
    codeEnd: 0x7F,

    dataStart: 0x80,
    dataEnd: 0xFF,

    rows: 16,
    columns: 16
  },

  EXECUTION: {
    defaultDelay: 500,
    minDelay: 100,
    maxDelay: 2000,
    maxSteps: 4000
  },

  SHEETS: [
    "INICIO",
    "CPU",
    "BUSES",
    "MEMORIA",
    "PAGINAS",
    "CACHE",
    "E-S",
    "ASM",
    "TRAZA",
    "EQUIPO"
  ],

  MODULES: {
    cpu: true,
    alu: true,
    memory: true,
    assembler: true,
    execution: true,

    buses: true,
    cache: false,
    mmu: true,
    io: false
  },

  FUTURE: {
    virtualMemorySize: 512,
    pageSize: 32,
    physicalFrames: 8,
    virtualPages: 16,

    l1iSize: 8,
    l1dSize: 8,
    l2Size: 32,

    keyboardBuffer: 8,
    lcdCharacters: 8
  }
};
