# Diagramas Mermaid — EitoDiceBanana CPU Simulator

**Fuente:** https://github.com/anaaacg/eitodicebanana_cpu_simulator_EC2 (rama main, consultada 2026-11-08)  
**Rúbrica:** Segundo parcial SIS-131, UCB, semestre 2/2026.

> Alcance: diagramas de arquitectura y flujos basados en la rúbrica, README y módulos presentes en el repositorio. Representan la arquitectura declarada y procesos esperados; no constituyen evidencia de que todas las rutas se hayan probado en tiempo de ejecución.

## 01. Arquitectura general del sistema

**Criterio:** G1–G5  
**Nota:** Visión de componentes documentados. Las flechas representan relaciones lógicas del simulador, no necesariamente cableado físico.

```mermaid
flowchart TB
    USER[Usuario] --> UI[Google Sheets: INICIO y paneles]
    UI --> CATALOG[CATALOGO_ASM]
    CATALOG --> EDIT[Editor ASM]
    EDIT --> ASM[Assembler.gs: dos pasadas]
    ASM --> LOAD[Cargador a memoria virtual]
    UI --> EXEC[Execution.gs: STEP / RUN / RESET]
    EXEC --> CPU[CPU.gs: registros y flags]
    CPU <--> ALU[ALU.gs]
    EXEC --> CU[ControlUnit.gs: microoperaciones]
    CU --> BUS[Buses.gs: triestado y señales]
    BUS <--> CACHE[Cache.gs: L1I / L1D / L2]
    CACHE <--> MMU[VirtualMemory.gs / Paging.gs]
    MMU <--> RAM[Memory.gs: RAM 256 B]
    MMU <--> SWAP[Swap emulado]
    BUS <--> KBD[Keyboard.gs: FIFO 8 B]
    BUS <--> LCD[LCD.gs: 8x1]
    EXEC --> TRACE[TRAZA y dashboard]
    CACHE --> TRACE
    MMU --> TRACE
```

## 02. CPU y buses con buffers triestado

**Criterio:** G1  
**Nota:** Modelo conceptual de los buses interno, de direcciones y de datos. Se exige un único emisor habilitado por bus durante cada microoperación.

```mermaid
flowchart LR
    subgraph CPU[CPU de 8 bits]
      direction TB
      REG[AX / BX / CX / DX]
      CTRL[PC / IR / MAR / MDR / FLAGS]
      ALU[ALU]
      CU[Unidad de control]
      IB[(Bus interno)]
      REG <-->|Enable / Load| IB
      CTRL <-->|Enable / Load| IB
      ALU <-->|Operandos y resultado| IB
      CU --> WORD[Micro-palabra de 30 bits]
    end
    WORD --> EN[Habilitaciones En y Ld]
    EN --> IB
    CTRL -->|MAR| AB[(Bus de direcciones)]
    CTRL <-->|MDR| DB[(Bus de datos)]
    CU --> CB[(Bus de control: Read / Write / Clock / IO)]
    AB --> CACHE[Caché y memoria]
    DB <--> CACHE
    CB --> CACHE
    DB <--> IO[Teclado y LCD]
    CB --> IO
```

## 03. Arbitraje triestado y micro-palabra de control

**Criterio:** G1  
**Nota:** El controlador impide la contención entre transmisores. HIGH_Z es el estado de todos los emisores no seleccionados.

```mermaid
flowchart TD
    A[Inicia micro-paso] --> B[Unidad de control emite palabra de 30 bits]
    B --> C[Leer señales En_PC, En_AX, En_MDR, En_KBD, etc.]
    C --> D{Cuántos emisores habilitados en el bus?}
    D -->|0| Z[Bus sin conductor: HIGH_Z]
    D -->|1| E[Único emisor en ACTIVE]
    D -->|Más de 1| ERR[Contención: bloquear / indicar error]
    E --> F[Colocar dato en bus]
    F --> G[Aplicar señales Ld al receptor]
    G --> H[Actualizar estado y traza]
    Z --> H
    ERR --> H
    H --> I[Fin de micro-paso]
```

