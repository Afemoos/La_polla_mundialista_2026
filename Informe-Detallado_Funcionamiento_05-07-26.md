# Informe Detallado de Funcionamiento
## La Polla Mundialista 2026

**Fecha:** 7 de mayo de 2026  
**Versión:** Pre-lanzamiento (v1.0)  
**Stack:** React 19 + Vite 8 + TypeScript 6 + Firebase (Auth, Firestore) + Python (bots)

---

## 1. Arquitectura General

La aplicación es una SPA (Single Page Application) desplegada en Vercel. Utiliza Firebase Authentication para el login con Google y Firestore como base de datos. Tres bots de Python se ejecutan en GitHub Actions para mantener los datos sincronizados con API-Football.

### 1.1. Diagrama de Flujo de Datos

```
Usuario (Navegador)
    │
    ├─ Firebase Auth (Google Sign-In)
    │   └─ Crea/recupera documento en /users/{uid}
    │
    ├─ Firestore (lectura/escritura en tiempo real)
    │   ├─ /system/*           (datos del sistema: radares, resultados)
    │   ├─ /users/{uid}        (datos del usuario: tokens)
    │   ├─ /predictions/{id}   (apuestas individuales)
    │   ├─ /brackets/{uid}     (predicciones de bracket, campeón, goleador)
    │   ├─ /Teams/world_cup_2026/Group_X/*  (48 equipos con datos completos)
    │   └─ /flat_players/{id}  (1616 jugadores para búsqueda rápida)
    │
    └─ Vercel Serverless Functions
        └─ /api/trigger-excel-sync  (dispara sincronización manual a Google Sheets)

GitHub Actions (bots)
    ├─ accounting_sync.yml (cada 1h)
    │   └─ fetch_matches.py → actualiza system/radar_match, system/colombia_match, system/worldcup_path
    ├─ auditor.yml (cada 15min)
    │   └─ auditor.py → sella predicciones con resultado GANADA/PERDIDA
    └─ results_sync.yml (cada 6h)
        └─ fetch_results.py → actualiza system/recent_results

Script manual
    └─ populate_teams.py → pobló /Teams/* y /flat_players/* (ejecutado una vez)
```

---

## 2. Flujo de Usuario: Inicio de Sesión

### Paso 1: Pantalla de Login

Cuando un usuario no autenticado visita cualquier ruta, `App.tsx` (línea 17) detecta `!authContext?.currentUser` y renderiza una pantalla de login a pantalla completa con:
- Logo y título "La Polla Mundialista"
- Botón "Iniciar sesión" con Google

### Paso 2: Login con Google

Al hacer clic en el botón (AuthContext.tsx línea 58-66):
1. Se crea un `GoogleAuthProvider`
2. `signInWithPopup(auth, provider)` abre una ventana emergente de Google
3. El usuario selecciona su cuenta Google
4. Firebase Auth valida la credencial y crea/recupera un usuario con un UID único

### Paso 3: Registro en Firestore

Cuando Firebase Auth confirma el login (AuthContext.tsx línea 35-53):
1. `onAuthStateChanged` detecta el usuario
2. Verifica si el email está en `ADMIN_EMAILS` (afemos027, afemos023, daar.523)
3. Busca el documento `/users/{uid}` con `getDoc`
4. Si NO existe: lo crea con `setDoc({ uid, email, tokens: 0 })`
5. Si existe: no lo modifica
6. `setLoading(false)` → se renderiza la app

### Paso 4: Sidebar y Tokens

Al cargar el Sidebar (Sidebar.tsx línea 19-27):
1. Se suscribe a `onSnapshot(doc(db, 'users', uid))` para leer tokens en tiempo real
2. El contador de tokens se actualiza automáticamente si un admin modifica el saldo

---

## 3. Navegación y Rutas

### 3.1. Estructura de Rutas (App.tsx)

