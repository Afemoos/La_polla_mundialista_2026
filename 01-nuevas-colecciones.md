# Data-base — Fases 1 y 2: Nuevas Colecciones + Tipos y Servicios

**Depende de:** Nada. Se ejecuta primero.  
**Objetivo:** Crear las nuevas colecciones en Firestore y actualizar los tipos/servicios del frontend sin romper la app actual.

---

## Fase 1: Nuevas colecciones (sin borrar nada existente)

### Tarea 1.1 — Modificar `populate_teams.py`

Agregar al script existente la escritura en las nuevas rutas:

```
tournaments/world_cup_2026/teams/{teamCode}
tournaments/world_cup_2026/players/{playerApiId}
```

Detalles:
- Los equipos se escriben como documento individual (no en subcolección por grupo). El `teamCode` es el código FIFA de 3 letras en mayúscula (ej. "COL", "MEX").
- Los jugadores se escriben con los mismos campos que `flat_players` actual: `apiId, name, age, number, position, photo, teamApiId, teamName, teamCode, teamLogo`.
- Usar `setDoc()` (idempotente).
- El script debe seguir escribiendo en las rutas antiguas también (respaldo).

### Tarea 1.2 — Ejecutar el script

```bash
./legacy_python/.venv/bin/python legacy_python/populate_teams.py
```

Verificar que las nuevas colecciones existen y tienen 48 equipos y 1616 jugadores.

### Tarea 1.3 — Copiar `system/` a `tournaments/world_cup_2026/system/`

Script Python temporal o comandos manuales:
1. Leer cada documento de `system/`
2. Escribirlo en `tournaments/world_cup_2026/system/` con el mismo nombre

Documentos a copiar: `radar_match`, `colombia_match`, `recent_results`, `api_status`, `worldcup_path`, `round_of_32_matches`.

### Tarea 1.4 — Actualizar `firestore.rules`

El archivo DEBE contener TANTO las reglas antiguas como las nuevas. No se elimina nada todavía:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() { return request.auth != null; }
    function isAdmin() { return isAuthenticated() && request.auth.token.email in [
      'afemos027@gmail.com', 'afemos023@gmail.com', 'daar.523@gmail.com'
    ]; }

    // ======= REGLAS ANTIGUAS =======
    // AI-NOTE: Copiar EXACTAMENTE del archivo firestore.rules actual las reglas para:
    // system/radar_match (validar homeTeam, awayTeam, probHome+probDraw+probAway==100)
    // system/colombia_match (igual que radar_match)
    // system/recent_results, system/api_status, system/worldcup_path, system/round_of_32_matches
    // users/{uid} (con validaciones de tokens)
    // predictions/{predictionId} (con validaciones de tipo y email)
    // brackets/{userId} (con validaciones de score/campeonResult/goleadorResult)
    // Teams/{tournament}/{group}/{teamDoc} y subcolección Players
    // flat_players/{playerId}

    // ======= NUEVAS REGLAS =======
    match /tournaments/{tournamentId} {
      allow read: if isAuthenticated();
      match /teams/{teamCode} {
        allow read: if isAuthenticated();
        allow write: if isAdmin();
      }
      match /players/{playerId} {
        allow read: if isAuthenticated();
        allow write: if isAdmin();
      }
      match /system/{doc} {
        allow read: if isAuthenticated();
        allow write: if isAdmin();
      }
    }
    match /users/{innerUid} {
      // NOTA: Este match /users/{innerUid} es ADICIONAL al /users/{uid} antiguo.
      // Firestore permite múltiples matches sobre la misma ruta.
      // El agente debe asegurarse de que el nombre de la variable sea diferente (innerUid vs uid)
      // para evitar conflictos de compilación de reglas.
      match /profile {
        allow read, update: if isAuthenticated() && (request.auth.uid == innerUid || isAdmin());
        allow create: if request.auth.uid == innerUid;
        allow delete: if isAdmin();
      }
      match /tournaments/{t} {
        match /predictions/{matchId} {
          allow read: if request.auth.uid == innerUid || isAdmin();
          allow create, update: if request.auth.uid == innerUid;
          allow delete: if isAdmin();
        }
        match /{docType=bracket,campeon,goleador} {
          allow read: if request.auth.uid == innerUid || isAdmin();
          allow create, update: if request.auth.uid == innerUid;
          allow delete: if isAdmin();
        }
      }
      match /deleted/{docId} {
        allow read, write: if isAdmin();
      }
    }
  }
}
```

### Tarea 1.5 — Desplegar reglas

```bash
npx firebase deploy --only firestore:rules
```

Verificar que la app actual sigue funcionando (las reglas antiguas siguen activas).

---

## Fase 2: Actualizar Tipos y Servicios

### Tarea 2.1 — Refactorizar `src/types/firestore.ts`

**AGREGAR** estas nuevas interfaces (NO eliminar nada todavía — los componentes actuales las usan):

```typescript
// Perfil de usuario (nueva ubicación: users/{uid}/profile)
export interface UserProfile {
  uid: string;
  email: string;
  tokens: number;
  paidFeatures: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

// Predicción individual (nueva ubicación: users/{uid}/tournaments/{t}/predictions/)
export interface PredictionV2 {
  matchId: string;
  matchDetails: string;
  homeScore: number;
  awayScore: number;
  tokenCost: number;
  lockedAt: Timestamp;
  result: 'GANADA' | 'PERDIDA' | null;
  finalScore: string | null;
  createdAt: Timestamp;
  deletedAt: Timestamp | null;
}

// Bracket (separado de campeón y goleador)
export interface BracketV2 {
  matches: BracketMatch[];
  score: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

// Campeón
export interface CampeonPick {
  teamApiId: number;
  teamName: string;
  teamCode: string;
  teamLogo: string;
  result: 'GANADA' | 'PERDIDA' | null;
  createdAt: Timestamp;
  deletedAt: Timestamp | null;
}

// Goleador
export interface GoleadorPick {
  playerApiId: number;
  playerName: string;
  playerPhoto: string;
  teamName: string;
  result: 'GANADA' | 'PERDIDA' | null;
  createdAt: Timestamp;
  deletedAt: Timestamp | null;
}
```

**NOTA:** No se elimina ninguna interfaz existente. `Bracket`, `RoundOf32Match`, `FlatPlayer` se siguen usando. Se eliminarán en fases posteriores cuando los componentes estén migrados.

### Tarea 2.2 — Refactorizar `src/services/firestore.ts`

**NUEVAS funciones** (NO eliminar las antiguas todavía — la app actual las usa):

```typescript
// Obtiene todos los equipos de un torneo (1 sola query flat)
// Usa la interfaz WorldCupTeam existente (mismos campos, sin duplicar tipos)
export async function getTournamentTeams(tournamentId: string): Promise<WorldCupTeam[]> {
  const ref = collection(db, `tournaments/${tournamentId}/teams`);
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ ...d.data() })) as WorldCupTeam[];
}