## 04. Ciclo de instrucción y microoperaciones

**Criterio:** G1, G5  
**Nota:** Secuencia funcional FETCH → DECODE → EXECUTE → STORE; un fallo de caché o página puede introducir micro-pasos adicionales.

```mermaid
stateDiagram-v2
    [*] --> FETCH
    FETCH --> DECODE: bytes de instruccion disponibles
    DECODE --> EXECUTE: opcode y operandos
    EXECUTE --> STORE: resultado disponible
    STORE --> FETCH: siguiente instruccion
    EXECUTE --> HALT: HLT
    FETCH --> MEMORY_WAIT: miss / page fault
    EXECUTE --> MEMORY_WAIT: LOAD / STORE con fallo
    MEMORY_WAIT --> FETCH: reintentar busqueda
    MEMORY_WAIT --> EXECUTE: reintentar acceso de datos
    HALT --> [*]
```

## 05. Jerarquía de caché L1I / L1D / L2

**Criterio:** G2  
**Nota:** Ruta conceptual de lectura y actualización de cachés. L1I y L1D almacenan una línea de 8 B; L2 contiene cuatro líneas de 8 B y utiliza FIFO.

```mermaid
flowchart TD
    START[Acceso de CPU] --> TYPE{Tipo de acceso}
    TYPE -->|Instrucción| I[L1I: 8 B]
    TYPE -->|Datos| D[L1D: 8 B]
    I --> HI{Hit?}
    D --> HD{Hit?}
    HI -->|Sí| DONE[Entregar byte y actualizar contadores]
    HD -->|Sí| DONE
    HI -->|No| L2[L2 unificada: 32 B]
    HD -->|No| L2
    L2 --> H2{Hit en L2?}
    H2 -->|Sí| REFILL[Copiar línea de 8 B a L1 correspondiente]
    H2 -->|No| RAM[Consultar memoria virtual / RAM]
    RAM --> FILL[Traer línea y reemplazar en L2 mediante FIFO]
    FILL --> REFILL
    REFILL --> DONE
    DONE --> STATS[Hits / Misses / Hit Rate]
```

## 06. Traducción de direcciones virtuales

**Criterio:** G3  
**Nota:** 16 páginas virtuales de 32 B (512 B); 8 marcos físicos de 32 B (256 B). VPN = dirección virtual div 32; desplazamiento = dirección virtual mod 32.

```mermaid
flowchart TD
    A[Dirección virtual: 9 bits] --> SPLIT[VPN: 4 bits / Offset: 5 bits]
    SPLIT --> PT[Consultar Page Table: 16 entradas]
    PT --> PRESENT{Bit Presente = 1?}
    PRESENT -->|Sí| PFN[Obtener PFN: 0 a 7]
    PFN --> PHYS[Dirección física = PFN x 32 + Offset]
    PHYS --> RAM[RAM física: 256 B]
    PRESENT -->|No| FAULT[Disparar Page Fault]
    FAULT --> SWAP[Gestión de marcos y Swap]
    SWAP --> UPDATE[Actualizar P / PFN / Dirty / Ref]
    UPDATE --> PT
```

## 07. Gestión de Page Fault con reemplazo FIFO

**Criterio:** G3  
**Nota:** La documentación del proyecto señala que el marco 7 está fijado para MMIO; no debe seleccionarse como víctima FIFO.

```mermaid
flowchart TD
    A[Acceso a VPN ausente: P = 0] --> PF[Registrar y visualizar Page Fault]
    PF --> FREE{Hay marco libre utilizable?}
    FREE -->|Sí| FRAME[Seleccionar marco libre]
    FREE -->|No| VICTIM[Seleccionar víctima FIFO: excluir marco 7]
    VICTIM --> DIRTY{Dirty = 1?}
    DIRTY -->|Sí| WRITE[Guardar página víctima en Swap]
    DIRTY -->|No| INV[Invalidar mapeo anterior]
    WRITE --> INV
    INV --> FRAME
    FRAME --> LOAD[Cargar 32 B de página solicitada]
    LOAD --> TABLE[Actualizar tabla: P=1, PFN, Ref, Dirty]
    TABLE --> COHERENCE[Sincronizar cachés / invalidaciones necesarias]
    COHERENCE --> RETRY[Reanudar acceso original]
```

