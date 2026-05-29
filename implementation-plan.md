# Plan de Implementación: Creación Dinámica de Tarjetas de Partidos para Admin

## 1. Contexto y Objetivos

El admin necesita poder crear nuevas tarjetas de partidos tanto en "Mi Polla" (ruta colombina) como en "Champions" sin depender de llamadas a la API en cada interacción del usuario.

**Problema actual:**
- `worldcup_path` tiene 13 partidos predefinidos y estáticos.
- Los 48 equipos están almacenados en Firestore, pero no hay información de qué equipo juega contra cuál.
- No se puede construir un dropdown de "oponentes disponibles" sin esa información.

**Objetivo:**
- Pre-poblar Firestore con TODOS los fixtures de cada torneo (World Cup, Champions) desde la API-Football.
- El admin selecciona Equipo 1 → el sistema muestra solo los equipos que enfrentarán a Equipo 1 (obtenido de Firestore, no de la API).
- Después de elegir ambos equipos, el sistema conoce stadium, date, probabilities, etc.
- Un botón de "Sincronizar fixtures" permite al admin populate Firestore con todos los partidos de un torneo bajo demanda.
- **No hay cron automático.** La sincronización es manual: una vez antes del torneo para fase de grupos, y otra vez después de que terminen los grupos para traer los partidos de knockout.

---

## 2. Estrategia de Ejecución

### 2.1. Sub-agentes y paralelismo

El plan se ejecuta con **6 sub-agentes** en 4 tandas:

**Tanda 1 (paralela) — Backend + Tipos:**

| Sub-agente | Alcance | Tareas | Archivos |
|-----------|---------|--------|----------|
| **A — Backend Python** | Script de sync, modificar fetch_matches, workflow | 1, 6, 6b, 19 | `sync_tournament_fixtures.py`, `fetch_matches.py`, `sync_fixtures.yml` |
| **B — Tipos + DB** | Interfaces, reglas, índices, constantes | 2, 3, 4, 7 | `firestore.ts`, `firestore.rules`, `firestore.indexes.json`, `tournaments.ts` |

**Tanda 2 (paralela, depende de B) — Frontend Core:**

| Sub-agente | Alcance | Tareas | Archivos |
|-----------|---------|--------|----------|
| **C — Componentes Admin** | FAB + Modal | 8, 9 | `AdminFab.tsx`, `AdminCreateCardModal.tsx` |
| **D — Funciones Firestore** | Nuevas funciones helper | 10, 11, 12, 13, 14 | `firestore.ts` |

**Tanda 3 (depende de C + D) — Integración:**

| Sub-agente | Alcance | Tareas | Archivos |
|-----------|---------|--------|----------|
| **E — Páginas** | PollaMundialista, Champions, Admin, deprecación | 15, 16, 17, 19b, 20 | `PollaMundialista.tsx`, `Champions.tsx`, `Admin.tsx` |

**Tanda 4 (final) — Deploy + Verificación:**

| Sub-agente | Alcance | Tareas | Archivos |
|-----------|---------|--------|----------|
| **F — Deploy + Build** | Índices, build, pruebas | 5, 21, 22, 23 | `tsc`, `vite build`, `firebase deploy` |

### 2.2. Dependencias

```
Tanda 1   A (Python) ⚡ B (Tipos)   ← paralelo
              │            │
              ↓            ↓
Tanda 2   C (Comps)  ⚡ D (Funcs)   ← paralelo, ambas dependen de B
              │            │
              └─────┬──────┘
                    ↓
Tanda 3        E (Páginas)          ← depende de C + D
                    │
                    ↓
Tanda 4        F (Deploy)           ← depende de todo
```

### 2.3. Instrucciones para el agente ejecutor

- **No modificar `auditor.py`, `fetch_results.py` ni `Home.tsx`.**
- **`firestore.indexes.json` se edita incrementalmente** al archivo existente.
- **Marcar `[x]`** cada tarea en la To-Do List (sección 7) al completarla.
- **Ejecutar `tsc -b` después de cada tanda** para detectar errores temprano.

---

## 3. Arquitectura de Base de Datos (Firestore)

### 3.1. Nueva colección: `tournaments/{tournamentId}/fixtures/{fixtureId}`

**Ruta:** `tournaments/world_cup_2026/fixtures/{fixtureId}` y `tournaments/champions_league_2025/fixtures/{fixtureId}`

**Por qué subcolección bajo `tournaments/`:**
- Aprovecha la estructura existente `tournaments/world_cup_2026/` (equipos, sistema).
- Mantiene todo relacionado con un torneo bajo el mismo documento padre.
- Path con 4 segmentos (par): `tournaments/world_cup_2026/fixtures/123` = 4 segmentos ✅

**Estructura del documento:**