| Ruta | Componente | Acceso |
|------|-----------|--------|
| `/` | Home | Todos |
| `/polla-mundialista/mi-polla` | PollaMundialista | Todos |
| `/polla-mundialista/mis-16` | Mis16 | Todos |
| `/polla-mundialista/mi-campeon` | MiCampeon | Todos |
| `/polla-mundialista/mi-goleador` | MiGoleador | Todos |
| `/champions` | Champions | Todos |
| `/resultados` | Resultados | Todos |
| `/mis-apuestas` | MisApuestas | Todos |
| `/admin` | Admin | Solo admins |
| `*` | Redirect a `/` | Todos |

La ruta `/polla-mundialista` usa `PollaLayout` como layout con `<Outlet />`. Al acceder a `/polla-mundialista` sin subruta, redirige automáticamente a `mi-polla`.

### 3.2. Sidebar: Menú Colapsable

El sidebar tiene un botón "Polla mundialista" que expande/colapsa 4 subpáginas:
- **Mi Polla** (icono Trophy) → apuestas individuales por partido
- **Mis 16** (icono Swords) → bracket de eliminación directa
- **Mi Campeón** (icono Crown) → predicción del campeón
- **Mi Goleador** (icono Target) → predicción del goleador

El menú se auto-expande si el usuario está en cualquiera de estas subpáginas (useEffect con `location.pathname`).

Enlaces independientes: Champions, Resultados, Mis Apuestas, Admin (solo admins).

### 3.3. Mobile

En pantallas < 768px:
- El sidebar se oculta y aparece un header móvil con botón hamburguesa
- Al hacer clic en ☰, el sidebar se desliza desde la izquierda con overlay oscuro
- Al hacer clic en cualquier link o en el overlay, el sidebar se cierra

---

## 4. Página: Home (Principal)

Archivo: `src/pages/Home.tsx`

### 4.1. Radares

Muestra dos secciones de radar con datos en tiempo real desde Firestore:

1. **Radar Tricolor (Colombia)** — datos de `system/colombia_match`
   - Escudo y nombre de ambos equipos
   - Fecha, estadio
   - Probabilidades (local, empate, visitante)

2. **Radar Global (Mundial/Champions)** — datos de `system/radar_match`
   - Misma estructura

Ambos usan `onSnapshot` para actualizarse en tiempo real cuando los bots modifican los documentos.

### 4.2. Actualización de Datos

El bot `fetch_matches.py` se ejecuta cada hora vía GitHub Actions:
1. Consulta API-Football para el próximo partido de Colombia (team ID 8)
2. Consulta API-Football para el próximo partido de World Cup (league 1) y Champions (league 2)
3. Obtiene predicciones de la API (probabilidades de resultado)
4. Si la API no tiene predicciones, usa probabilidades FIFA precalculadas como fallback
5. Guarda en `system/colombia_match` y `system/radar_match`
6. También actualiza `system/worldcup_path` con los 13 partidos de la ruta mundialista

---

## 5. Página: Mi Polla (Apuestas por Partido)

Archivo: `src/pages/PollaMundialista.tsx`

### 5.1. Carga de Datos

Al montar el componente:
1. `onSnapshot` en `/users/{uid}` → tokens del usuario
2. `onSnapshot` en `predictions` (filtrado por email + tipo POLla_MUNDIALISTA) → predicciones existentes
3. `onSnapshot` en `system/worldcup_path` → 13 partidos disponibles

### 5.2. Tarjeta de Partido (MatchCard)

Cada partido se renderiza como una `glass-card` con:
- **Cabecera:** Equipos (home vs away) + costo en tokens
- **Banderas:** Escudos de ambos equipos (56x56px)
- **Info:** Estadio, fecha, hora (formato colombiano)
- **Probabilidades:** 3 barras (local, empate, visitante) con colores y porcentajes
- **Inputs:** Dos campos numéricos para el marcador
- **Botones:** Guardar, Modificar, Bloquear Definitivamente

### 5.3. Flujo de Apuesta

1. Usuario ingresa marcador (ej. "2 - 1")
2. Clic en "Guardar"
3. Confirmación: "Se descontarán N tokens. Marcador: 2 - 1. ¿Confirmar?"
4. Se ejecuta `setDoc` en `/predictions/{uid}_{matchId}` (ID compuesto previene duplicados)
5. Se descuenta `increment(-tokenCost)` de `/users/{uid}`
6. El campo `lockedAt` se establece con `serverTimestamp()`

