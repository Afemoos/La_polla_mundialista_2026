# Plan de Implementación: Bracket "Mis 16", "Mi Campeón", "Mi Goleador" y Reorganización de Navegación

## 1. Contexto y Objetivos

Ampliar la sección "Polla Mundialista" con tres nuevas funcionalidades de predicción para el Mundial 2026, reorganizar la navegación y sentar las bases para la Champions League.

- **Mis 16:** Bracket interactivo donde cada usuario predice los 32 partidos desde dieciseisavos hasta la final. Los equipos de dieciseisavos vienen de la API; los de rondas posteriores se derivan automáticamente de las predicciones del usuario en rondas anteriores.
- **Mi Campeón:** Dropdown simple para que el usuario seleccione el campeón del torneo (de entre los 48 equipos ya almacenados en Firestore).
- **Mi Goleador:** Búsqueda con autocompletado para seleccionar el goleador del torneo (de entre los 1616 jugadores ya almacenados en Firestore).
- **Mi Polla:** El contenido actual de `/polla-mundialista` se reubica aquí como subpágina.
- **Champions:** Página vacía (placeholder) debajo de "Polla Mundialista" en el sidebar.

## 2. Arquitectura de Base de Datos (Firestore)

### 2.1. Evaluación de la propuesta original

Propuesta del usuario: `/predictions/mis_16/users/{userId}`

**Análisis:** La colección `predictions` ya existe con un esquema específico (`email`, `type`, `matchDetails`, `prediction`, `result`, etc.) para apuestas individuales. Mezclar el bracket (un documento único por usuario con 32 partidos) en esta colección crea confusión de esquemas. Las reglas de Firestore actuales para `predictions` validan campos que el bracket no tendrá.

**Alternativa recomendada:** Colección independiente `/brackets/{userId}` con un solo documento por usuario que contenga:
- Los 32 partidos del bracket
- La selección de campeón
- La selección de goleador

Esto simplifica reglas de Firestore, evita conflictos de esquema, y permite una sola lectura para obtener toda la predicción del torneo del usuario.

### 2.2. Nueva colección: `brackets`

**Ruta:** `/brackets/{userId}` — un documento por usuario.

**Estructura del documento:**

```typescript
interface BracketMatch {
  matchNumber: number;           // 1-32
  round: 'dieciseisavos' | 'octavos' | 'cuartos' | 'semifinal' | 'tercer_lugar' | 'final';
  homeTeam: { apiId: number; name: string; code: string; logo: string; } | null;
  awayTeam: { apiId: number; name: string; code: string; logo: string; } | null;
  homeScore: number | null;      // null = no ingresado aún
  awayScore: number | null;      // null = no ingresado aún
  winner: 'home' | 'away' | null; // equipo que avanza (checkbox). null = no seleccionado
}

interface Bracket {
  userId: string;
  email: string;
  matches: BracketMatch[];        // 32 elementos (match-1 a match-32)
  campeon: { apiId: number; name: string; code: string; logo: string; } | null;
  goleador: { apiId: number; name: string; teamName: string; photo: string; } | null;
  tokensSpent: {
    bracket: number;               // 15 o 0
    campeon: number;               // 10 o 0
    goleador: number;              // 10 o 0
  };
  score: number | null;            // puntaje total calculado por el bot (fase futura)
  campeonResult: 'GANADA' | 'PERDIDA' | null;   // asignado por bot al final del torneo
  goleadorResult: 'GANADA' | 'PERDIDA' | null;   // asignado por bot al final del torneo
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Distribución de rounds en los 32 matches:**

| Match # | Ronda |
|---------|-------|
| 1-16 | dieciseisavos (Round of 32) |
| 17-24 | octavos (Round of 16) |
| 25-28 | cuartos (Quarterfinals) |
| 29-30 | semifinal (Semifinals) |
| 31 | tercer_lugar (Third place) |
| 32 | final (Final) |

**Regla de propagación automática (crucial):** El ganador de match-1 y match-2 se convierten en `homeTeam` y `awayTeam` de match-17. El ganador de match-3 y match-4 → match-18, etc. Esto se calcula automáticamente en el frontend, NO en Firestore (para que siempre sea consistente con las selecciones del usuario).

### 2.3. Cambios en `firestore.rules`

Agregar al final del archivo (antes del cierre final `}`):

```
match /brackets/{userId} {
  allow read: if isAuthenticated();
  allow create: if isAuthenticated() && request.auth.uid == userId &&
    request.resource.data.userId == userId &&
    request.resource.data.email == request.auth.token.email &&
    (!('score' in request.resource.data) || request.resource.data.score == null) &&
    (!('campeonResult' in request.resource.data) || request.resource.data.campeonResult == null) &&
    (!('goleadorResult' in request.resource.data) || request.resource.data.goleadorResult == null);
  allow update: if isAuthenticated() && request.auth.uid == userId &&
    request.resource.data.userId == userId &&
    (!('score' in request.resource.data) || request.resource.data.score == resource.data.score) &&
    (!('campeonResult' in request.resource.data) || request.resource.data.campeonResult == resource.data.campeonResult) &&
    (!('goleadorResult' in request.resource.data) || request.resource.data.goleadorResult == resource.data.goleadorResult);
  allow delete: if isAdmin();
}

