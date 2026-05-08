# Data-base.md — Plan de Reestructuración de Firestore

**Fecha:** 7 de mayo de 2026  
**Objetivo:** Rediseñar la base de datos para que sea escalable, organizada por torneo, recuperable ante errores y fácil de consultar.

---

## 1. Diagnóstico: Estructura Actual

```
/ (raíz)
├── predictions/{uid_matchId}               # Apuestas individuales (flat)
├── brackets/{uid}                           # Predicciones de bracket (flat)
├── users/{uid}                              # Perfiles de usuario (flat)
├── flat_players/{playerApiId}               # Jugadores duplicados (denormalizados)
├── Teams/world_cup_2026/Group_A/{docId}     # Equipos anidados 4 niveles
│   └── Players/{playerApiId}                # Jugadores (fuente original)
└── system/
    ├── radar_match
    ├── colombia_match
    ├── recent_results
    ├── api_status
    ├── worldcup_path
    └── round_of_32_matches
```

### Problemas identificados

| # | Problema | Impacto |
|---|----------|---------|
| 1 | Sin organización por torneo | Imposible agregar Champions League sin mezclar datos |
| 2 | `predictions` es una colección plana global | Crecimiento ilimitado; sin relación directa con el usuario |
| 3 | `Teams` anidado 4 niveles | 12 queries para cargar 48 equipos; difícil de cachear |
| 4 | `flat_players` duplicado | Riesgo de desincronización con fuente original |
| 5 | Sin soft-delete | Formateo de fábrica = pérdida irreversible |
| 6 | `system/*` como documentos sueltos | Difícil de versionar o extender por torneo |
| 7 | `brackets` mezcla campeón y goleador con bracket | Si el usuario solo quiere elegir campeón, igual se crea un documento de bracket enorme |
| 8 | Sin índices compuestos declarados | Queries complejos pueden fallar en producción |

---

## 2. Propuesta: Nueva Estructura

### 2.1. Principios de diseño

1. **Todo bajo un torneo:** Cada torneo (World Cup 2026, Champions League) tiene su propio namespace
2. **Usuarios como raíz de sus datos:** Las predicciones viven bajo el usuario, no en colecciones globales
3. **Una sola fuente de verdad:** Sin duplicados. Si se necesita una vista plana, se usa un índice o una colección derivada administrada por bots.
4. **Soft-delete universal:** Nada se borra permanentemente. Se marca como eliminado y se limpia en lote después de N días.
5. **Documentos autocontenidos:** Cada documento tiene suficientes datos para evitar joins (lecturas extra).

### 2.2. Nueva estructura propuesta

```
tournaments/
  world_cup_2026/
    config/                                   # Configuración del torneo
    teams/{teamCode}                          # 48 equipos (flat, una sola query)
    players/{playerApiId}                     # 1616 jugadores (flat, sin duplicados)
    system/
      radar_match                             # Próximo partido global
      colombia_match                          # Próximo partido de Colombia
      recent_results                          # Últimos resultados
      api_status                              # Contador de API
      worldcup_path                           # Ruta mundialista
      round_of_32_matches                     # Partidos de dieciseisavos

  champions_league_2025/
    teams/{teamCode}
    players/{playerApiId}
    system/
      radar_match
      recent_results

users/
  {uid}/
    profile/                                  # Datos básicos + tokens + funcionalidades pagadas
    deleted/                                  # Papelera de reciclaje (soft-delete)
    tournaments/
      world_cup_2026/
        predictions/{matchId}                 # Apuestas individuales
        bracket                               # Documento único de bracket (32 matches)
        campeon                               # Predicción de campeón
        goleador                              # Predicción de goleador
```

### 2.3. Comparación: Antes vs Después

| Aspecto | Antes | Después |
|---------|-------|---------|
| Torneos | Sin namespace | `tournaments/{tournamentId}/` |
| Equipos | 4 niveles de anidación | `tournaments/{t}/teams/{code}` — 1 nivel |
| Jugadores | Duplicados en 2 lugares | Solo en `tournaments/{t}/players/{id}` |
| Predicciones | Colección global `predictions` | `users/{uid}/tournaments/{t}/predictions/` |
| Bracket/Campeón/Goleador | Un solo doc con todo | 3 documentos separados bajo el usuario |
| Registro de pago | `tokensSpent` en bracket | `paidFeatures` en `users/{uid}/profile` |
| Sistema | 6 docs sueltos en `system/` | `tournaments/{t}/system/` por torneo |
| Borrado | Eliminación física | Soft-delete → `deletedAt` (30 días retención) |
| Admin queries | `where('email', '==', x)` en colección plana | `collectionGroup('predictions')` |
| Escalabilidad | 1 torneo = todo mezclado | N torneos = N namespaces independientes |