### 5.4. Reglas de Modificación

- **48 horas:** El usuario puede modificar su predicción durante 48 horas desde `lockedAt`
- **Pre-partido:** 1 hora antes del partido, la predicción se bloquea automáticamente
- **Bloqueo manual:** Botón "Bloquear Definitivamente" que backdatea `lockedAt` 49 horas atrás
- **Después de 48h:** Solo se muestra el marcador guardado, sin opción de editar

### 5.5. Sin Tokens

Si `userTokens < 1`, se muestra una alerta amarilla: "Sin tokens disponibles. Contacta a un administrador."

---

## 6. Página: Mis 16 (Bracket de Eliminación)

Archivo: `src/pages/Mis16.tsx`

### 6.1. Dos Vistas

La página detecta automáticamente si hay datos de dieciseisavos:

**Vista A — Fase de Grupos (actual):**
- Lee `system/round_of_32_matches` con `getDoc`
- Si no existe o está vacío: muestra mensaje "El torneo se encuentra en fase de grupos"

**Vista B — Fase de Eliminación (cuando haya datos):**
- Muestra bracket con 5 columnas: dieciseisavos → octavos → cuartos → semifinal → final
- 32 slots de partido en total

### 6.2. Estructura del Bracket

| Ronda | Match # | Origen de equipos |
|-------|---------|-------------------|
| Dieciseisavos | 1-16 | `system/round_of_32_matches` (API-Football) |
| Octavos | 17-24 | Ganadores de matches 1-16 |
| Cuartos | 25-28 | Ganadores de matches 17-24 |
| Semifinal | 29-30 | Ganadores de matches 25-28 |
| 3er Lugar | 31 | Perdedores de matches 29-30 |
| Final | 32 | Ganadores de matches 29-30 |

### 6.3. Propagación Automática

La función `propagateBracket()` calcula automáticamente qué equipos aparecen en rondas posteriores:
- Si el usuario marca "ganador = home" en match 1, ese equipo aparece como `homeTeam` en match 17
- Si marca "ganador = away" en match 2, ese equipo aparece como `awayTeam` en match 17
- Para el 3er lugar (match 31), se usan los PERDEDORES de las semifinales

### 6.4. Modal de Predicción

Al hacer clic en un slot de partido:
1. Se abre un modal centrado con overlay semitransparente
2. Muestra banderas y nombres de ambos equipos
3. Inputs numéricos para el marcador de cada equipo
4. Radio buttons: "¿Qué equipo avanza?" (local o visitante)
5. Validaciones:
   - Si se marca ganador, ambos scores deben estar completos
   - El score del ganador debe ser mayor que el del perdedor
   - Si se ingresan scores sin marcar ganador: error
6. Botón "Guardar" → escribe en `/brackets/{uid}` con writeBatch atómico
7. Clic fuera del modal → cierra sin guardar

### 6.5. Costo y Guardado

- Primer guardado: descuenta 15 tokens (vía `saveUserBracket` con batch atómico)
- Guardados posteriores: no descuentan tokens (ya pagó)
- El documento `/brackets/{uid}` contiene:
  - `matches`: array de 32 BracketMatch
  - `tokensSpent.bracket`: 15 (marca que ya pagó)
  - `score`: null (futuro: calculado por bot)
  - `campeonResult`, `goleadorResult`: null (futuro: asignado por bot)

---

## 7. Página: Mi Campeón

Archivo: `src/pages/MiCampeon.tsx`

### 7.1. Carga de Datos

1. `getUserBracket(uid)` → bracket existente (puede ser null)
2. `getAllTeams()` → 48 equipos cacheados (solo la primera vez lee Firestore)

### 7.2. Dropdown Personalizado con Banderas

- Botón que abre/cierra una lista desplegable
- Cada opción muestra: bandera (22x22px) + nombre del equipo
- Al seleccionar un equipo, se cierra el dropdown y se muestra una tarjeta de preview con:
  - Logo grande (48px), nombre, país, código FIFA
  - Fundación, grupo, estadio, ciudad, capacidad, superficie
