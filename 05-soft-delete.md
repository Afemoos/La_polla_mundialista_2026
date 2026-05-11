# Data-base — Fase 6 y 7: Soft-delete + Verificación Final

**Depende de:** Todos los documentos anteriores completados.  
**Objetivo:** Implementar soft-delete con 30 días de retención y verificar que todo funciona.

---

## Fase 6: Soft-delete (30 días de retención)

### Principio

Nunca usar `deleteDoc()`. En su lugar, escribir `deletedAt: serverTimestamp()` en el documento. Los queries de lectura siempre filtran `where('deletedAt', '==', null)`. Un bot semanal limpia documentos con `deletedAt > 30 días`.

### Tarea 1: Agregar `deletedAt` a todas las escrituras

Los siguientes lugares deben inicializar `deletedAt: null` al crear documentos:

**1. AuthContext.tsx** — al crear `users/{uid}/profile/data`:
```typescript
await setDoc(newProfileRef, {
    uid: user.uid,
    email: user.email,
    tokens: 0,
    paidFeatures: [],
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
});
```

**2. PollaMundialista.tsx** — al crear predicción:
```typescript
await setDoc(predictionDocRef, {
    matchId: match.id,
    // ...otros campos...
    deletedAt: null,
    createdAt: serverTimestamp(),
});
```

**3. saveUserPick (firestore.ts)** — al crear bracket/campeón/goleador:
```typescript
batch.set(ref, {
    ...data,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
}, { merge: true });
```

### Tarea 2: Filtrar documentos eliminados en lecturas

Para queries de colección (`getDocs`), agregar `where('deletedAt', '==', null)`.
Para documentos individuales (`getDoc`), verificar manualmente:

- `getUserPredictions()` — agregar `where('deletedAt', '==', null)` al query
- `getUserBracketV2()` — verificar `if (snap.exists() && !snap.data().deletedAt) return snap.data()`
- `getCampeonPick()` — ídem, check manual en getDoc
- `getGoleadorPick()` — ídem
- Admin: predicciones desde `users/{uid}/.../predictions/` — agregar `where('deletedAt', '==', null)`

### Tarea 3: Actualizar formateo de fábrica

En `Admin.tsx`, la función `handleFactoryReset` debe cambiar de usar `writeBatch.delete()` a `writeBatch.update()`:

```typescript
// Antes (borrado físico)
batch.forEach(id => wb.delete(doc(db, 'predictions', id)));

// Después (soft-delete)
batch.forEach(id => wb.update(doc(db, `users/${uid}/tournaments/${t}/predictions`, id), {
    deletedAt: serverTimestamp()
}));
```

Lo mismo para brackets, campeón, goleador. Los tokens se siguen reseteando a 0 (eso no es un delete, es un update).

### Tarea 4: Crear bot de limpieza semanal

Nuevo archivo: `legacy_python/cleanup_soft_deletes.py`

```python
import os, json, firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta

def main():
    # Inicializar Firebase (mismo patrón que fetch_matches.py)
    # ...
    db = firestore.client()
    cutoff = datetime.now() - timedelta(days=30)
    
    # Buscar predicciones con deletedAt > 30 días
    predictions = db.collection_group('predictions').stream()
    for doc in predictions:
        data = doc.to_dict()
        if data.get('deletedAt') and data['deletedAt'].datetime < cutoff:
            doc.reference.delete()
            print(f"Eliminado físicamente: {doc.reference.path}")
```

Nuevo workflow: `.github/workflows/cleanup_soft_deletes.yml` (semanal, cada domingo):
```yaml
name: Cleanup Soft Deletes
on:
  schedule:
    - cron: '0 0 * * 0'  # Domingos a medianoche
  workflow_dispatch:
jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      - run: pip install firebase-admin
      - env:
          GCP_CREDENTIALS: ${{ secrets.GCP_CREDENTIALS }}
        run: python legacy_python/cleanup_soft_deletes.py
```

---

## Fase 7: Verificación Final

### Tarea 1: Build completo

```bash
npm run build
```

Debe compilar sin errores ni warnings.

### Tarea 2: Deploy a preview

```bash
git add -A
git commit -m "feat: database restructure complete"
git push origin <branch>
```

Verificar en Vercel preview:
- Login/logout
- Sidebar con tokens
- Mi Polla: crear predicción
- Mis Apuestas: ver historial
- Mi Campeón: seleccionar equipo
- Mi Goleador: seleccionar jugador
- Mis 16: mensaje "Fase de Grupos"
- Admin: gestión de tokens, formateo de fábrica

### Tarea 3: Merge a main

Solo cuando TODO funcione en preview.

---

## To-Do List

- [x] 1. Agregar `deletedAt: null` a AuthContext (creación de perfil)
- [x] 2. Agregar `deletedAt: null` a PollaMundialista (creación de predicción)
- [x] 3. Agregar `deletedAt: null` a saveUserPick (bracket/campeón/goleador)
- [x] 4. Filtrar `where('deletedAt', '==', null)` en todas las lecturas
- [x] 5. Actualizar formateo de fábrica a soft-delete
- [x] 6. Crear `legacy_python/cleanup_soft_deletes.py`
- [x] 7. Crear `.github/workflows/cleanup_soft_deletes.yml`
- [x] 8. `npm run build`
- [ ] 9. Deploy a preview y probar todas las funcionalidades
- [ ] 10. Merge a main
