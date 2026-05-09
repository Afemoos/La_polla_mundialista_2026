# Data-base — Fase 3 (Parte 1): AuthContext

**Depende de:** `01-nuevas-colecciones.md` completado.  
**Objetivo:** Migrar `AuthContext.tsx` para crear `users/{uid}/profile` al hacer login. El Sidebar y los componentes de predicción se actualizan en documentos posteriores para mantener consistencia de tokens.

---

## Contexto

Actualmente:
- `AuthContext.tsx` crea/lee `users/{uid}` (línea 40-48)
- `Sidebar.tsx` escucha `users/{uid}` para tokens (línea 21-22)
- `Admin.tsx` lee/escribe `users/{uid}` para gestión de tokens
- `PollaMundialista.tsx` descuenta tokens de `users/{uid}` (línea ~165)

En la nueva estructura:
- El perfil del usuario vive en `users/{uid}/profile`
- Los tokens y `paidFeatures` están en ese documento

**Estrategia:** Durante la migración, el `AuthContext` debe:
1. Al hacer login, verificar si `users/{uid}/profile` existe
2. Si no existe, crearlo copiando los datos de `users/{uid}` (documento antiguo)
3. Si existe, usarlo normalmente

Esto permite que usuarios existentes (con datos en `users/{uid}`) y nuevos usuarios (con datos en `users/{uid}/profile`) funcionen simultáneamente.

---

## Tarea 1: Actualizar `AuthContext.tsx`

### Cambios en `src/contexts/AuthContext.tsx`

Modificar el `useEffect` de `onAuthStateChanged` (líneas 34-53):

```typescript
useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        setCurrentUser(user);
        if(user && user.email) {
            setIsAdmin(ADMIN_EMAILS.includes(user.email));
            
            // AI-NOTE: Migración a nueva estructura. Intentar leer de la nueva ruta primero.
            const newProfileRef = doc(db, 'users', user.uid, 'profile');
            const newProfileSnap = await getDoc(newProfileRef);
            
            if (!newProfileSnap.exists()) {
                // Verificar si existe en la ruta antigua (para migrar)
                const oldUserRef = doc(db, 'users', user.uid);
                const oldUserSnap = await getDoc(oldUserRef);
                
                if (oldUserSnap.exists()) {
                    // Migrar: copiar datos antiguos a la nueva ruta
                    const oldData = oldUserSnap.data();
                    await setDoc(newProfileRef, {
                        uid: user.uid,
                        email: user.email,
                        tokens: oldData.tokens || 0,
                        paidFeatures: [],
                        createdAt: oldData.createdAt || serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    });
                } else {
                    // Usuario completamente nuevo
                    await setDoc(newProfileRef, {
                        uid: user.uid,
                        email: user.email,
                        tokens: 0,
                        paidFeatures: [],
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    });
                }
            }
        } else {
            setIsAdmin(false);
        }
        setLoading(false);
    });
    return unsubscribe;
}, []);
```

**Nuevo import requerido:** `serverTimestamp` de `firebase/firestore`. El archivo actual NO lo importa (solo importa `doc, setDoc, getDoc`). Debe agregarse:
```typescript
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
```

---

## Tarea 2: Verificar

### 2.1 Compilación

```bash
npm run build
```

Debe compilar sin errores. El AuthContext ahora crea `users/{uid}/profile` automáticamente.

### 2.2 Probar manualmente

1. Iniciar `npm run dev`
2. Iniciar sesión con una cuenta existente → revisar en Firestore que se creó `users/{uid}/profile` con los tokens migrados
3. Iniciar sesión con una cuenta nueva → revisar que se creó `users/{uid}/profile` con tokens=0
4. Cerrar sesión y volver a entrar — el perfil ya existe, no se sobrescribe

---

## To-Do List

- [ ] 1. Actualizar `AuthContext.tsx`: migrar creación/lectura de `users/{uid}` a `users/{uid}/profile` con soporte para datos antiguos
- [ ] 2. `npm run build` — sin errores
- [ ] 3. Probar login con cuenta existente y nueva en local
