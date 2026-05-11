# Data-base — Fase 3 (Parte 2): Componentes de Predicción

**Depende de:** `02-authcontext.md` completado.  
**Objetivo:** Migrar los 5 componentes de predicción a las nuevas rutas de Firestore. Cada componente se actualiza de forma independiente.

---

## Tarea 1: PollaMundialista.tsx (Mi Polla)

Archivo: `src/pages/PollaMundialista.tsx`

### Cambios requeridos

**1. Lectura de predicciones del usuario:**

Actualmente usa:
```typescript
const q = query(collection(db, 'predictions'), where('email', '==', currentUser.email), where('type', '==', 'POLla_MUNDIALISTA'));
```

Cambiar a:
```typescript
// Usar onSnapshot en la subcolección del usuario
const q = collection(db, `users/${currentUser.uid}/tournaments/world_cup_2026/predictions`);
```

**2. Guardado de predicción:**

Actualmente usa:
```typescript
const predictionDocRef = doc(db, 'predictions', `${currentUser!.uid}_${match.id}`);
await setDoc(predictionDocRef, { email, type, fixtureId, matchDetails, prediction, ... });
```

Cambiar a:
```typescript
const predictionDocRef = doc(db, `users/${currentUser!.uid}/tournaments/world_cup_2026/predictions`, match.id);
await setDoc(predictionDocRef, {
  matchId: match.id,
  matchDetails: `${match.homeTeam} vs ${match.awayTeam}`,
  homeScore: Number(homeScore),
  awayScore: Number(awayScore),
  tokenCost: match.tokenCost,
  lockedAt: serverTimestamp(),
  createdAt: serverTimestamp(),
});
```

**3. Descuento de tokens:**

Actualmente: `updateDoc(doc(db, 'users', currentUser!.uid), { tokens: increment(-match.tokenCost) })`

Cambiar a: `updateDoc(doc(db, 'users', currentUser!.uid, 'profile', 'data'), { tokens: increment(-match.tokenCost) })`

**4. Modificación de predicción:**

Actualmente: `updateDoc(doc(db, 'predictions', userPrediction.docId), { prediction, lockedAt })`

Cambiar a: `updateDoc(doc(db, `users/${currentUser!.uid}/tournaments/world_cup_2026/predictions`, match.id), { homeScore, awayScore, lockedAt: serverTimestamp() })`

**5. Lectura de sistema:**

Actualmente lee de `system/worldcup_path`. Cambiar a `tournaments/world_cup_2026/system/worldcup_path`:
```typescript
const unsubMatches = onSnapshot(doc(db, 'tournaments/world_cup_2026/system', 'worldcup_path'), (snap) => { ... });
```

---

## Tarea 2: MisApuestas.tsx

Archivo: `src/pages/MisApuestas.tsx`

### Cambios requeridos

**1. Lectura de predicciones:**

Actualmente usa `getUserBetsQuery(email)` que consulta `predictions` por email.

Cambiar a `onSnapshot` en la subcolección:
```typescript
useEffect(() => {
    if (!currentUser?.uid) return;
    const q = collection(db, `users/${currentUser.uid}/tournaments/world_cup_2026/predictions`);
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const betsArray: Prediction[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            betsArray.push({
                id: doc.id,
                type: 'POLla_MUNDIALISTA',
                matchDetails: data.matchDetails,
                prediction: `${data.homeScore} - ${data.awayScore}`,
                result: data.result,
                finalScore: data.finalScore,
                timestamp: data.createdAt,
                tokenCost: data.tokenCost,
            } as Prediction);
        });
        betsArray.sort((a, b) => {
            const timeA = a.timestamp ? a.timestamp.toMillis() : 0;
            const timeB = b.timestamp ? b.timestamp.toMillis() : 0;
            return timeB - timeA;
        });
        setBets(betsArray);
    });
    return () => unsubscribe();
}, [currentUser]);
```

---

## Tarea 3: MiCampeon.tsx

Archivo: `src/pages/MiCampeon.tsx`

### Cambios requeridos

**1. Lectura de predicción de campeón:**

Actualmente usa `getUserBracket(uid)` y lee `b.campeon`.

Cambiar a:
```typescript
const pick = await getCampeonPick(currentUser.uid, 'world_cup_2026');
```

**2. Lectura de equipos:**

Actualmente usa `getAllTeams()` (caché de `getTeamsByGroup`).

Cambiar a `getTournamentTeams('world_cup_2026')` — una sola query flat, sin caché necesario.

**3. Guardado:**

Actualmente usa `saveUserBracket(uid, { campeon: {...} }, { field: 'campeon', amount: 10 })`.

Cambiar a:
```typescript
const alreadyPaid = profile?.paidFeatures?.includes('campeon');
await saveUserPick(currentUser.uid, 'world_cup_2026', 'campeon', {
  teamApiId: selectedTeam.apiId,
  teamName: selectedTeam.name,
  teamCode: selectedTeam.code,
  teamLogo: selectedTeam.logo,
}, alreadyPaid ? undefined : { amount: 10 });
if (!alreadyPaid) {
  await updateDoc(doc(db, 'users', currentUser.uid, 'profile', 'data'), {
    paidFeatures: arrayUnion('campeon')
  });
}
```