## 08. Entrada y salida: teclado y LCD

**Criterio:** G4  
**Nota:** El teclado tiene FIFO de 8 bytes y MMIO virtual 1F8h–1FFh; su almacenamiento físico es E8h–EFh. LCD usa F8h–FFh y un cursor circular.

```mermaid
sequenceDiagram
    actor U as Usuario
    participant K as Teclado (Keyboard.gs)
    participant M as RAM / MMIO
    participant B as Bus triestado
    participant C as CPU (DX u otro registro)
    participant L as LCD (LCD.gs)
    U->>K: Introduce caracteres
    K->>M: Encolar FIFO 8 B (E8h-EFh)
    C->>B: IN reg, [KBD]
    B->>K: Habilitar En_KBD
    K-->>B: Entregar siguiente byte
    B-->>C: Cargar registro destino
    C->>B: OUT [LCD], reg
    B->>L: Habilitar Ld_LCD y transferir byte
    L->>M: Actualizar video RAM (F8h-FFh)
    L-->>U: Mostrar carácter en LCD 8x1
```

## 09. Editor, ensamblador y cargador de programas

**Criterio:** G5  
**Nota:** Refleja la documentación del catálogo persistente con cuatro programas de demostración y el ensamblador de dos pasadas.

```mermaid
flowchart TD
    A[CATALOGO_ASM: 4 programas] --> B[Seleccionar y copiar al editor ASM]
    B --> C[Editar instrucciones y etiquetas]
    C --> D[Assembler.gs: pasada 1, etiquetas]
    D --> E[Pasada 2: resolver operandos y generar bytes]
    E --> F{Sintaxis y direcciones válidas?}
    F -->|No| ERR[Mostrar error de ensamblado]
    ERR --> C
    F -->|Sí| LOADER[Cargador de programa]
    LOADER --> V[Escribir bytes en memoria virtual]
    V --> INIT[Inicializar PC / estado CPU]
    INIT --> X[STEP o RUN]
    X --> TRACE[TRAZA y paneles de CPU / buses / memoria]
```

## 10. Organización de módulos del código fuente

**Criterio:** G6  
**Nota:** Mapa de archivos fuente visible en la rama main del repositorio; muestra dependencias conceptuales, no un grafo exacto de llamadas.

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

## 11. Procedimiento de demostración para la defensa

**Criterio:** G2–G5  
**Nota:** Propuesta de recorrido para mostrar los programas de catálogo, estados de la CPU, transferencia E/S y fallos de memoria.

```mermaid
flowchart TD
    START[Preparar hoja INICIO y catálogo] --> P1[Programa 1: aritmética y bucles]
    P1 --> REG[Mostrar AX / BX / CX / DX y FLAGS]
    REG --> P2[Programa 2: eco de teclado a LCD]
    P2 --> IO[Introducir EITO2026 y observar FIFO y LCD]
    IO --> P3[Programa 3: accesos dispersos]
    P3 --> MISS[Mostrar Cache Miss y Page Fault]
    MISS --> P4[Programa 4: estrés de memoria]
    P4 --> FIFO[Observar FIFO, Dirty y Swap]
    FIFO --> STEP[Ejecutar STEP para mostrar micro-palabra y HIGH_Z]
    STEP --> END[Responder preguntas de implementación]
```

## Observaciones para la entrega

- Verificar en Google Sheets la ejecución real de los cuatro programas y el cambio dinámico de señales.
- Confirmar las políticas FIFO, write-through y write-allocate desde la versión desplegada.
- Mantener el mapeo MMIO físico y virtual alineado con el código actual.
- Incorporar los diagramas al README.md y README_EN.md con explicaciones bilingües.