```typescript
interface TournamentFixture {
  fixtureId: number;           // ID de API-Football (único por partido)
  leagueId: number;             // 1 = World Cup, 2 = Champions
  leagueName: string;          // "World Cup 2026", "Champions League"
  season: number;              // 2026, 2025
  tournamentId: string;        // "world_cup_2026", "champions_league_2025"

  homeTeam: {
    apiId: number;
    name: string;
    code: string;
    logo: string;
  };
  awayTeam: {
    apiId: number;
    name: string;
    code: string;
    logo: string;
  };

  date: string;                // ISO timestamp
  stadium: string;              // nombre del estadio
  venueCity: string;             // ciudad de la sede
  status: 'NS' | 'LIVE' | 'FT' | 'AET' | 'PEN' | null;  // null = datos no disponibles aún

  // Probabilidades (se actualizan cuando la API las provee)
  probHome: number | null;
  probDraw: number | null;
  probAway: number | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 3.2. Nueva colección: `tournaments/{tournamentId}/active_cards`

**Ruta:** `tournaments/world_cup_2026/active_cards/{cardId}`

**Motivo:** No todos los fixtures son "apostables". El admin decide qué tarjetas activar para que los usuarios puedan apostar.

```typescript
interface ActiveCard {
  cardId: string;              // ID único (UUID generado en frontend)
  tournamentId: string;
  fixtureId: number;           // referencia al fixture en fixtures/{fixtureId}

  // Datos del fixture copiados para lectura eficiente (desnormalización)
  homeTeamApiId: number;
  awayTeamApiId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  date: string;
  stadium: string;
  tokenCost: number;

  // Campos para queries eficientes sin necesidad de joins
  involvesColombia: boolean;   // true si homeApiId === COLOMBIA_API_ID o awayApiId === COLOMBIA_API_ID

  // Probabilidades (copiadas del fixture al crear, actualizadas por fetch_matches.py)
  probHome: number | null;
  probDraw: number | null;
  probAway: number | null;

  isActive: boolean;           // false = ocultarla de usuarios
  fixtureStatus: 'NS' | 'LIVE' | 'FT' | 'AET' | 'PEN' | null;  // copia del fixture al crear
  createdAt: Timestamp;
  createdBy: string;           // email del admin que creó la tarjeta
}
```

**Nota:** `active_cards` es la colección que leen las páginas de "Mi Polla" y "Champions" para mostrar las tarjetas apostables. El script `fetch_matches.py` se modificará para escribir en `active_cards` en lugar de `worldcup_path`.

**Al crear una tarjeta,** los logos (`homeTeamLogo`, `awayTeamLogo`) se copian del fixture en ese momento (`fixture['teams']['home']['logo']`). Si los logos del fixture cambian en una futura sincronización, la tarjeta retiene los valores copiados. Esto es intencional para estabilidad de la UI.

### 3.3. Cambios en `src/types/firestore.ts`

Agregar interfaces:
- `TournamentFixture`
- `ActiveCard`
- `ActiveCardInput` (para creación — ver abajo)
- `FlatTeam` (para dropdown de equipos — ver sección 3.6)
- `SyncStatus`

**`ActiveCardInput` (dto para creación):**
```typescript
interface ActiveCardInput {
  tournamentId: string;
  fixtureId: number;
  homeTeamApiId: number;
  awayTeamApiId: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo: string;
  awayTeamLogo: string;
  date: string;
  stadium: string;
  tokenCost: number;
  involvesColombia: boolean;
  fixtureStatus: 'NS' | 'LIVE' | 'FT' | 'AET' | 'PEN' | null;
  probHome: number | null;
  probDraw: number | null;
  probAway: number | null;
  createdBy: string;
}
```

Agregar constantes en un archivo nuevo `src/constants/tournaments.ts`:
```typescript
export const TOURNAMENTS = {
  WORLD_CUP_2026: 'world_cup_2026',
  CHAMPIONS_LEAGUE_2025: 'champions_league_2025',
} as const;

export const COLOMBIA_API_ID = 8;