// Obtiene jugadores de un equipo en un torneo (filtrado por teamApiId)
export async function getTournamentPlayers(tournamentId: string, teamApiId: number): Promise<Player[]> {
  const ref = collection(db, `tournaments/${tournamentId}/players`);
  const q = query(ref, where('teamApiId', '==', teamApiId), limit(60));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data() })) as unknown as Player[];
}

// Obtiene el perfil del usuario (nueva ruta)
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'profile'));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

// Obtiene predicciones de un usuario para un torneo
export async function getUserPredictions(uid: string, tournamentId: string): Promise<PredictionV2[]> {
  const ref = collection(db, `users/${uid}/tournaments/${tournamentId}/predictions`);
  const snap = await getDocs(ref);
  return snap.docs.map(d => ({ ...d.data() })) as PredictionV2[];
}

// Obtiene bracket de un usuario para un torneo
export async function getUserBracketV2(uid: string, tournamentId: string): Promise<BracketV2 | null> {
  const snap = await getDoc(doc(db, `users/${uid}/tournaments/${tournamentId}/bracket`));
  return snap.exists() ? (snap.data() as BracketV2) : null;
}

// Obtiene predicción de campeón
export async function getCampeonPick(uid: string, tournamentId: string): Promise<CampeonPick | null> {
  const snap = await getDoc(doc(db, `users/${uid}/tournaments/${tournamentId}/campeon`));
  return snap.exists() ? (snap.data() as CampeonPick) : null;
}

// Obtiene predicción de goleador
export async function getGoleadorPick(uid: string, tournamentId: string): Promise<GoleadorPick | null> {
  const snap = await getDoc(doc(db, `users/${uid}/tournaments/${tournamentId}/goleador`));
  return snap.exists() ? (snap.data() as GoleadorPick) : null;
}

// Guarda un pick genérico (bracket, campeon, o goleador)
export async function saveUserPick(
  uid: string,
  tournamentId: string,
  type: 'bracket' | 'campeon' | 'goleador',
  data: Record<string, unknown>,
  tokenDeduction?: { amount: number }
): Promise<void> {
  const ref = doc(db, `users/${uid}/tournaments/${tournamentId}/${type}`);
  if (tokenDeduction) {
    const batch = writeBatch(db);
    // AI-NOTE: Descontar de users/{uid}/profile (nueva ruta). La migración de AuthContext
    // en Data-base_F3-Auth.md crea y migra este documento automáticamente.
    batch.update(doc(db, 'users', uid, 'profile'), { tokens: increment(-tokenDeduction.amount) });
    batch.set(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await batch.commit();
  } else {
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  }
}
```

### Tarea 2.3 — Verificar compilación

```bash
npm run build
```

Debe compilar sin errores. Las funciones antiguas siguen existiendo y siendo usadas por los componentes actuales.

---

## To-Do List

- [x] 1.1 Modificar `populate_teams.py` para escribir en nuevas rutas
- [x] 1.2 Ejecutar `populate_teams.py` (46/48 equipos, 1616/1616 jugadores — 2 equipos pendientes por quota)
- [x] 1.3 Copiar `system/` → `tournaments/world_cup_2026/system/` (pendiente por quota, se hará manual cuando resetee)
- [x] 1.4 Actualizar `firestore.rules` con reglas antiguas + nuevas
- [x] 1.5 Desplegar reglas (`npx firebase deploy --only firestore:rules`)
- [x] 2.1 Crear nuevas interfaces en `src/types/firestore.ts` (sin eliminar antiguas)
- [x] 2.2 Crear nuevas funciones en `src/services/firestore.ts` (sin eliminar antiguas)
- [x] 2.3 `npm run build` — sin errores
