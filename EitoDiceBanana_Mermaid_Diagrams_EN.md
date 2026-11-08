# Mermaid Diagrams — EitoDiceBanana CPU Simulator

**Source:** https://github.com/anaaacg/eitodicebanana_cpu_simulator_EC2 (main branch, accessed 2026-11-08)  
**Grading rubric:** SIS-131 Second Midterm, UCB, Semester 2/2026.

> Scope: Architecture and flow diagrams based on the grading rubric, README, and modules present in the repository. They depict the documented architecture and expected processes; they do not constitute evidence that every execution path has been tested at runtime.

## 01. Overall System Architecture

**Criterion:** G1–G5  
**Note:** Overview of documented components. Arrows indicate logical relationships within the simulator, not necessarily physical wiring.

```mermaid
flowchart TB
    USER[User] --> UI[Google Sheets: INICIO and panels]
    UI --> CATALOG[CATALOGO_ASM]
    CATALOG --> EDIT[ASM Editor]
    EDIT --> ASM[Assembler.gs: two passes]
    ASM --> LOAD[Virtual memory loader]
    UI --> EXEC[Execution.gs: STEP / RUN / RESET]
    EXEC --> CPU[CPU.gs: registers and flags]
    CPU <--> ALU[ALU.gs]
    EXEC --> CU[ControlUnit.gs: micro-operations]
    CU --> BUS[Buses.gs: tri-state buffers and signals]
    BUS <--> CACHE[Cache.gs: L1I / L1D / L2]
    CACHE <--> MMU[VirtualMemory.gs / Paging.gs]
    MMU <--> RAM[Memory.gs: 256 B RAM]
    MMU <--> SWAP[Emulated swap]
    BUS <--> KBD[Keyboard.gs: 8 B FIFO]
    BUS <--> LCD[LCD.gs: 8x1]
    EXEC --> TRACE[TRAZA and dashboard]
    CACHE --> TRACE
    MMU --> TRACE
```

## 02. CPU and Buses with Tri-State Buffers

**Criterion:** G1  
**Note:** Conceptual model of the internal, address, and data buses. Only one transmitter may be enabled on each bus during any micro-operation.

```mermaid
flowchart LR
    subgraph CPU[8-bit CPU]
      direction TB
      REG[AX / BX / CX / DX]
      CTRL[PC / IR / MAR / MDR / FLAGS]
      ALU[ALU]
      CU[Control Unit]
      IB[(Internal Bus)]
      REG <-->|Enable / Load| IB
      CTRL <-->|Enable / Load| IB
      ALU <-->|Operands and result| IB
      CU --> WORD[30-bit Control Word]
    end
    WORD --> EN[En and Ld enable/load signals]
    EN --> IB
    CTRL -->|MAR| AB[(Address Bus)]
    CTRL <-->|MDR| DB[(Data Bus)]
    CU --> CB[(Control Bus: Read / Write / Clock / IO)]
    AB --> CACHE[Cache and memory]
    DB <--> CACHE
    CB --> CACHE
    DB <--> IO[Keyboard and LCD]
    CB --> IO
```

## 03. Tri-State Arbitration and Control Word

**Criterion:** G1  
**Note:** The controller prevents contention between transmitters. HIGH_Z is the state of every unselected transmitter.

```mermaid
flowchart TD
    A[Start micro-step] --> B[Control Unit emits a 30-bit word]
    B --> C[Read En_PC, En_AX, En_MDR, En_KBD, etc.]
    C --> D{How many transmitters are enabled on the bus?}
    D -->|0| Z[Undriven bus: HIGH_Z]
    D -->|1| E[Single transmitter ACTIVE]
    D -->|More than 1| ERR[Contention: block / report error]
    E --> F[Place data on bus]
    F --> G[Apply Ld signals to receiver]
    G --> H[Update state and trace]
    Z --> H
    ERR --> H
    H --> I[End micro-step]
```

## 04. Instruction Cycle and Micro-Operations