match /players/{tournament}/{playerId} {
  allow read: if isAuthenticated();
  allow create, update, delete: if isAdmin();
}
```

### 2.4. Cambios en `src/types/firestore.ts`

Agregar las interfaces `BracketMatch` y `Bracket` descritas en 2.2.

### 2.5. Cambios en `src/services/firestore.ts`

Agregar funciones helper:

```typescript
// Obtiene el bracket del usuario. Retorna null si no existe.
getUserBracket(userId: string): Promise<Bracket | null>

// Guarda o actualiza campos parciales del bracket. Usa setDoc con merge: true para crear si no existe.
// IMPORTANTE: La deducción de tokens y el guardado del bracket deben ser atómicos.
// Usar writeBatch para hacer ambas operaciones en una sola transacción.
saveUserBracket(userId: string, data: Partial<Bracket>, tokenDeduction?: { field: string, amount: number }): Promise<void>
  // Si tokenDeduction está presente, ejecuta en batch:
  //   1. updateDoc(doc(db, 'users', userId), { tokens: increment(-amount) })
  //   2. setDoc(doc(db, 'brackets', userId), { ...data, tokensSpent: { [field]: amount } }, { merge: true })

// Busca jugadores en la colección plana por nombre (para el combobox de MiGoleador).
// Usa query con orderBy('name') y startAt/endAt para búsqueda eficiente. No carga los 1616 de una vez.
searchPlayers(searchTerm: string, limit?: number): Promise<FlatPlayer[]>
```

### 2.6. Nueva colección plana de jugadores: `players`

**Ruta:** `/players/world_cup_2026/{playerApiId}` — un documento por jugador.

**Motivación:** Consultar 48 subcolecciones `Players` para el autocompletado de "Mi Goleador" sería muy lento (~48 lecturas). En su lugar, se crea una colección plana donde buscar jugadores requiere una sola query con `where('name', '>=', searchTerm)`.

**Estructura del documento:**

```typescript
interface FlatPlayer {
  apiId: number;
  name: string;
  age: number;
  number: number | null;
  position: string;
  photo: string;
  teamApiId: number;
  teamName: string;
  teamCode: string;
  teamLogo: string;
}
```

**Cambio requerido en `legacy_python/populate_teams.py`:** Agregar al final del loop de guardado de cada jugador una escritura adicional en la colección plana:

```python
db.document(f"players/world_cup_2026/{player_id}").set({
    "apiId": player.get("id"),
    "name": player.get("name"),
    "age": player.get("age"),
    "number": player.get("number"),
    "position": player.get("position"),
    "photo": player.get("photo"),
    "teamApiId": team_api_id,
    "teamName": team_data.get("name"),
    "teamCode": team_data.get("code"),
    "teamLogo": team_data.get("logo"),
})
```

## 3. Backend / APIs

### 3.1. Origen de datos para dieciseisavos

Los 16 partidos de dieciseisavos serán proporcionados por API-Football cuando termine la fase de grupos. El endpoint:

```
GET https://v3.football.api-sports.io/fixtures?league=1&season=2026&round=Round of 32
```

Se guardará en `system/round_of_32_matches` (documento nuevo). Un futuro script de bot (similar a `fetch_matches.py`) lo poblará cuando los datos estén disponibles.

**Comportamiento actual (fase de grupos, ~11-27 junio 2026):**
- El documento `system/round_of_32_matches` NO existe o está vacío.
- La página "Mis 16" debe detectar esta condición y mostrar un mensaje:
  > "El torneo se encuentra en fase de grupos. La predicción de eliminación directa estará disponible cuando comiencen los dieciseisavos."
- "Mi Campeón" y "Mi Goleador" sí están disponibles desde hoy (no dependen de partidos).

**Comportamiento futuro (cuando termine la fase de grupos):**
- El bot poblará `system/round_of_32_matches` con 16 partidos.
- La página "Mis 16" detecta que el documento tiene datos y renderiza el bracket con los 16 partidos de dieciseisavos poblados.
- El usuario puede empezar a llenar sus predicciones.

**Lógica de detección en Mis16.tsx:**
```typescript
// Al cargar la página:
const snapshot = await getDoc(doc(db, 'system', 'round_of_32_matches'));
if (!snapshot.exists() || !snapshot.data().matches || snapshot.data().matches.length === 0) {
  // Mostrar mensaje de "fase de grupos"
} else {
  // Renderizar bracket con los 16 partidos
}
```
Esta verificación se hace cada vez que el usuario entra a la página, por lo que cuando el bot actualice el documento, el bracket aparecerá automáticamente sin necesidad de deploy.

### 3.2. Nuevo documento del sistema: `system/round_of_32_matches`

```typescript
interface RoundOf32Match {
  matchNumber: number;    // 1-16
  homeTeam: { apiId: number; name: string; code: string; logo: string; };
  awayTeam: { apiId: number; name: string; code: string; logo: string; };
  date: string;
  stadium: string;
}
```

El script `fetch_matches.py` se extenderá en el futuro para poblar este documento. Para este plan, se crea la interfaz y la referencia en Firestore, pero el script no se modifica aún.

### 3.3. Nuevo script: `legacy_python/fetch_bracket_matches.py`

Se creará un script de bot (a futuro, no en este plan) que llame a la API y guarde los partidos de dieciseisavos en `system/round_of_32_matches`. El plan sienta las bases (interfaz, referencia, ruta de Firestore) para que este script se implemente cuando los datos estén disponibles.

## 4. Frontend: Rutas, Componentes y UI/UX

### 4.1. Reorganización de rutas (App.tsx)

Se usarán rutas anidadas de React Router. La ruta `/polla-mundialista` se convierte en un layout con subrutas:

```
/polla-mundialista
  /mi-polla       → PollaMundialista.tsx (contenido actual renombrado)
  /mis-16         → Mis16.tsx (nuevo: bracket)
  /mi-campeon     → MiCampeon.tsx (nuevo: selección de campeón)
  /mi-goleador    → MiGoleador.tsx (nuevo: selección de goleador)