export type TournamentId = typeof TOURNAMENTS[keyof typeof TOURNAMENTS];
```

**Constantes de liga (API-Football):**
```typescript
export const LEAGUES = {
  [TOURNAMENTS.WORLD_CUP_2026]: { apiId: 1, name: 'World Cup 2026', season: 2026 },
  [TOURNAMENTS.CHAMPIONS_LEAGUE_2025]: { apiId: 2, name: 'Champions League', season: 2025 },
} as const;
```

### 3.4. Cambios en `firestore.rules`

```python
match /tournaments/{tournamentId}/active_cards/{cardId} {
  allow read: if isAuthenticated();
  allow create: if isAdmin() &&
    // El fixture debe estar en estado NS (no iniciado) al momento de crear la tarjeta
    request.resource.data.fixtureStatus == 'NS';
  allow update: if isAdmin() &&
    // Solo tokenCost e isActive son editables después de creación
    (!('fixtureId' in request.resource.data) || request.resource.data.fixtureId == resource.data.fixtureId) &&
    (!('homeTeamApiId' in request.resource.data) || request.resource.data.homeTeamApiId == resource.data.homeTeamApiId) &&
    (!('awayTeamApiId' in request.resource.data) || request.resource.data.awayTeamApiId == resource.data.awayTeamApiId) &&
    (!('homeTeamName' in request.resource.data) || request.resource.data.homeTeamName == resource.data.homeTeamName) &&
    (!('awayTeamName' in request.resource.data) || request.resource.data.awayTeamName == resource.data.awayTeamName) &&
    (!('date' in request.resource.data) || request.resource.data.date == resource.data.date) &&
    (!('stadium' in request.resource.data) || request.resource.data.stadium == resource.data.stadium) &&
    (!('involvesColombia' in request.resource.data) || request.resource.data.involvesColombia == resource.data.involvesColombia) &&
    // fixtureStatus no puede cambiarse a 'NS' si ya no lo era
    request.resource.data.fixtureStatus == resource.data.fixtureStatus;
  allow delete: if isAdmin();  // Las predicciones asociadas ya tienen datos desnormalizados y no se rompen
}
```

**Nota:** La validación de duplicados se hace en el frontend (consulta por `fixtureId` antes de crear). La regla de Firestore previene escrituras accidentales. **Inmutabilidad:** Una vez creada, solo `tokenCost` e `isActive` pueden cambiar. Los campos esenciales (equipos, fecha, stadium) son inmutables post-creación para proteger la integridad del historial de predicciones.

```python
match /tournaments/{tournamentId}/fixtures/{fixtureId} {
  allow read: if isAuthenticated();
  allow write: if isAdmin();
}

match /tournaments/{tournamentId}/flat_teams/{teamApiId} {
  allow read: if isAuthenticated();
  allow write: if isAdmin();
}

match /tournaments/{tournamentId}/system/sync_status {
  allow read: if isAdmin();
  allow write: if isAdmin();  // solo admins y bots escriben
}
```

### 3.5. Script de poblado: `legacy_python/sync_tournament_fixtures.py`

**Objetivo:** Fetch all fixtures from API-Football for a given league and store them in `tournaments/{tournamentId}/fixtures/`.

**Uso:**
```bash
# Poblar Mundial 2026
python sync_tournament_fixtures.py --league 1 --season 2026