---

## 3. Detalle de cada colección

### 3.1. `tournaments/{tournamentId}/teams/{teamCode}`

```typescript
interface Team {
  apiId: number;
  name: string;          // "Colombia"
  code: string;          // "COL" (ID del documento)
  country: string;
  logo: string;
  founded: number | null;
  national: boolean;
  venue: TeamVenue;
  group: string;         // "A" - "L"
  position: number;      // 1-4
  host: boolean;
}
```

**Ventaja:** Una sola query `collection('tournaments/world_cup_2026/teams')` carga los 48 equipos.

### 3.2. `tournaments/{tournamentId}/players/{playerApiId}`

```typescript
interface Player {
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

**Ventaja:** Sin duplicados. La subcolección `Players` dentro de Teams desaparece.

### 3.3. `users/{uid}/profile`

```typescript
interface UserProfile {
  uid: string;
  email: string;
  tokens: number;
  paidFeatures: string[];   // ['bracket', 'campeon', 'goleador'] — funcionalidades ya pagadas
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;  // soft-delete
}
```

**Ventaja:** Una sola lectura de `profile` obtiene tokens + qué ya pagó. Sin necesidad de consultar 3 documentos para saber si ya pagó.

**Collection Group Query para Admin:** Para ver todas las predicciones de todos los usuarios, se usa `collectionGroup(db, 'predictions')`. Requiere un índice compuesto en `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "predictions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "matchDetails", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### 3.4. `users/{uid}/tournaments/{t}/predictions/{matchId}`

```typescript
interface Prediction {
  matchId: string;         // ID del partido (ej. "wc-05")
  matchDetails: string;    // "Colombia vs Uzbekistán"
  homeScore: number;
  awayScore: number;
  tokenCost: number;
  lockedAt: Timestamp;
  result: 'GANADA' | 'PERDIDA' | null;
  finalScore: string | null;
  createdAt: Timestamp;
  deletedAt: Timestamp | null;
}
```

**Ventaja:** Las predicciones viven bajo el usuario. Borrar un usuario = borrar sus predicciones en cascada. No más colección global `predictions`.

### 3.5. `users/{uid}/tournaments/{t}/bracket`

```typescript
interface Bracket {
  matches: BracketMatch[32];
  score: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}
```

**Ventaja:** Separado de campeón y goleador. Si el usuario solo quiere predecir el campeón, no se crea un documento de bracket de 32 matches.

### 3.6. `users/{uid}/tournaments/{t}/campeon`

```typescript
interface CampeonPick {
  teamApiId: number;
  teamName: string;
  teamCode: string;
  teamLogo: string;
  result: 'GANADA' | 'PERDIDA' | null;
  createdAt: Timestamp;
  deletedAt: Timestamp | null;
}
```

### 3.7. `users/{uid}/tournaments/{t}/goleador`

```typescript
interface GoleadorPick {
  playerApiId: number;
  playerName: string;
  playerPhoto: string;
  teamName: string;
  result: 'GANADA' | 'PERDIDA' | null;
  createdAt: Timestamp;
  deletedAt: Timestamp | null;
}
```

### 3.8. `users/{uid}/deleted/`

Papelera de reciclaje. Documentos movidos aquí en lugar de borrados:

```typescript
interface DeletedDocument {
  originalPath: string;     // "tournaments/world_cup_2026/predictions/wc-05"
  data: any;                // Snapshot completo del documento original
  deletedAt: Timestamp;
  deletedBy: string;        // UID del admin que lo borró
}
```

**Ventaja:** Recuperable. Un bot puede limpiar documentos con `deletedAt > 30 días`.

---

## 4. Plan de Migración

### 4.1. Fase 1: Nuevas colecciones (sin borrar nada)

1. Crear `tournaments/world_cup_2026/teams/` con los 48 equipos (flat)
2. Crear `tournaments/world_cup_2026/players/` con los 1616 jugadores (flat)
3. Crear `tournaments/world_cup_2026/system/` copiando los 6 documentos de `system/`
4. Las colecciones antiguas (`Teams/`, `flat_players`, `system/`) se mantienen como respaldo

**⚠️ Reglas durante la migración:** El nuevo `firestore.rules` DEBE incluir tanto las reglas antiguas como las nuevas. Si se despliegan solo las reglas nuevas, las colecciones antiguas quedan sin acceso (Firestore default = deny) y la app se rompe. Las reglas antiguas se eliminan en Fase 4 tras verificar que todo funciona.

### 4.2. Fase 2: Migrar lógica de frontend

1. Actualizar `src/services/firestore.ts` para leer de las nuevas rutas
2. Actualizar `src/types/firestore.ts` con las nuevas interfaces
3. `npm run build` para verificar
4. Deploy a preview y probar