**Criteria:** G1, G5  
**Note:** Functional sequence FETCH → DECODE → EXECUTE → STORE; a cache miss or page fault may introduce additional micro-steps.

```mermaid
stateDiagram-v2
    [*] --> FETCH
    FETCH --> DECODE: instruction bytes available
    DECODE --> EXECUTE: opcode and operands
    EXECUTE --> STORE: result available
    STORE --> FETCH: next instruction
    EXECUTE --> HALT: HLT
    FETCH --> MEMORY_WAIT: miss / page fault
    EXECUTE --> MEMORY_WAIT: failed LOAD / STORE access
    MEMORY_WAIT --> FETCH: retry instruction fetch
    MEMORY_WAIT --> EXECUTE: retry data access
    HALT --> [*]
```

## 05. L1I / L1D / L2 Cache Hierarchy

**Criterion:** G2  
**Note:** Conceptual cache read and update path. L1I and L1D each hold one 8 B line; L2 holds four 8 B lines and uses FIFO replacement.

```mermaid
flowchart TD
    START[CPU access] --> TYPE{Access type}
    TYPE -->|Instruction| I[L1I: 8 B]
    TYPE -->|Data| D[L1D: 8 B]
    I --> HI{Hit?}
    D --> HD{Hit?}
    HI -->|Yes| DONE[Return byte and update counters]
    HD -->|Yes| DONE
    HI -->|No| L2[Unified L2: 32 B]
    HD -->|No| L2
    L2 --> H2{L2 hit?}
    H2 -->|Yes| REFILL[Copy 8 B line to corresponding L1]
    H2 -->|No| RAM[Access virtual memory / RAM]
    RAM --> FILL[Fetch line and replace L2 entry using FIFO]
    FILL --> REFILL
    REFILL --> DONE
    DONE --> STATS[Hits / Misses / Hit Rate]
```

## 06. Virtual Address Translation

**Criterion:** G3  
**Note:** 16 virtual pages of 32 B (512 B); 8 physical frames of 32 B (256 B). VPN = virtual address div 32; offset = virtual address mod 32.

```mermaid
flowchart TD
    A[Virtual address: 9 bits] --> SPLIT[VPN: 4 bits / Offset: 5 bits]
    SPLIT --> PT[Look up Page Table: 16 entries]
    PT --> PRESENT{Present bit = 1?}
    PRESENT -->|Yes| PFN[Get PFN: 0 to 7]
    PFN --> PHYS[Physical address = PFN x 32 + Offset]
    PHYS --> RAM[Physical RAM: 256 B]
    PRESENT -->|No| FAULT[Trigger Page Fault]
    FAULT --> SWAP[Frame and Swap management]
    SWAP --> UPDATE[Update P / PFN / Dirty / Ref]
    UPDATE --> PT
```

## 07. Page Fault Handling with FIFO Replacement

**Criterion:** G3  
**Note:** The project's documentation states that frame 7 is pinned for MMIO; it must not be selected as a FIFO victim.

```mermaid
flowchart TD
    A[Access to absent VPN: P = 0] --> PF[Record and display Page Fault]
    PF --> FREE{Is a usable free frame available?}
    FREE -->|Yes| FRAME[Select free frame]
    FREE -->|No| VICTIM[Select FIFO victim: exclude frame 7]
    VICTIM --> DIRTY{Dirty = 1?}
    DIRTY -->|Yes| WRITE[Write victim page to Swap]
    DIRTY -->|No| INV[Invalidate previous mapping]
    WRITE --> INV
    INV --> FRAME
    FRAME --> LOAD[Load 32 B of requested page]
    LOAD --> TABLE[Update table: P=1, PFN, Ref, Dirty]
    TABLE --> COHERENCE[Synchronize caches / perform required invalidations]
    COHERENCE --> RETRY[Resume original access]
```

## 08. Input/Output: Keyboard and LCD