- Clic fuera del dropdown → se cierra

### 7.3. Guardado

- Botón "Guardar (10 tokens)" si es primera vez
- Botón "Actualizar" si ya pagó
- Escribe `/brackets/{uid}` con `saveUserBracket`, campo `campeon`
- Si ya tenía predicción, se muestra con borde verde y la info actual

---

## 8. Página: Mi Goleador

Archivo: `src/pages/MiGoleador.tsx`

### 8.1. Selector en Cascada (3 pasos)

**Paso 1 — Grupo:**
- Dropdown personalizado con letras grandes doradas (A-L)
- Al seleccionar un grupo, dispara `getTeamsByGroup(group)` → carga 4 equipos

**Paso 2 — Equipo:**
- Dropdown personalizado con banderas
- Solo se habilita después de seleccionar grupo
- Al seleccionar equipo, dispara `getTeamPlayers(teamDocId, group)` → carga 25-50 jugadores

**Paso 3 — Jugador:**
- Lista scrolleable con foto (28px circular), nombre
- Al seleccionar, se resalta con borde dorado
- Se muestra tarjeta de preview: foto grande, nombre, equipo, posición, edad, número

### 8.2. Guardado

- 10 tokens (primera vez), gratis después
- Escribe `/brackets/{uid}`, campo `goleador` con `{ apiId, name, teamName, photo }`

---

## 9. Página: Resultados

Archivo: `src/pages/Resultados.tsx`

- `onSnapshot` en `system/recent_results`
- Muestra 3 secciones: Colombia, Champions League, World Cup
- Cada sección lista los últimos 10 partidos con:
  - Banderas, nombres de equipos, marcador, fecha
- Actualizado por el bot `fetch_results.py` cada 6 horas
- Muestra timestamp de última sincronización

---

## 10. Página: Mis Apuestas

Archivo: `src/pages/MisApuestas.tsx`

- `onSnapshot` en `predictions` filtrado por email del usuario
- Tabla con: Ticket ID, Fecha, Evento, Marcador apostado, Marcador oficial, Resultado
- Resultados: ⏱️ En Juego / 🏆 GANADA / 💀 PERDIDA
- El marcador oficial se llena cuando `auditor.py` sella la predicción

---

## 11. Página: Admin

Archivo: `src/pages/Admin.tsx`

### 11.1. Panel Principal

Visible solo para los 3 admins hardcodeados (AuthContext.tsx línea 23):
- afemos027@gmail.com
- afemos023@gmail.com
- daar.523@gmail.com

### 11.2. Secciones

**Contador de API:**
- Muestra requests diarias a API-Football: usadas / límite (7500)
- Última actualización en tiempo real

**Gestión de Tokens (abierta por defecto):**
- Tabla con todos los usuarios, sus tokens actuales
- Input numérico + botones +/- para agregar/quitar tokens
- Botón "Sincronizar Usuarios Antiguos" para registrar emails históricos
- Botón "Exportar a Excel" que llama a `/api/trigger-excel-sync`

**Predicciones por Usuario:**
- Al hacer clic en el ojo (👁) de un usuario, se filtran sus predicciones
- Muestra: partido, marcador, tokens gastados, estado (activo/bloqueado), tiempo restante

**Historial de Recargas (colapsado por defecto):**
- Tabla con balance de tokens y predicciones activas por usuario

**Formateo de Fábrica (colapsado por defecto, borde rojo):**
- Elimina TODAS las predicciones (colección `predictions`)
- Elimina TODOS los brackets (colección `brackets`)
- Resetea tokens de TODOS los usuarios a 0
- Elimina usuarios duplicados (mismo email, diferente UID)
- Requiere doble confirmación
- No borra equipos, jugadores ni configuraciones del sistema

---

## 12. Página: Champions

Archivo: `src/pages/Champions.tsx`

- Placeholder vacío con mensaje "Champions League — Próximamente"
- Ruta y link en sidebar funcionales
- Preparada para futura implementación de apuestas de Champions

---

## 13. Sistema de Tokens

### 13.1. Estructura