# Poblar Champions 2025
python sync_tournament_fixtures.py --league 2 --season 2025
```

**Flujo:**
1. Escribe `{status: 'running', updatedAt}` en `sync_status`
2. Llama `GET /fixtures?league={league}&season={season}` (API-Football)
3. Por cada fixture:
   - `setDoc(doc(db, 'tournaments/{tournamentId}/fixtures', fixture_id), data)` — idempotente
   - Llama `/predictions?fixture={fixture_id}` para obtener probabilidades
   - Si la API devuelve probabilidades, actualiza `probHome`, `probDraw`, `probAway` en el fixture
   - `time.sleep(0.5)` entre llamadas para evitar rate limit
   - Si falla, captura error y continúa con el siguiente (no aborta)
4. Itera sobre los 12 grupos hardcoded (`['A','B','C','D','E','F','G','H','I','J','K','L']`). Para cada grupo, query `Teams/{tournamentId}/Group_{group}` y copia cada equipo a `tournaments/{tournamentId}/flat_teams/{teamApiId}` usando `apiId` como document ID. Esto aprovecha los datos completos ya poblado por `populate_teams.py`.
5. Al terminar, escribe `{status: 'done' | 'partial', fixturesCount, teamsCount, updatedAt}`. Si fallaron fixtures, usa `'partial'` e incluye `partialFixturesCount` y `errorMessage`.

**Consideraciones:**
- Se ejecuta una vez al inicio del torneo (o manualmente cuando hay cambios).
- Idempotente: puede re-ejecutarse sin crear duplicados.
- Los campos `probHome/probDraw/probAway` se poblarán cuando `fetch_matches.py` los actualice (flujo existente).
- **`flat_teams` se popula desde la colección `Teams/` existente**, no de la API. Esto evita llamadas extra a la API y usa datos ya cacheados.

### 3.6. Nueva colección: `tournaments/{tournamentId}/flat_teams`

**Ruta:** `tournaments/world_cup_2026/flat_teams/{teamApiId}`

**Problema:** Los 48 equipos están en subcolecciones `Teams/world_cup_2026/Group_A/{docId}` (4 equipos por grupo, 12 grupos). Leerlos todos requiere 12 consultas de subcolección. El modal de creación de tarjetas necesita la lista completa para el dropdown de Equipo 1.

**Solución:** Crear una colección plana `flat_teams` que contenga los 48 equipos en documentos individuales. Se poblula durante `sync_tournament_fixtures.py`.

```typescript
interface FlatTeam {
  apiId: number;
  name: string;
  code: string;           // FIFA 3 letras
  logo: string;
  country: string;
  group: string;           // A-L
  founded: number;
  venue: {
    name: string;
    city: string;
    capacity: number;
  };
  isHost: boolean;         // true para México, Canadá, USA
  tournamentId: string;     // para filtrar con collectionGroup
}
```

**Lectura eficiente en frontend:** `getTeamsByTournament(tournamentId)` hace una sola query `collectionGroup('flat_teams')` filtrada por `tournamentId`. Requiere un índice compuesto (ver sección 3.7).

### 3.7. Índices compuestos de Firestore

**⚠️ CRÍTICO:** El Web SDK de Firestore **requiere** índices explícitos para queries compuestas. Sin ellos, las queries fallan con "Missing or insufficient permissions" — un error engañoso que parece problema de reglas pero es falta de índices.

**Índices requeridos en `firestore.indexes.json`:**

```json
[
  {
    "collectionGroup": "active_cards",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "tournamentId", "order": "ascending" },
      { "fieldPath": "isActive", "order": "ascending" }
    ]
  },
  {
    "collectionGroup": "active_cards",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "involvesColombia", "order": "ascending" },
      { "fieldPath": "isActive", "order": "ascending" }
    ]
  },
  {
    "collectionGroup": "active_cards",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "tournamentId", "order": "ascending" },
      { "fieldPath": "fixtureId", "order": "ascending" }
    ]
  },
  {
    "collectionGroup": "flat_teams",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "tournamentId", "order": "ascending" }
    ]
  },
  {
    "collectionGroup": "fixtures",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "tournamentId", "order": "ascending" },
      { "fieldPath": "homeTeam.apiId", "order": "ascending" }
    ]
  },
  {
    "collectionGroup": "fixtures",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "tournamentId", "order": "ascending" },
      { "fieldPath": "awayTeam.apiId", "order": "ascending" }
    ]
  }
]
```

**Deploy:** `npx firebase deploy --only firestore:indexes`. Incluir en el To-Do (tarea 5).

### 3.8. Documento de estado de sincronización: `sync_status`

**Ruta:** `tournaments/{tournamentId}/system/sync_status`

```typescript
interface SyncStatus {
  status: 'idle' | 'running' | 'done' | 'partial' | 'error';
  lastSyncAt: Timestamp | null;
  fixturesCount: number;    // cuántos fixtures se guardaron en la última sync
  teamsCount: number;       // cuántos equipos se guardaron
  errorMessage: string | null;
  partialFixturesCount?: number;  // cuando status === 'partial': cuántos se alcanzaron a guardar
  updatedAt: Timestamp;
}
```

**Estados de sync:**
- `idle`: sin actividad reciente
- `running`: sync en progreso
- `done`: sync completada exitosamente
- `partial`: sync completada pero con errores (algunos fixtures/equipos no se guardaron)
- `error`: sync fallida (ningún fixture/equipo se guardó)

**Propósito:** Permite que el frontend haga polling del estado de sincronización. El workflow `sync_fixtures.yml` escribe en este documento antes y después de ejecutar.

**Nota sobre radares:** Los documentos `system/radar_match` y `system/colombia_match` en la ruta legacy (`system/`) siguen existiendo y `fetch_matches.py` los actualiza. **Home.tsx no necesita cambios** — continúa leyendo de esos documentos legacy. Cuando `active_cards` esté verificado, se puede migrar los radares a `tournaments/world_cup_2026/system/{radar_match,colombia_match}` en un futuro.

---

## 4. Backend / APIs (Scripts de Python)

### 4.1. Nuevo script: `legacy_python/sync_tournament_fixtures.py`

Ver sección 3.5.

### 4.2. Deprecación de `worldcup_path`

`worldcup_path` queda obsoleto. Se elimina su uso en el frontend. Las páginas "Mi Polla" y "Champions" leen exclusivamente de `active_cards`.

`fetch_matches.py` ya no escribirá en `worldcup_path`. Su lógica se simplifica:

1. **Radares** (`radar_match`, `colombia_match`): se mantienen como están — datos del próximo partido.
2. **Actualización de probabilidades:** Para cada `active_card` con `isActive: true`, `fetch_matches.py` obtiene el `fixtureId` y llama a `/predictions?fixture={id}`. Si la API devuelve probabilidades, actualiza `probHome`, `probDraw`, `probAway` en la `active_card`.
3. **Auto-desactivación:** Si un fixture cambia de estado `NS` (Not Started) a `LIVE` o `FT`, `fetch_matches.py` actualiza en la `active_card` correspondiente: `isActive: false` **y** `fixtureStatus: 'LIVE'/'FT'` para mantener consistencia.
4. **Sincronización de datos del fixture:** Si `fixtures/{fixtureId}` se actualizó en la sync (nuevos datos de API), `fetch_matches.py` también actualiza los campos `date`, `stadium`, `venueCity` en la `active_card` si existen diferencias.

**Nota de implementación:** `fetch_matches.py` mantiene un mapeo en memoria de `active_cards` consultando todos los documentos con `isActive: true` al inicio del ciclo. Esto evita iterar toda la colección cada vez (costoso). El mapeo se actualiza cuando una tarjeta se activa/desactiva via Admin.

**Rate limit:** Al actualizar probabilidades para cada `active_card`, se agrega `time.sleep(0.5)` entre llamadas a `/predictions`. Si la API retorna 429 (rate limit exceeded), el script espera 60 segundos y reintenta una vez. Si falla de nuevo,跳过 esa tarjeta y continua con la siguiente.

### 4.3. Modificación a `auditor.py` y `fetch_results.py`

No requiere cambios; siguen escribiendo a `system/recent_results` y sellando predicciones.

---

## 5. Frontend: Interfaces y Componentes (UI/UX)

### 5.1. Botón flotante del Admin

**Ubicación:** Esquina inferior derecha, `position: fixed`, siempre visible cuando el usuario es admin.

**Componente nuevo:** `src/components/AdminFab.tsx`

```
[+ FAB]  →  Al clic se abre un modal/drawer
```

**Estados del FAB:**
- Default: ícono `Plus` con fondo dorado (`var(--primary)`)
- Hover: sombra elevada, scale 1.05
- Con notificación (tarjetas creadas desde última visita): badge con contador. Se calcula comparando `createdAt` de cada tarjeta contra `localStorage['lastVisit']`. Al abrir el modal se actualiza `lastVisit` a `now()`.
- Disabled state mientras `sync_status.status === 'running'` (para evitar crear tarjetas mientras se sincronizan fixtures).

### 5.2. Modal/Drawer de creación de tarjetas

**Componente nuevo:** `src/components/AdminCreateCardModal.tsx`

**Trigger:** Click en el AdminFab.

**Layout del modal:**

```
│  Fecha: 2026-06-17  |  Hora: 22:00             │
│  Estadio: Estadio Azteca                         │
│  Ciudad: Ciudad de México                        │
│                                                 │
│  Probabilidades:                                │
│  Local 50% | Empate 26% | Visitante 24%        │
│  Costo (tokens): [3]                            │
```

**Comportamiento de los dropdowns:**

1. **Torneo** (dropdown 1):
   - Opciones: "World Cup 2026", "Champions League 2025"
   - Al cambiar, limpia selección de Equipo 1 y Equipo 2

2. **Equipo 1** (dropdown 2):
   - Llama `getAllTeamsByTournament(tournamentId)` → lista de 48 equipos (World Cup) o ~32 (Champions)
   - Muestra: bandera + nombre
   - Al seleccionar, dispara consulta a Firestore

3. **Equipo 2** (dropdown 3):
   - Query: `getOpponentsForTeam(team1ApiId, tournamentId)`
   - Filtra `tournaments/{tournamentId}/fixtures` donde `homeTeam.apiId == team1ApiId OR awayTeam.apiId == team1ApiId`
   - Muestra los equipos resultantes con bandera + nombre
   - **Solo se habilita** cuando Equipo 1 está seleccionado
   - Si hay error de conexión o fixtures vacíos: muestra mensaje: "No se pudieron cargar los oponentes. Sincroniza fixtures primero."
   - Si no hay oponentes (equipo no tiene partidos en ese torneo): "No hay partidos programados para este equipo en este torneo"

 4. **Datos del fixture** (se muestran automáticamente):
   - Después de seleccionar Equipo 1 y Equipo 2, busca el fixture en Firestore y muestra:
     - Fecha y hora
     - Estadio y ciudad
     - Probabilidades (si están disponibles)
   - Si el fixture no existe en Firestore (fixtures no sincronizados): mostrar mensaje de error en rojo: "Este partido no existe en Firestore. Ejecuta 'Sincronizar fixtures' primero."

 5. **Costo tokens** (input numérico):
   - Valor por defecto: 3
   - Rango válido: 1-10

 **Modo edición (futuro):** El mismo modal se reutiliza para editar una tarjeta existente. Al abrir en modo edición, los dropdowns aparecen deshabilitados (no se puede cambiar equipo1/equipo2 de una tarjeta ya creada), solo `tokenCost` e `isActive` son editables. El botón dice "Actualizar Tarjeta".

### 5.3. Nuevas funciones en `src/services/firestore.ts`

```typescript
import { TOURNAMENTS, COLOMBIA_API_ID } from '../constants/tournaments';