**4. Actualizar imports:** Quitar `getUserBracket, saveUserBracket, getAllTeams`. Agregar `getCampeonPick, saveUserPick, getTournamentTeams, getUserProfile`. Importar `arrayUnion` de firebase/firestore. El `profile` se obtiene con `getUserProfile(uid)` para leer `paidFeatures`.

---

## Tarea 4: MiGoleador.tsx

Archivo: `src/pages/MiGoleador.tsx`

### Cambios requeridos

**1. Lectura de predicción de goleador:**

Actualmente usa `getUserBracket(uid)`.

Cambiar a `getGoleadorPick(currentUser.uid, 'world_cup_2026')`.

**2. Lectura de equipos (dropdown de grupo):**

Actualmente usa `getTeamsByGroup(group)` de las rutas antiguas.

Cambiar a `getTournamentTeams('world_cup_2026')` con filtro por grupo en cliente:
```typescript
const allTeams = await getTournamentTeams('world_cup_2026');
const groupTeams = allTeams.filter(t => t.group === selectedGroup);
```

**3. Lectura de jugadores (dropdown de equipo):**

Actualmente usa `getTeamPlayers(docId, group)` de las rutas antiguas.

Cambiar a `getTournamentPlayers('world_cup_2026', teamApiId)`.

**4. Guardado:**

Mismo patrón que MiCampeon pero con `type: 'goleador'`:
```typescript
await saveUserPick(uid, 'world_cup_2026', 'goleador', {
  playerApiId, playerName, playerPhoto, teamName
}, alreadyPaid ? undefined : { amount: 10 });
```

**5. Actualizar imports.** Quitar `getUserBracket, saveUserBracket, getTeamsByGroup, getTeamPlayers`. Agregar `getGoleadorPick, saveUserPick, getTournamentTeams, getTournamentPlayers, getUserProfile`. Importar `arrayUnion`.

---

## Tarea 5: Mis16.tsx

Archivo: `src/pages/Mis16.tsx`

El archivo actual en main (49 líneas) solo verifica `system/round_of_32_matches` y muestra "Fase de Grupos" o un placeholder. NO tiene lógica de bracket completa.

### Cambios requeridos

**1. Lectura de partidos del sistema:**

Actualmente lee de `system/round_of_32_matches`:
```typescript
getDoc(doc(db, 'system', 'round_of_32_matches'))
```

Cambiar a `tournaments/world_cup_2026/system/round_of_32_matches`:
```typescript
getDoc(doc(db, 'tournaments/world_cup_2026/system', 'round_of_32_matches'))
```

**2. No se requiere cambiar nada más.** La lógica de bracket completo y `getUserBracketV2` se implementará cuando Mis16 tenga el bracket interactivo (fase futura).

---

## Tarea 6: Actualizar Sidebar (lectura de tokens)

Archivo: `src/components/Sidebar.tsx`

El Sidebar debe leer tokens de `users/{uid}/profile/data` (nueva ruta).

```typescript
useEffect(() => {
    if (!authCounter?.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', authCounter.currentUser.uid, 'profile', 'data'), (snap) => {
        if (snap.exists()) {
            setTokens(snap.data().tokens || 0);
        }
    });
    return () => unsub();
}, [authCounter?.currentUser]);
```

---

## Tarea 7: Actualizar Home.tsx

Archivo: `src/pages/Home.tsx`

Cambiar las referencias de `system/` a `tournaments/world_cup_2026/system/`:

```typescript
// Radar global: doc(db, "system", "radar_match") →
const unsubGlobal = onSnapshot(doc(db, "tournaments/world_cup_2026/system", "radar_match"), ...)

// Radar Colombia: doc(db, "system", "colombia_match") →
const unsubColombia = onSnapshot(doc(db, "tournaments/world_cup_2026/system", "colombia_match"), ...)
```

---

## Verificación

```bash
npm run build
```

Probar en `npm run dev`:
- Mi Polla: crear predicción, verificar que se guarda en la nueva ruta
- Mis Apuestas: ver historial
- Mi Campeón: seleccionar equipo, verificar guardado
- Mi Goleador: seleccionar jugador, verificar guardado
- Mis 16: verificar que detecta `round_of_32_matches` en la nueva ruta

---

## To-Do List

- [ ] 1. Actualizar `PollaMundialista.tsx` (5 cambios: lectura, guardado, descuento, modificación, sistema)
- [ ] 2. Actualizar `MisApuestas.tsx` (lectura de predicciones desde nueva ruta)
- [ ] 3. Actualizar `MiCampeon.tsx` (lectura, equipos, guardado con paidFeatures)
- [ ] 4. Actualizar `MiGoleador.tsx` (lectura, equipos planos, jugadores planos, guardado)
- [ ] 5. Actualizar `Mis16.tsx` (solo cambiar path de sistema)
- [ ] 6. Actualizar `Sidebar.tsx` — leer tokens de `users/{uid}/profile/data`
- [ ] 7. Actualizar `Home.tsx` — cambiar paths de `system/radar_match` y `system/colombia_match`
- [ ] 8. `npm run build` — sin errores
- [ ] 9. Probar todas las funcionalidades en `npm run dev`