Cada usuario tiene un documento en `/users/{uid}`:
```typescript
{
  uid: string;
  email: string;
  tokens: number;  // saldo actual
}
```

### 13.2. Costos

| Funcionalidad | Costo | Cuándo se cobra |
|--------------|-------|-----------------|
| Apuesta individual (Mi Polla) | 3-5 tokens (variable por partido) | Al guardar predicción |
| Bracket completo (Mis 16) | 15 tokens | Primer guardado |
| Mi Campeón | 10 tokens | Primer guardado |
| Mi Goleador | 10 tokens | Primer guardado |

### 13.3. Atomicidad

Las operaciones que descuentan tokens + guardan datos usan `writeBatch` de Firestore para garantizar atomicidad:
- Si falla el descuento, no se guarda el dato
- Si falla el guardado, no se descuenta el token
- Ambas operaciones son una sola transacción

### 13.4. Registro de Pago

El documento `/brackets/{uid}` tiene un campo `tokensSpent`:
```typescript
tokensSpent: {
  bracket: 15,   // 0 si no ha pagado
  campeon: 10,   // 0 si no ha pagado
  goleador: 10   // 0 si no ha pagado
}
```
Si el valor > 0, no se vuelve a cobrar al editar.

---

## 14. Base de Datos: Firestore

### 14.1. Colecciones del Sistema (`system/`)

| Documento | Escritura | Lectura | Contenido |
|-----------|-----------|---------|-----------|
| `radar_match` | Admin/Bot | Autenticado | Próximo partido global |
| `colombia_match` | Admin/Bot | Autenticado | Próximo partido Colombia |
| `recent_results` | Bot (Admin SDK) | Autenticado | Últimos 10 resultados |
| `api_status` | Bot | Admin | Requests API usadas/límite |
| `worldcup_path` | Admin/Bot | Autenticado | 13 partidos de la ruta |
| `round_of_32_matches` | Admin/Bot | Autenticado | 16 partidos de dieciseisavos |

### 14.2. Colección `predictions`

Documentos con ID compuesto `{uid}_{matchId}` para prevenir duplicados.

```typescript
{
  email: string;
  type: 'POLla_MUNDIALISTA';
  fixtureId: string;
  matchDetails: string;      // "Brasil vs Marruecos"
  prediction: string;        // "2 - 1"
  timestamp: Timestamp;
  lockedAt: Timestamp;       // inicio del período de 48h
  result: 'GANADA' | 'PERDIDA' | null;  // asignado por auditor.py
  finalScore: string | null; // marcador oficial
  homeLogo: string;
  awayLogo: string;
  tokenCost: number;
}
```

### 14.3. Colección `brackets`

Un documento por usuario (ID = UID).