// Obtiene todos los equipos de un torneo (desde flat_teams)
// Usa collectionGroup('flat_teams').where('tournamentId', '==', tournamentId)
// Fallback: si retorna vacío, extrae equipos únicos desde fixtures/{tournamentId}
getTeamsByTournament(tournamentId: string): Promise<FlatTeam[]>

// Obtiene los oponentes de un equipo específico dentro de un torneo
// Query: fixtures donde homeTeam.apiId == teamId OR awayTeam.apiId == teamId
// Dos queries separadas (home + away) + merge en cliente (Firestore no soporta OR)
// Retorna: array de { apiId, name, logo } extraído del fixture (no depende de flat_teams)
getOpponentsForTeam(teamApiId: number, tournamentId: string): Promise<{ apiId: number; name: string; logo: string }[]>

// Obtiene el fixture completo dado team1 y team2
getFixtureByTeams(team1ApiId: number, team2ApiId: number, tournamentId: string): Promise<TournamentFixture | null>

// Obtiene todas las tarjetas activas para Mi Polla (Colombia)
// Query: collectionGroup('active_cards')
//   .where('tournamentId', '==', 'world_cup_2026')
//   .where('involvesColombia', '==', true)
//   .where('isActive', '==', true)
getActiveCardsForPolla(): Promise<ActiveCard[]>