**Criterion:** G4  
**Note:** The keyboard has an 8-byte FIFO and virtual MMIO range 1F8h–1FFh; its physical storage is E8h–EFh. The LCD uses F8h–FFh and a circular cursor.

```mermaid
sequenceDiagram
    actor U as User
    participant K as Keyboard (Keyboard.gs)
    participant M as RAM / MMIO
    participant B as Tri-state Bus
    participant C as CPU (DX or another register)
    participant L as LCD (LCD.gs)
    U->>K: Enter characters
    K->>M: Enqueue in 8 B FIFO (E8h-EFh)
    C->>B: IN reg, [KBD]
    B->>K: Enable En_KBD
    K-->>B: Output next byte
    B-->>C: Load destination register
    C->>B: OUT [LCD], reg
    B->>L: Enable Ld_LCD and transfer byte
    L->>M: Update video RAM (F8h-FFh)
    L-->>U: Display character on 8x1 LCD
```

## 09. Program Editor, Assembler, and Loader

**Criterion:** G5  
**Note:** Reflects the documented persistent catalog containing four demonstration programs and a two-pass assembler.

```mermaid
flowchart TD
    A[CATALOGO_ASM: 4 programs] --> B[Select and copy to ASM editor]
    B --> C[Edit instructions and labels]
    C --> D[Assembler.gs: pass 1, labels]
    D --> E[Pass 2: resolve operands and generate bytes]
    E --> F{Valid syntax and addresses?}
    F -->|No| ERR[Display assembly error]
    ERR --> C
    F -->|Yes| LOADER[Program loader]
    LOADER --> V[Write bytes to virtual memory]
    V --> INIT[Initialize PC / CPU state]
    INIT --> X[STEP or RUN]
    X --> TRACE[TRAZA and CPU / bus / memory panels]
```

## 10. Source Code Module Organization

**Criterion:** G6  
**Note:** Map of source files visible in the repository's main branch; arrows show conceptual dependencies, not an exact function-call graph.

```mermaid
flowchart TB
    MAIN[Main.gs / UI.gs / HomeDashboard.gs] --> EXEC[Execution.gs]
    MAIN --> CAT[ProgramCatalog.gs / Assembler.gs]
    EXEC --> CPU[CPU.gs / ALU.gs]
    EXEC --> CTL[ControlUnit.gs / Buses.gs]
    EXEC --> CACHE[Cache.gs]
    EXEC --> VM[VirtualMemory.gs / Paging.gs / Memory.gs]
    EXEC --> IO[Keyboard.gs / LCD.gs]
    CAT --> VM
    CACHE --> VM
    IO --> VM
    CFG[Config.gs] -.-> EXEC
    CFG -.-> VM
    SCAT[ScatteredMemory.gs] --> EXEC
```

## 11. Demonstration Procedure for the Oral Defense

**Criteria:** G2–G5  
**Note:** Suggested walkthrough to demonstrate catalog programs, CPU states, I/O transfers, and memory faults.

```mermaid
flowchart TD
    START[Prepare INICIO sheet and catalog] --> P1[Program 1: arithmetic and loops]
    P1 --> REG[Show AX / BX / CX / DX and FLAGS]
    REG --> P2[Program 2: keyboard-to-LCD echo]
    P2 --> IO[Enter EITO2026 and inspect FIFO and LCD]
    IO --> P3[Program 3: scattered memory accesses]
    P3 --> MISS[Show Cache Miss and Page Fault]
    MISS --> P4[Program 4: memory stress test]
    P4 --> FIFO[Observe FIFO, Dirty, and Swap]
    FIFO --> STEP[Run STEP to show Control Word and HIGH_Z]
    STEP --> END[Answer implementation questions]
```

## Submission Notes

- Verify the actual execution of all four programs and dynamic signal changes in Google Sheets.
- Confirm FIFO, write-through, and write-allocate policies against the deployed version.
- Keep physical and virtual MMIO mappings consistent with the current code.
- Include the diagrams in README.md and README_EN.md with bilingual explanations.