```typescript
{
  userId: string;
  email: string;
  matches: BracketMatch[32];  // predicciones de los 32 partidos
  campeon: TeamInfo | null;
  goleador: { apiId, name, teamName, photo } | null;
  tokensSpent: { bracket, campeon, goleador };
  score: number | null;       // futuro: calculado por bot
  campeonResult: 'GANADA' | 'PERDIDA' | null;
  goleadorResult: 'GANADA' | 'PERDIDA' | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 14.4. Colección `Teams/world_cup_2026/Group_X/`

48 equipos en 12 grupos (A-L), 4 por grupo. Cada documento:
```typescript
{
  apiId: number;          // ID en API-Football
  name: string;           // Nombre del equipo
  code: string;           // Código FIFA 3 letras
  country: string;        // País
  logo: string;           // URL del escudo
  founded: number;        // Año de fundación
  national: true;
  venue: {
    apiId, name, address, city, capacity, surface, image
  };
  group: string;          // A-L
  position: number;       // 1-4
  host: boolean;          // true para México, Canadá, USA
}
```
Subcolección `Players/{playerApiId}` con 25-50 jugadores por equipo.

### 14.5. Colección `flat_players`

Copia plana de los 1616 jugadores para búsqueda eficiente. Un documento por jugador (ID = playerApiId).
Creada por `populate_teams.py` usando Admin SDK.

### 14.6. Reglas de Seguridad (firestore.rules)

Principios:
- **Lectura:** Requiere autenticación (`isAuthenticated()`)
- **Escritura de sistema:** Solo admins (`isAdmin()`)
- **Predicciones:** Usuarios crean/editan las suyas; solo admin elimina
- **Brackets:** Usuarios crean/editan su propio documento; no pueden modificar `score`, `campeonResult`, `goleadorResult` (reservados para bots)
- **Usuarios:** Solo admin puede eliminar (para limpieza de duplicados)
- **Equipos/Jugadores:** Solo admin escribe; autenticados leen

---

## 15. Bots de Python

### 15.1. fetch_matches.py (cada 1 hora)

1. Inicializa Firebase Admin SDK
2. Consulta API-Football para próximos partidos de World Cup (league 1) y Champions (league 2)
3. Consulta próximo partido de Colombia (team 8)
4. Para cada partido, obtiene predicciones de la API
5. Si la API no tiene predicciones, usa tabla `FIFA_BASED_PROBS` (probabilidades precalculadas)
6. Actualiza `system/colombia_match`, `system/radar_match`
7. Construye `system/worldcup_path` con 13 partidos de la ruta colombiana
8. Actualiza `system/api_status` con contador de requests

### 15.2. auditor.py (cada 15 minutos)

1. Lee TODAS las predicciones en `predictions` que no tengan `result`
2. Agrupa por `fixtureId`
3. Para cada partido, consulta API-Football: ¿finalizó? ¿marcador?
4. Si finalizó (FT, AET, PEN):
   - Compara predicción del usuario con marcador real (incluye tiempo extra, NO penales)
   - Asigna `result: 'GANADA'` o `'PERDIDA'`
   - Guarda `finalScore` oficial
5. Usa `batch` para operaciones atómicas

### 15.3. fetch_results.py (cada 6 horas)

1. Consulta últimos 10 partidos de Colombia (team 8)
2. Consulta últimos 10 partidos de Champions League (league 2, season 2025)
3. Consulta últimos 10 partidos de World Cup (league 1, season 2026)
4. Guarda en `system/recent_results` con estructura:
   ```json
   {
     "colombia": [...],
     "champions": [...],
     "worldcup": [...],
     "updatedAt": timestamp
   }
   ```

### 15.4. contabilidad.py

Sincroniza datos de Firestore con Google Sheets:
1. Lee todas las predicciones
2. Escribe pestaña "Auditoria" con cada ticket
3. Escribe pestaña "Resumen Financiero" con totales

### 15.5. populate_teams.py (ejecutado manualmente, una vez)

1. Llama a API-Football: `/teams?league=1&season=2026` → 48 equipos
2. Mapea cada equipo a su grupo y posición según tabla hardcodeada (datos FIFA)
3. Para cada equipo:
   - Guarda datos completos (team + venue) en `/Teams/world_cup_2026/Group_X/{doc_id}`
   - Llama a `/players/squads?team={teamId}`
   - Guarda jugadores en subcolección `Players/{playerApiId}`
   - Guarda copia en `flat_players/{playerApiId}`
4. Rate limiting: `time.sleep(1)` entre llamadas
5. Idempotente: usa `setDoc()` para poder re-ejecutarse

---

## 16. Sistema de Puntuación (Fase Futura)

Cuando el torneo esté en fase de eliminación, se implementará un sistema de puntuación para comparar el bracket real con las predicciones del usuario:

| Acierto | Puntos |
|---------|--------|
| Marcador exacto | 100 pt |
| Solo ganador correcto | 50 pt |
| Fallo | 0 pt |

Máximo posible: 32 matches × 100 = 3200 pt.

Un bot futuro calculará el campo `score` en `/brackets/{uid}`.

---

## 17. Temas y Estilos

### 17.1. Dark/Light Mode

Controlado por `ThemeContext.tsx`:
- Estado guardado en `localStorage`
- Atributo `data-theme="light"` en `<html>` para modo claro
- Sin atributo = modo oscuro (default)
- Toggle en sidebar (ícono sol/luna)

### 17.2. Variables CSS

Todas las variables definidas en `:root` (dark) y `[data-theme='light']` (light):
- `--bg-dark`: fondo principal
- `--bg-card`: fondo de tarjetas (glassmorphism)
- `--primary`: dorado (#FFD700 dark, #eab308 light)
- `--text-main`, `--text-muted`: colores de texto
- `--color-success`, `--color-danger`: verde/rojo semánticos

### 17.3. Glassmorphism

Todas las tarjetas usan `class="glass-card"`:
- `background: var(--bg-card)` con transparencia
- `backdrop-filter: blur(12px)` para efecto vidrio
- `border: 1px solid var(--glass-border)`
- `border-radius: 20px`

---

## 18. Flujos de Error y Estados de Carga

### 18.1. Carga de Datos

Cada página que lee Firestore tiene 3 estados:
1. **Loading:** Spinner centrado mientras se cargan los datos
2. **Error:** Mensaje con el error específico (ej. "Error al cargar equipos: permission-denied")
3. **Vacío:** Mensaje contextual (ej. "No tienes registros activos")

### 18.2. Sin Tokens

Si el usuario no tiene tokens suficientes:
- El botón de guardar se deshabilita
- Se muestra mensaje: "No tienes suficientes tokens. Consigue más para participar."

### 18.3. Sin Datos de API

Si `system/round_of_32_matches` no existe (fase de grupos actual):
- Mis16 muestra mensaje "El torneo se encuentra en fase de grupos"
- No se renderiza el bracket

---

## 19. Despliegue

### 19.1. Vercel

- Push a `main` dispara deploy automático en producción
- Push a otras ramas genera preview deployments
- Build command: `npm run build` (tsc -b && vite build)
- La URL de preview debe agregarse a Firebase Auth > Authorized Domains

### 19.2. GitHub Actions

Tres workflows independientes:
- `accounting_sync.yml`: cada hora
- `auditor.yml`: cada 15 minutos
- `results_sync.yml`: cada 6 horas

Todos usan secrets: `GCP_CREDENTIALS`, `API_FOOTBALL_KEY`.

---

## 20. Grupos del Mundial 2026

| Grupo | Pos 1 | Pos 2 | Pos 3 | Pos 4 |
|-------|-------|-------|-------|-------|
| A | México 🇲🇽 (H) | Sudáfrica 🇿🇦 | Corea del Sur 🇰🇷 | Rep. Checa 🇨🇿 |
| B | Canadá 🇨🇦 (H) | Bosnia y Herz. 🇧🇦 | Catar 🇶🇦 | Suiza 🇨🇭 |
| C | Brasil 🇧🇷 | Marruecos 🇲🇦 | Haití 🇭🇹 | Escocia 🏴󠁧󠁢󠁳󠁣󠁴󠁿 |
| D | EE.UU. 🇺🇸 (H) | Paraguay 🇵🇾 | Australia 🇦🇺 | Turquía 🇹🇷 |
| E | Alemania 🇩🇪 | Curazao 🇨🇼 | Costa de Marfil 🇨🇮 | Ecuador 🇪🇨 |
| F | Países Bajos 🇳🇱 | Japón 🇯🇵 | Suecia 🇸🇪 | Túnez 🇹🇳 |
| G | Bélgica 🇧🇪 | Egipto 🇪🇬 | Irán 🇮🇷 | Nueva Zelanda 🇳🇿 |
| H | España 🇪🇸 | Cabo Verde 🇨🇻 | Arabia Saudita 🇸🇦 | Uruguay 🇺🇾 |
| I | Francia 🇫🇷 | Senegal 🇸🇳 | Irak 🇮🇶 | Noruega 🇳🇴 |
| J | Argentina 🇦🇷 | Argelia 🇩🇿 | Austria 🇦🇹 | Jordania 🇯🇴 |
| K | Portugal 🇵🇹 | RD Congo 🇨🇩 | Uzbekistán 🇺🇿 | Colombia 🇨🇴 |
| L | Inglaterra 🏴󠁧󠁢󠁥󠁮󠁧󠁿 | Croacia 🇭🇷 | Ghana 🇬🇭 | Panamá 🇵🇦 |

(H) = País anfitrión