/champions        → Champions.tsx (placeholder vacío)
```

**Cambios en `App.tsx`:**

1. Agregar imports de los nuevos componentes
2. Modificar `<Route path="/polla-mundialista">` para usar un componente layout con `<Outlet />`
3. Agregar `<Route path="/champions" element={<Champions />} />`

**Componente layout (nuevo):** `src/pages/PollaLayout.tsx` — renderiza `<Outlet />` y posiblemente una sub-navegación con tabs o breadcrumb.

### 4.2. Cambios en Sidebar.tsx

**Comportamiento del menú "Polla mundialista":** Colapsable. El link principal "Polla mundialista" actúa como botón que expande/colapsa las 4 subpáginas. Al hacer clic en el botón padre:
- Se despliegan "Mi Polla", "Mis 16", "Mi Campeón", "Mi Goleador" con indentación visual.
- Al hacer clic nuevamente, se colapsan.
- Si el usuario está en cualquiera de estas subpáginas, el menú se mantiene expandido automáticamente (estado activo).

**Links actuales que cambian:**
- "Polla mundialista" → ahora es un botón colapsable (no un link directo). Su ruta por defecto al expandirse es `/polla-mundialista/mi-polla`.

**Nuevos links (subpáginas de "Polla mundialista", con indentación visual):**
- "Mi Polla" → `/polla-mundialista/mi-polla` (ícono: `Trophy`)
- "Mis 16" → `/polla-mundialista/mis-16` (ícono: `Swords`)
- "Mi Campeón" → `/polla-mundialista/mi-campeon` (ícono: `Crown`)
- "Mi Goleador" → `/polla-mundialista/mi-goleador` (ícono: `Target`)

**Nuevo link independiente:**
- "Champions" → `/champions` (ícono: `Star`) — ubicado después de "Polla mundialista", antes de "Resultados".

### 4.3. Página: Mis16.tsx — Bracket interactivo

**La página tiene dos vistas según la disponibilidad de datos:**

#### Vista A: Fase de grupos (actual, sin datos de dieciseisavos)

Cuando `system/round_of_32_matches` no existe o está vacío:
- Mostrar `glass-card` centrada con ícono de calendario y texto:
  > "El torneo se encuentra en fase de grupos. La predicción de eliminación directa estará disponible cuando comiencen los dieciseisavos."
- No se muestra el bracket ni el modal de predicción.
- El link en el sidebar sigue visible y funcional.

#### Vista B: Fase de eliminación (cuando hay datos)

Cuando `system/round_of_32_matches` tiene 16 partidos, se renderiza el bracket completo.

**Layout:** Visualización de bracket de eliminación directa estilo torneo, con 5 columnas (dieciseisavos → octavos → cuartos → semifinal → final). Responsive: en desktop se ven las 5 columnas, en mobile se puede hacer scroll horizontal.

**Cada partido se renderiza como un botón (`glass-card`):**
```
[bandera_home] equipo_home - equipo_away [bandera_away]
       [score_home]  -  [score_away]