### 4.3. Fase 3: Actualizar frontend

1. Refactorizar todos los componentes para usar las nuevas rutas parametrizadas por torneo
2. `users/{uid}` → `users/{uid}/profile` para tokens y paidFeatures
3. `getTeamsByGroup()` → `getTournamentTeams(tournamentId)` (1 query flat)
4. `getTeamPlayers()` → `getTournamentPlayers(tournamentId, teamApiId)` (query con where)
5. Predicciones, bracket, campeón, goleador desde `users/{uid}/tournaments/{t}/`
6. Admin usa `collectionGroup('predictions')` para ver todas las predicciones

### 4.4. Fase 4: Limpieza de colecciones antiguas

1. Verificar que el frontend funciona correctamente con las nuevas rutas en preview
2. Ejecutar formateo de fábrica desde Admin → borra datos de prueba
3. Eliminar colecciones antiguas desde consola Firebase: `predictions`, `brackets`, `flat_players`, `Teams`
4. Verificar que solo quedan las nuevas colecciones bajo `tournaments/` y `users/`

---

## 5. Reglas de Firestore (Nuevas)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() && request.auth.token.email in [
        'afemos027@gmail.com',
        'afemos023@gmail.com',
        'daar.523@gmail.com'
      ];
    }

    // Torneos: lectura pública autenticada
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

    // Usuarios: cada uno gestiona lo suyo
    match /users/{uid} {
      allow read: if isAuthenticated() && (request.auth.uid == uid || isAdmin());

      match /profile {
        allow read, update: if request.auth.uid == uid || isAdmin();
        allow create: if request.auth.uid == uid;
        allow delete: if isAdmin();
      }

      match /tournaments/{tournamentId} {

        // Predicciones: subcolección de partidos
        match /predictions/{matchId} {
          allow read: if request.auth.uid == uid || isAdmin();
          allow create, update: if request.auth.uid == uid;
          allow delete: if isAdmin();
        }

        // Bracket, campeón, goleador: documentos individuales
        match /{docType=bracket,campeon,goleador} {
          allow read: if request.auth.uid == uid || isAdmin();
          allow create, update: if request.auth.uid == uid;
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

**Ventajas de las nuevas reglas:**
- El namespace `tournaments/{t}` encapsula todo por torneo
- Los usuarios solo acceden a sus propios datos bajo `users/{uid}/tournaments/{t}/`
- El nivel `tournaments/{t}` permite que un mismo usuario participe en World Cup y Champions sin conflicto de nombres
- Los patrones son repetibles para cualquier torneo nuevo
- Menos reglas totales (las actuales tienen 129 líneas para un solo torneo)

---

## 6. Scripts de Bot Actualizados

### 6.1. `fetch_matches.py`

Cambios necesarios:
- Leer/escribir en `tournaments/world_cup_2026/system/` en vez de `system/`
- Leer/escribir `tournaments/champions_league_2025/system/` para Champions

### 6.2. `auditor.py`

**⚠️ Cambio significativo:** Actualmente el auditor lee todas las predicciones con una sola query plana (`db.collection("predictions").get()`). Con la nueva estructura, las predicciones están bajo `users/{uid}/tournaments/{t}/predictions/`, dispersas entre todos los usuarios. Dos opciones:

**Opción A (Recomendada):** Usar `collectionGroup('predictions')` con Admin SDK:
```python
# Itera todas las predicciones de todos los usuarios y torneos
predictions = db.collection_group('predictions').stream()
```
Requiere crear un índice de collection group en `firestore.indexes.json`. Misma complejidad que antes (~1 query).

**Opción B:** Mantener una colección plana duplicada que el frontend sincroniza al guardar. Más complejo, no recomendado.

Cambios necesarios:
- Leer predicciones vía `collection_group('predictions')`
- Escribir resultados en la misma ubicación (el documento ya tiene referencia completa)
- Si el torneo está parametrizado, el mismo script sirve para Champions

### 6.3. `fetch_results.py`

Cambios necesarios:
- Escribir en `tournaments/{t}/system/recent_results`

### 6.4. `contabilidad.py`

Cambios necesarios:
- Leer predicciones de las nuevas rutas

---

## 7. Impacto en el Frontend

### 7.1. Cambios en `src/services/firestore.ts`

| Función actual | Nueva implementación |
|---------------|---------------------|
| `getTeamsByGroup(group)` | `getTournamentTeams(tournamentId)` — una sola query flat |
| `getTeamPlayers(docId, group)` | `getTournamentPlayers(tournamentId, teamApiId)` — query con where |
| `getUserBracket(uid)` | `getUserBracket(uid, tournamentId)` — ruta parametrizada |
| `saveUserBracket(uid, data)` | `saveUserPick(uid, tournamentId, type, data)` — genérico para bracket/campeon/goleador |
| `searchPlayers(term)` | `searchPlayers(tournamentId, term)` — filtrar por torneo |
| `getUserBetsQuery(email)` | `getUserPredictions(uid, tournamentId)` — desde la subcolección del usuario |

### 7.2. Componentes afectados

- **`AuthContext.tsx`** — crear usuario en `users/{uid}/profile` (antes: `users/{uid}`)
- **`Sidebar.tsx`** — leer tokens de `users/{uid}/profile` (antes: `users/{uid}`)
- **`Admin.tsx`** — leer/escribir tokens en `users/{uid}/profile`; usar `collectionGroup('predictions')` para auditoría
- **`PollaMundialista.tsx`** — predicciones desde `users/{uid}/tournaments/{t}/predictions/`
- **`MisApuestas.tsx`** — misma actualización de ruta
- **`MiCampeon.tsx`** — lee/escribe en `users/{uid}/tournaments/{t}/campeon`
- **`MiGoleador.tsx`** — lee/escribe en `users/{uid}/tournaments/{t}/goleador`
- **`Mis16.tsx`** — bracket desde `users/{uid}/tournaments/{t}/bracket`

**⚠️ Atención:** El cambio de `users/{uid}` a `users/{uid}/profile` afecta TODAS las lecturas y escrituras de datos de usuario. Es el cambio más transversal de esta migración.

### 7.3. Ventajas para el frontend

- **Menos queries:** 12 → 1 para cargar todos los equipos
- **Preparado para Champions:** Solo cambiar `tournamentId`
- **Mejor organización:** Los datos del usuario están bajo su UID
- **Restauración:** El admin puede ver y restaurar desde `deleted/`

---

## 8. To-Do List

### Fase 1: Nuevas colecciones (sin borrar nada existente)
- [ ] 1. Modificar `populate_teams.py` para escribir también en `tournaments/world_cup_2026/teams/` y `tournaments/world_cup_2026/players/`
- [ ] 2. Ejecutar el script para crear las nuevas colecciones
- [ ] 3. Copiar documentos de `system/` a `tournaments/world_cup_2026/system/`
- [ ] 4. Actualizar `firestore.rules` con la nueva estructura
- [ ] 5. Desplegar reglas

### Fase 2: Actualizar servicios y tipos
- [ ] 6. Refactorizar `src/types/firestore.ts` con las nuevas interfaces
- [ ] 7. Refactorizar `src/services/firestore.ts` con rutas parametrizadas por torneo
- [ ] 8. `npm run build` — verificar compilación

### Fase 3: Actualizar frontend
- [ ] 9. Actualizar `PollaMundialista.tsx` a nuevas rutas
- [ ] 10. Actualizar `MisApuestas.tsx` a nuevas rutas
- [ ] 11. Actualizar `MiCampeon.tsx` a nuevas rutas
- [ ] 12. Actualizar `MiGoleador.tsx` a nuevas rutas
- [ ] 13. Actualizar `Mis16.tsx` a nuevas rutas
- [ ] 14. Actualizar `Admin.tsx` para leer de nuevas rutas + `collectionGroup('predictions')`
- [ ] 15. Actualizar `Sidebar.tsx` para leer tokens de `users/{uid}/profile`

### Fase 4: Limpieza de colecciones antiguas
- [ ] 16. Verificar que todo funciona en preview con las nuevas rutas
- [ ] 17. Ejecutar formateo de fábrica para limpiar datos de prueba
- [ ] 18. Eliminar colecciones antiguas desde consola Firebase (`predictions`, `brackets`, `flat_players`, `Teams`)

### Fase 5: Bots
- [ ] 19. Actualizar `fetch_matches.py` para `tournaments/{t}/system/`
- [ ] 20. Actualizar `auditor.py` para `users/{uid}/tournaments/{t}/predictions/`
- [ ] 21. Actualizar `fetch_results.py` para `tournaments/{t}/system/recent_results`
- [ ] 22. Actualizar `contabilidad.py` para nuevas rutas

### Fase 6: Soft-delete (30 días de retención)
- [ ] 23. Implementar `deletedAt` en todas las operaciones de escritura (nunca usar `deleteDoc`)
- [ ] 24. Actualizar formateo de fábrica para marcar `deletedAt` en vez de eliminar físicamente
- [ ] 25. Crear bot de limpieza semanal: elimina documentos con `deletedAt > 30 días`

### Fase 7: Verificación
- [ ] 26. `npm run build`
- [ ] 27. Deploy a preview y probar todas las funcionalidades
- [ ] 28. Merge a main cuando esté estable
