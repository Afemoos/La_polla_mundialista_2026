# Data-base — Fase 3 (Parte 3): Admin + Fases 4 y 5

**Depende de:** `02-authcontext.md` y `03-paginas.md` completados.  
**Objetivo:** Migrar Admin.tsx, limpiar colecciones antiguas y actualizar los bots de Python.

---

## Parte A: Admin.tsx

Archivo: `src/pages/Admin.tsx`

### Cambios requeridos

**1. Lectura de usuarios:**

Actualmente usa `onSnapshot(collection(db, 'users'), ...)` que lee documentos planos `users/{uid}`.

Cambiar a leer de las subcolecciones `profile`:
```typescript
// AI-NOTE: collectionGroup('profile') lee todos los profiles de todos los usuarios
const unsubUsers = onSnapshot(
  query(collectionGroup(db, 'profile')),
  (snap) => {
    const usersList: AppUser[] = [];
    snap.forEach((d) => {
      const data = d.data();
      usersList.push({ uid: data.uid, email: data.email, tokens: data.tokens } as AppUser);
    });
    setUsers(usersList);
  }
);
```

**2. Agregar/Quitar tokens:**

Cambiar `updateDoc(doc(db, 'users', uid), { tokens: increment(amount) })`  
por `updateDoc(doc(db, 'users', uid, 'profile', 'data'), { tokens: increment(amount) })`.

**3. Vista de predicciones (auditoría):**

Actualmente filtra `allBets` por email y muestra predicciones del usuario en una tabla.

Cambiar a leer directamente de la subcolección del usuario. El Admin tiene `selectedUserEmail` (email) pero necesita el `selectedUserId` (UID) para la nueva ruta. Buscar el UID en la lista de usuarios:

```typescript
// En lugar de filtrar allBets por email
const selectedUser = users.find(u => u.email === selectedUserEmail);
if (!selectedUser) return;
const selectedUserId = selectedUser.uid;
const q = collection(db, `users/${selectedUserId}/tournaments/world_cup_2026/predictions`);
const snap = await getDocs(q);
// Mapear los documentos al formato que espera la tabla existente (Prediction[])
```

**4. Formateo de fábrica:**

Actualizar para usar las nuevas rutas:
- Eliminar predicciones de `users/{uid}/tournaments/*/predictions/` (collectionGroup delete)
- Eliminar brackets/campeón/goleador de `users/{uid}/tournaments/*/`
- Resetear tokens en `users/{uid}/profile/data`
- Eliminar duplicados en `users/{uid}/profile/data`

**5. Importar `collectionGroup`:**
```typescript
import { collectionGroup } from 'firebase/firestore';
```

---

## Parte C: Fase 4 — Limpieza de colecciones antiguas (ejecutar DESPUÉS de los bots)

### Paso 1: Verificar en preview

Asegurarse de que TODAS las funcionalidades funcionan con las nuevas rutas antes de borrar nada.

### Paso 2: Ejecutar formateo de fábrica

Desde Admin → Formateo de Fábrica. Esto limpia los datos de prueba en las NUEVAS rutas.

### Paso 3: Eliminar colecciones antiguas

Desde la consola de Firebase (https://console.firebase.google.com/):
1. Ir a Firestore Database
2. Eliminar la colección `predictions`
3. Eliminar la colección `brackets`
4. Eliminar la colección `flat_players`
5. Eliminar la colección `Teams`
6. Eliminar los 6 documentos sueltos de `system/` (radar_match, colombia_match, recent_results, api_status, worldcup_path, round_of_32_matches)

O usar script Python:
```python
def delete_collection(coll_ref, batch_size=500):
    docs = coll_ref.limit(batch_size).stream()
    deleted = 0
    for doc in docs:
        doc.reference.delete()
        deleted += 1
    if deleted >= batch_size:
        return delete_collection(coll_ref, batch_size)
```

### Paso 4: Simplificar firestore.rules

Eliminar las reglas antiguas del archivo `firestore.rules`. Solo deben quedar las reglas nuevas de `tournaments/`, `users/{uid}/profile/{profileDoc}`, y `users/{uid}/tournaments/`. Desplegar:

```bash
npx firebase deploy --only firestore:rules
```

---

## Parte B: Fase 5 — Bots (ejecutar ANTES de la limpieza)

Los bots deben migrarse primero para que sigan escribiendo en las rutas que el frontend ya lee. Si se limpian las colecciones viejas antes de migrar los bots, los radares y resultados desaparecerán.

### fetch_matches.py

Cambiar todas las referencias de `system/` por `tournaments/world_cup_2026/system/`:

```python
# Antes
db.collection("system").document("radar_match").set(...)
# Después
db.collection("tournaments/world_cup_2026/system").document("radar_match").set(...)
```

Afecta a: `radar_match`, `colombia_match`, `worldcup_path`, `api_status`.

### auditor.py

Cambio principal: usar `collection_group` en vez de `db.collection("predictions")`:

```python
# Antes
docs = db.collection("predictions").stream()

# Después
docs = db.collection_group("predictions").stream()
# Filtrar solo las que no tienen result
```

El resto de la lógica es igual: itera predicciones, consulta API-Football, asigna GANADA/PERDIDA.

### fetch_results.py

Cambiar la ruta de guardado:
```python
# Antes
db.collection("system").document("recent_results").set(...)
# Después
db.collection("tournaments/world_cup_2026/system").document("recent_results").set(...)
```

### contabilidad.py

Cambiar para usar `collection_group`:
```python
# Antes
predictions_ref = db.collection("predictions")
docs = predictions_ref.stream()

# Después
docs = db.collection_group("predictions").stream()
```

---

## To-Do List

### Admin
- [x] 1. Migrar lectura de usuarios a `collectionGroup('profile')`
- [x] 2. Migrar add/remove tokens a `users/{uid}/profile/data`
- [x] 3. Migrar vista de predicciones (leer de `users/{selectedUserId}/tournaments/.../predictions/`)
- [x] 4. Actualizar formateo de fábrica para nuevas rutas
- [x] 5. `npm run build`

### Bots (ejecutar ANTES de limpieza)
- [x] 6. Actualizar `fetch_matches.py`
- [x] 7. Actualizar `auditor.py` con `collection_group`
- [x] 8. Actualizar `fetch_results.py`
- [x] 9. Actualizar `contabilidad.py` con `collection_group`

### Limpieza (ejecutar DESPUÉS de bots)
- [x] 10. Verificar todo en preview
- [x] 11. Ejecutar formateo de fábrica
- [x] 12. Eliminar colecciones antiguas + docs sueltos de system/
- [x] 13. Simplificar `firestore.rules` (solo reglas nuevas) y desplegar