```
- Si el slot está vacío (equipos no definidos por la API aún): mostrar "vs" con texto placeholder.
- Si el slot tiene equipos: mostrar banderas y nombres.

**Al hacer clic en un partido de dieciseisavos (matches 1-16):**
1. Se abre un modal centrado en pantalla con overlay semitransparente
2. El modal muestra:
   - Banderas y nombres de ambos equipos (no editables)
   - Checkbox debajo de cada equipo: "Avanza a octavos" (solo uno puede estar marcado)
   - Inputs numéricos para el marcador de cada equipo
   - Botón "Guardar"
3. Al hacer clic fuera del modal (en el overlay), se cierra y los cambios no guardados se descartan
4. Al guardar, se actualiza el documento en `/brackets/{userId}`

**Al hacer clic en un partido de rondas posteriores (matches 17-32):**
- Misma mecánica de modal, pero los equipos ya están definidos por las predicciones de rondas anteriores (propagación automática).
- Si el usuario aún no ha definido los ganadores de los partidos anteriores, el slot muestra "Por definir".

**Estados visuales de cada partido en el bracket:**
- **Vacío:** Sin equipos asignados (dieciseisavos sin datos de API). Borde punteado, texto "vs".
- **Pendiente:** Equipos visibles pero sin predicción del usuario. Borde normal.
- **Completado:** Predicción guardada (score + winner). Borde verde (--color-success) y pequeño check.
- **Bloqueado:** Partido ya comenzó (no editable). Borde gris, candado.

**Propagación automática (lógica frontend):**
```typescript
function propagateBracket(matches: BracketMatch[]): BracketMatch[] {
  // Para cada ronda, los ganadores de la ronda anterior determinan los equipos
  // Ej: winner de match-1 → homeTeam de match-17, winner de match-2 → awayTeam de match-17
}
```
Esta función se ejecuta cada vez que el usuario guarda un cambio. NO modifica Firestore directamente; solo actualiza el estado local para reflejar los equipos en rondas posteriores.

### 4.4. Página: MiCampeon.tsx — Selección de campeón

**Layout:** Tarjeta `glass-card` centrada con:
- Título: "¿Quién será el campeón?"
- Dropdown/select con los 48 equipos (obtenidos de `getTeamsByGroup()`)
- Cada opción muestra: bandera + nombre del equipo
- Botón "Guardar"
- Si ya hay selección guardada, mostrar la bandera y nombre del equipo seleccionado con opción de cambiar

**Guardado:** Campo `campeon` en el documento `/brackets/{userId}`.

### 4.5. Página: MiGoleador.tsx — Selección de goleador

**Layout:** Tarjeta `glass-card` centrada con:
- Título: "¿Quién será el goleador?"
- Input de búsqueda con autocompletado (combobox)
- El usuario escribe y la lista se filtra en tiempo real mostrando sugerencias
- Cada sugerencia muestra: foto del jugador + nombre + equipo
- Si el usuario escribe pero no selecciona de la lista, NO puede guardar
- Botón "Guardar" (deshabilitado hasta que se seleccione un jugador)
- Si ya hay selección guardada, mostrar foto + nombre + equipo con opción de cambiar

**Datos:** Los jugadores se obtienen de la colección plana `/players/world_cup_2026/` usando la función `searchPlayers()` con búsqueda incremental (orderBy + startAt/endAt). No se cargan todos los jugadores de una vez; solo los que coinciden con el término de búsqueda (máximo 20 resultados por query).

**Guardado:** Campo `goleador` en el documento `/brackets/{userId}`.

### 4.6. Página: Champions.tsx — Placeholder

Página vacía con un título "Champions League — Próximamente" usando `glass-card`. Sin funcionalidad. Solo la ruta y el link en sidebar.

## 5. Lógica de Reglas de Negocio

### 5.1. Bloqueo de partidos

- Un partido de dieciseisavos se bloquea cuando su `date` es anterior a `now() + 1 hora`.
- Los partidos de rondas posteriores no tienen fecha hasta que se definan los ganadores de la ronda anterior, por lo que no se bloquean hasta que tengan equipos asignados y fecha.
- Un partido bloqueado no puede editarse (ni score ni winner).
- El campeón y goleador pueden editarse hasta el inicio del torneo (June 11, 2026).

### 5.2. Validaciones del modal de partido

- Si se marca un ganador, ambos scores deben estar completos.
- El score del ganador debe ser mayor que el del perdedor.
- En caso de empate en el score, se permite pero se muestra advertencia (los penales definen en la vida real, pero aquí el checkbox decide).
- Si se ingresan scores pero no se marca ganador, al guardar se muestra error: "Selecciona qué equipo avanza".

### 5.3. Inicialización del documento bracket

- El documento `/brackets/{userId}` **se crea automáticamente** la primera vez que el usuario guarda una predicción en cualquiera de las tres páginas (Mis 16, Mi Campeón, Mi Goleador). No se crea al entrar a la página.
- Si el documento no existe, el estado inicial del bracket muestra todos los slots vacíos.
- El campo `matches` se inicializa como un array de 32 objetos `BracketMatch` con `homeTeam: null`, `awayTeam: null`, `homeScore: null`, `awayScore: null`, `winner: null`.

### 5.4. Estados de carga y error

- **Loading:** Spinner mientras se cargan los datos de `/brackets/{userId}` y `system/round_of_32_matches`.
- **Error:** Si Firestore falla, mostrar mensaje de error con botón de reintentar.
- **Sin datos (bracket no creado aún):** Mostrar el bracket con slots vacíos. El usuario puede empezar a llenar sin fricción.
- **Saldo insuficiente:** Si `users/{uid}.tokens < costo`, mostrar mensaje: "No tienes suficientes tokens. Consigue más para participar." con el saldo actual visible. El botón de guardar se deshabilita.
- **Cobro ya realizado:** Si `tokensSpent.bracket > 0`, no se vuelve a cobrar al editar.

### 5.5. Sistema de puntuación (para fase futura de comparación)

Cuando el bracket real del torneo esté disponible en el Home, se comparará con el bracket del usuario en "Mis 16" y se asignarán puntos por cada uno de los 32 matches:

| Acierto | Puntos |
|---------|--------|
| Marcador exacto (score local y visitante correctos) | **100 pt** |
| Solo ganador correcto (score incorrecto pero el equipo que avanza es el mismo) | **50 pt** |
| Predicción fallida (ganador incorrecto) | **0 pt** |

**Nota:** El scoring solo aplica a los 32 matches del bracket.

**Cálculo del puntaje total del usuario:** Suma de los puntos obtenidos en los 32 matches. Puntaje máximo posible: 32 × 100 = 3200 pt.

**Implementación (futura):** Un script de bot comparará los fixtures reales del torneo contra cada `/brackets/{userId}` y escribirá el puntaje en un campo `score` dentro del documento del bracket. La UI de "Mis 16" mostrará el puntaje acumulado en tiempo real.

**"Mi Campeón" y "Mi Goleador":** No usan puntaje. Simplemente se determina si la predicción fue `GANADA` o `PERDIDA` cuando finalice el torneo. El bot asignará un campo `campeonResult` y `goleadorResult` con estos valores.

### 5.6. Precio en tokens

Cada funcionalidad tiene un costo fijo en tokens que se descuenta del saldo del usuario (`users/{uid}.tokens`) al guardar por primera vez:

| Funcionalidad | Costo |
|---------------|-------|
| Bracket completo (Mis 16) | **15 tokens** |
| Mi Campeón | **10 tokens** |
| Mi Goleador | **10 tokens** |

**Total máximo:** 35 tokens si el usuario participa en las tres.

**Reglas de cobro:**
- El cobro se realiza una sola vez por funcionalidad (no por partido ni por edición).
- El documento `/brackets/{userId}` incluye un campo `tokensSpent: { bracket: number, campeon: number, goleador: number }` que registra cuánto se pagó por cada una (0 si no se ha pagado aún).
- Al guardar por primera vez en Mis 16, se descuenta `increment(-15)` de `users/{uid}.tokens` y se registra `tokensSpent.bracket = 15`.
- Ídem para Campeón (10) y Goleador (10) al guardar en sus respectivas páginas.
- Una vez pagado, el usuario puede editar sus predicciones sin costo adicional.
- Si el usuario no tiene tokens suficientes, se muestra un mensaje de error y no se permite guardar.

## 6. To-Do List (Checklist de Progreso)

*Agente: Marca con una `[x]` las tareas a medida que las vayas completando.*

### Fase 1: Tipos de TypeScript y Servicios
- [x] 1. Agregar interfaces `BracketMatch`, `Bracket`, `RoundOf32Match`, `FlatPlayer` en `src/types/firestore.ts`.
- [x] 2. Agregar funciones `getUserBracket()`, `saveUserBracket()` (con writeBatch para tokens), `searchPlayers()` (query incremental a colección plana) en `src/services/firestore.ts`.
- [x] 3. Agregar reglas de seguridad para `/brackets/{userId}` y `/players/{tournament}/{playerId}` en `firestore.rules`.
- [x] 4. Modificar `legacy_python/populate_teams.py`: al guardar cada jugador, escribir también en la colección plana `/flat_players/{playerApiId}`. Re-ejecutar el script para poblar la colección plana.

### Fase 2: Reorganización de Rutas y Sidebar
- [x] 5. Modificar `App.tsx`: implementar rutas anidadas bajo `/polla-mundialista` con layout `PollaLayout.tsx`, agregar ruta `/champions`.
- [x] 6. Crear `src/pages/PollaLayout.tsx` (layout con Outlet para subpáginas de polla).
- [x] 7. Actualizar `Sidebar.tsx`: menú colapsable "Polla mundialista" con 4 subpáginas indentadas (Mi Polla, Mis 16, Mi Campeón, Mi Goleador) + link independiente "Champions".

### Fase 3: Páginas Nuevas
- [x] 8. Crear `src/pages/Mis16.tsx` — dos vistas: (A) mensaje "fase de grupos" cuando no hay datos, (B) bracket interactivo con 32 slots, modal de predicción, y propagación automática cuando `system/round_of_32_matches` está poblado.
- [x] 9. Crear `src/pages/MiCampeon.tsx` — dropdown con 48 equipos para seleccionar campeón.
- [x] 10. Crear `src/pages/MiGoleador.tsx` — combobox con autocompletado sobre 1616 jugadores (usa colección plana).
- [x] 11. Crear `src/pages/Champions.tsx` — placeholder vacío.

### Fase 4: Reubicación de Contenido Existente
- [x] 12. Renombrar/reubicar `PollaMundialista.tsx` para que sea la página "Mi Polla" bajo `/polla-mundialista/mi-polla`. Su funcionalidad no cambia; solo su ruta.

### Fase 5: Verificación
- [x] 13. Ejecutar `npm run build` y asegurar que TS compila sin errores ni warnings.
- [x] 14. Ejecutar `npm run dev`, probar navegación manual: sidebar colapsable, rutas anidadas, páginas nuevas.