// Obtiene todas las tarjetas activas para Champions
// Query: collectionGroup('active_cards')
//   .where('tournamentId', '==', 'champions_league_2025')
//   .where('isActive', '==', true)
getActiveCardsForChampions(): Promise<ActiveCard[]>

// Crea una nueva tarjeta activa
// Validaciones antes de crear:
//  1. Query por fixtureId para verificar que no exista duplicado
//  2. Verificar que fixture.status === 'NS' (partido no ha iniciado)
// Si falla validación, lanza error con mensaje específico
createActiveCard(card: ActiveCardInput): Promise<string>

// Admin: lista todas las tarjetas (para gestión)
// Query: active_cards donde tournamentId == id (o todas si no se especifica)
getAllActiveCardsAdmin(tournamentId?: string): Promise<ActiveCard[]>

// Admin: actualiza tokenCost e isActive de una tarjeta
updateActiveCard(cardId: string, tournamentId: string, updates: Partial<ActiveCard>): Promise<void>

// Admin: elimina una tarjeta
deleteActiveCard(cardId: string, tournamentId: string): Promise<void>
```

**Nota sobre `getOpponentsForTeam`:** Firestore no soporta OR en queries. Para obtener los oponentes se ejecutan DOS queries en paralelo:
1. `fixtures.where('tournamentId', '==', t).where('homeTeam.apiId', '==', teamApiId)`
2. `fixtures.where('tournamentId', '==', t).where('awayTeam.apiId', '==', teamApiId)`

Los resultados de ambas se mergean. El **oponente** se extrae así:
- Si el query fue `homeTeam.apiId == teamApiId` → el oponente es `awayTeam` del fixture
- Si el query fue `awayTeam.apiId == teamApiId` → el oponente es `homeTeam` del fixture

Esto retorna un array de `{ apiId, name, logo }` con los equipos que enfrentarán a `teamApiId`, extraídos directamente del fixture (no depende de `flat_teams`).

### 5.4. Cambios en Admin.tsx

Agregar sección de gestión de tarjetas:
- Tabla con tarjetas activas/inactivas, con columnas: equipos, fecha, costo, estado, acciones
- Toggle para activar/desactivar (inline en la tabla)
- Botón "Editar" (lápiz) → abre modal en modo edición
- Botón "Eliminar" (basura) → confirmación antes de borrar
- Botón "Sincronizar fixtures" → dropdown para seleccionar torneo → dispatcha `sync_fixtures.yml` via `workflow_dispatch` con `{ tournament: 'world_cup_2026' | 'champions_league_2025' }`. Muestra estado en tiempo real via `onSnapshot` en `sync_status`.
- Botón "Ver Fixture" → abre modal de solo lectura con datos completos del fixture en Firestore

### 5.5. Cambios en Home.tsx y PollaMundialista.tsx

**Home.tsx** no requiere cambios. Los radares (`colombia_match`, `radar_match`) muestran el próximo partido y son independientes de `active_cards`.

**PollaMundialista.tsx:** Eliminar referencia a `worldcup_path`. Leer de `active_cards` filtrado por `involvesColombia: true` (sección 5.3).

### 5.6. Cambios en Champions.tsx

- Leer tarjetas de `tournaments/champions_league_2025/active_cards`
- Mismo componente de MatchCard que Mi Polla (reutilizable)

### 5.7. Flujo de predicción del usuario (no cambia)

El flujo del usuario para hacer una predicción en "Mi Polla" o "Champions" **no cambia**. La lógica existente de:
- Mostrar tarjetas con probabilidades
- Permitir ingreso de marcador
- Guardar predicción en `/predictions/{uid}_{fixtureId}`
- Descontar tokens
- Mostrar historial en "Mis Apuestas"

Sigue funcionando igual. Solo cambia la **fuente de datos**: antes leía de `worldcup_path`, ahora lee de `active_cards`. Los campos desnormalizados (`matchDetails`, `homeLogo`, `awayLogo`) garantizan que el historial no se rompe si una tarjeta se modifica o elimina después.

---

## 6. Lógica de Reglas de Negocio

### 6.1. Sincronización manual (bajo demanda)

**Cuándo sincronizar:**
- **Fase de grupos (ahora - junio 27):** Admin ejecuta "Sincronizar fixtures" una vez → se puebla `fixtures` con los 48 partidos del Mundial.
- **Fase de knockout (después del 27 junio):** Admin vuelve a ejecutar para traer octavos/cuartos/semifinal/final (partidos nuevos que la API ahora conoce).

**Cómo funciona:**
- El botón "Sincronizar fixtures" en Admin dispatcha el workflow `sync_fixtures.yml` con `workflow_dispatch`.
- Los fixtures ya existentes no se duplican (`setDoc` es idempotente, se puede re-ejecutar sin riesgos).

### 6.2. `worldcup_path` queda deprecado

- Se elimina toda referencia a `worldcup_path` en el frontend.
- Las páginas "Mi Polla" y "Champions" leen exclusivamente de `active_cards`.
- El documento `tournaments/world_cup_2026/system/worldcup_path` permanece en Firestore como backup temporal hasta que `active_cards` esté verificado en producción.

### 6.3. Flujo completo para crear una tarjeta

1. Admin ingresa a Admin → sección "Tarjetas"
2. Clic en "Sincronizar con API" → popula `fixtures` con todos los partidos del torneo
3. Clic en FAB (+) → abre modal
4. Selecciona Torneo → World Cup 2026
5. Selecciona Equipo 1 → Colombia
6. Sistema consulta Firestore → muestra oponentes de Colombia (8 equipos)
7. Selecciona Equipo 2 → Uzbekistán
 8. Sistema muestra: fecha, estadio, ciudad, probabilidades (si existen)
 8b. Si muestra error: "Este partido no existe en Firestore. Ejecuta 'Sincronizar fixtures' primero." → admin debe sincronizar antes de continuar
 8c. Si `fixture.status` es `null` o `undefined`: "El estado del partido no está disponible. Espera a que la API confirme el horario."
 9. Admin ajusta tokenCost si quiere (default 3)
10. Clic en "Crear Tarjeta" → guarda en `active_cards`
11. La tarjeta aparece en "Mi Polla" para todos los usuarios

### 6.4. Estados de una tarjeta

| Estado | Descripción |
|--------|-------------|
| `isActive: true` | Visible para usuarios en Mi Polla/Champions |
| `isActive: false` | Oculta de usuarios; solo visible en Admin |

**Estado vacío (sin tarjetas):** Si `getActiveCardsForPolla()` retorna array vacío, mostrar mensaje centrado: "No hay tarjetas activas. Los partidos aparecerán aquí cuando el admin los configure." (estilo glass-card con ícono de calendario).

### 6.5. Probabilidades

- `sync_tournament_fixtures.py` obtiene probabilidades al llamar al endpoint `/predictions` de API-Football por cada fixture.
- `fetch_matches.py` actualiza las probabilidades cada 5 minutos para los fixtures activos.
- Si no hay probabilidades disponibles, mostrar "—" en la tarjeta.

### 6.6. Permisos

- Solo admins pueden crear/editar/toggle `active_cards`
- Todos los usuarios autenticados pueden leer `active_cards`
- Lectura de `fixtures` requiere auth (para evitar que competidores vean todos los partidos)

### 6.7. Desactivación automática de tarjetas

`fetch_matches.py` detecta cambios de estado en los fixtures:

| Cambio de estado | Acción en `active_card` |
|-----------------|-------------------------|
| `NS` → `LIVE` | `isActive: false`, `fixtureStatus: 'LIVE'` |
| `NS` → `FT` / `AET` / `PEN` | `isActive: false`, `fixtureStatus: 'FT'/'AET'/'PEN'` |

Esto ocurre durante el ciclo normal de `fetch_matches.py` (cada 5 minutos). El admin también puede desactivar manualmente via Admin.

**Regla de negocio:** Las tarjetas no desaparecen del historial de los usuarios; solo dejan de estar disponibles para nuevas predicciones.

### 6.8. Validación al crear una tarjeta

Antes de guardar una `ActiveCard`, el frontend valida:

| Validación | Condición | Error si falla |
|-----------|-----------|-----------------|
| Fixture existe | `fixture` debe existir en `fixtures/{fixtureId}` | "Este partido no existe. Sincroniza primero." |
| Partido no iniciado | `fixture.status === 'NS'` (null o cualquier otro valor = error) | "No se puede crear una tarjeta para un partido que ya inició." |
| No existe duplicado | No existe otra `active_card` con el mismo `fixtureId` + `tournamentId` | "Ya existe una tarjeta para este partido." |

**Validación defensiva:** Si `fixture.status` es `null` o `undefined` (API no ha seteado status aún), tratar como error: "El estado del partido no está disponible. Espera a que la API confirme el horario."

### 6.9. Inmutabilidad post-creación

Una vez creada una `ActiveCard`, sus campos esenciales son **inmutables**:
- `fixtureId`, `homeTeamApiId`, `awayTeamApiId`, `homeTeamName`, `awayTeamName`, `date`, `stadium`, `involvesColombia`

**Editables** después de creación:
- `tokenCost` (para cambiar el precio de la apuesta)
- `isActive` (para ocultar/mostrar la tarjeta)

**Rationale:** Si se permitiera cambiar equipos o fecha después de que usuarios ya hicieron predicciones, el historial se rompería. Las predicciones guardan `matchDetails`, `homeLogo`, `awayLogo` desnormalizados. Para corregir errores, el admin elimina la tarjeta y crea una nueva.

### 6.10. Feedback de sincronización en Admin

El botón "Sincronizar fixtures" en Admin:

1. **Antes de dispatch:** Guarda `{status: 'running', updatedAt}` en `sync_status`
2. **Dispatch:** Llama `workflow_dispatch` con `inputs: { tournament: 'world_cup_2026' | 'champions_league_2025' }`
3. **Durante:** El componente Admin hace `onSnapshot` en `sync_status`. Muestra badge o toast con estado (spinner si running, checkmark si done, X si error).
4. **Después del workflow:** El script escribe `{status: 'done' | 'error', fixturesCount, teamsCount, errorMessage}` en `sync_status`.

---

## 7. To-Do List (Checklist de Progreso)

*Agente: Marca con una `[x]` las tareas a medida que las vayas completando.*

### [Categoría: Base de Datos]
- [x] 1. Crear script `sync_tournament_fixtures.py` que: (a) haga fetch de fixtures de API-Football y guarde en `fixtures/{fixtureId}`, (b) copie equipos desde la colección `Teams/{tournamentId}/Group_X/` existente a `flat_teams/{teamApiId}`, (c) escriba estado en `sync_status` antes y después.
- [x] 2. Definir interfaces `TournamentFixture`, `ActiveCard`, `ActiveCardInput`, `FlatTeam` y `SyncStatus` en `src/types/firestore.ts`.
- [x] 3. Agregar reglas de seguridad para las nuevas colecciones en `firestore.rules` (incluyendo validación de inmutabilidad post-creación para `active_cards`).
- [x] 4. Crear archivo `firestore.indexes.json` con los 6 índices compuestos descritos en sección 3.7.
- [ ] 5. Ejecutar `npx firebase deploy --only firestore:indexes` para desplegar los índices.
- [ ] 6. Ejecutar `sync_tournament_fixtures.py` una vez via GitHub Actions para poblar fixtures de World Cup 2026 y Champions League 2025.
- [x] 6b. Modificar `fetch_matches.py` para: (a) actualizar probabilidades en `active_cards`, (b) auto-desactivar tarjetas cuando el partido inicia (`NS` → `LIVE`/`FT`), (c) ya no escribe en `worldcup_path`.

### [Categoría: Frontend — Core]
- [x] 7. Crear `src/constants/tournaments.ts` con `TOURNAMENTS`, `LEAGUES`, `COLOMBIA_API_ID`.
- [x] 8. Crear `AdminFab.tsx` — botón flotante dorado en esquina inferior derecha.
- [x] 9. Crear `AdminCreateCardModal.tsx` — modal con 3 dropdowns (torneo, equipo1, equipo2), datos del fixture, costo tokens, error por falta de sync, y modo edición.
- [x] 10. Agregar función `getTeamsByTournament()` — usa `collectionGroup('flat_teams')`.
- [x] 11. Agregar función `getOpponentsForTeam()` — dos queries paralelas (home + away) con merge en cliente.
- [x] 12. Agregar función `getFixtureByTeams()` en `firestore.ts`.
- [x] 13. Agregar función `createActiveCard()` con validaciones: duplicado (query por fixtureId), partido no iniciado (fixture.status === 'NS').
- [x] 14. Agregar función `updateActiveCard()` y `deleteActiveCard()`.

### [Categoría: Frontend — Integración]
- [x] 15. Modificar `PollaMundialista.tsx` para leer de `active_cards` filtrado por `involvesColombia: true` (ya no usa `worldcup_path`).
- [x] 16. Modificar `Champions.tsx` para leer de `tournaments/champions_league_2025/active_cards`.
- [x] 17. Agregar sección de gestión de tarjetas en `Admin.tsx` con tabla, toggle, editar, eliminar, y botón de sincronización.

### [Categoría: GitHub Actions]
- [x] 19. Crear workflow `sync_fixtures.yml` con `on: workflow_dispatch` + `types: [workflow_dispatch]`. Se ejecuta desde la rama `main`. Debe escribir estado en `sync_status` antes y después de ejecutar. Acepta input `tournament` (dropdown: world_cup_2026 | champions_league_2025).
- [x] 19b. Implementar polling de `sync_status` en Admin.tsx con `onSnapshot`. Mostrar spinner durante sync, checkmark al completar, mensaje de error si falla.

### [Categoría: Deprecación de worldcup_path]
- [x] 20. Eliminar referencias a `worldcup_path` en frontend (PollaMundialista.tsx, Home.tsx, firestore.ts, tipos). El documento en Firestore permanece como backup temporal.

### [Categoría: Verificación]
- [x] 21. Ejecutar `tsc -b && vite build` y verificar que compila sin errores.
- [ ] 22. Probar `pnpm dev` y verificar: FAB visible para admin, modal abre/cierra, dropdowns funcionan, error state cuando no hay fixtures sync, tarjeta se crea/actualiza/elimina en Firestore.
- [ ] 23. Verificar queries en Firestore console que los índices están activos y las queries retornan datos correctos.
