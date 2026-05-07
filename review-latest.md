# Revisión Técnica: Fase 6 (Eliminación de Estados de Pago y Corrección de Duplicados)

## 1. Resumen de la Intervención
Esta fase elimina por completo el concepto de "Estado de Pago" (PENDIENTE/PAGADO/CANCELADA) de todo el sistema, bajo la premisa de que todas las predicciones son prepagadas mediante tokens. Al mismo tiempo, resuelve un bug de duplicados cambiando el ID de los documentos en Firestore de aleatorio a compuesto (`uid_matchId`).

**Agente ejecutor:** DeepSeek v4 Pro

## 2. Análisis del Código Implementado

### 2.1 Base de Datos y Reglas (`firestore.rules`, `src/types/firestore.ts`)
- **Eliminación quirúrgica del `status`:** La interfaz `Prediction` perdió el campo `status`. La regla de creación en Firestore ya no exige `status == 'PENDIENTE'`, solo valida email, type y prediction. Las reglas de update y delete ahora se protegen exclusivamente mediante el campo `result` (si tiene valor GANADA/PERDIDA, no se puede modificar ni eliminar). Esto es correcto y seguro.
- **Prevención de duplicados:** El cambio de `addDoc` a `setDoc(doc(db, 'predictions', \`${uid}_${matchId}\`))` hace matemáticamente imposible que existan dos predicciones del mismo usuario para el mismo partido. El método `getPredictionForMatch` sigue funcionando sin cambios porque el campo `fixtureId` se mantiene en el documento.

### 2.2 Frontend (`PollaMundialista.tsx`, `MisApuestas.tsx`, `Admin.tsx`)
- **`PollaMundialista.tsx`:** Cambio mínimo y limpio. Solo se reemplazó `addDoc(collection(...))` por `setDoc(doc(...))` con el ID compuesto. El campo `status: 'PENDIENTE'` se eliminó del payload. Todo lo demás intacto.
- **`MisApuestas.tsx`:** Se eliminó la columna "Pago", los badges de estado, el manejo especial de CANCELADA, y los botones de cancelación. El botón "Eliminar" ahora se muestra para cualquier predicción sin `result`, sin depender del status. Simplificación neta de 61 líneas.
- **`Admin.tsx`:** Fuera el "Panel de Control de Ingresos" (toggle de PENDIENTE/PAGADO y cancelaciones). Se reemplazó por "Historial de Recargas de Tokens", que muestra balance y conteo de predicciones por usuario. La sección inicia colapsada, como se pidió. El subtítulo se actualizó de "Gestiona pagos, tokens y cancelaciones" a "Gestiona tokens y auditoría de apuestas".

### 2.3 Backend Python (`contabilidad.py`, `limpieza.py`)
- **`contabilidad.py`:** Se eliminó `total_pendiente`, `bolsa_ganadores`, y toda la lógica condicional de status. El cálculo del valor total ahora es `len(all_bets) * VALOR_APUESTA` (todas las apuestas cuentan como pagadas). La columna "Estado de Pago" se eliminó de la hoja Auditoria. En su lugar se exportan "Fecha Creación" y "Fecha Bloqueo".
- **`limpieza.py`:** Script nuevo para borrar documentos legacy con `status == 'CANCELADA'` o `'PENDIENTE'`. Usa batches de 450 (debajo del límite de 500 de Firestore). Tiene modo local (archivo JSON) y nube (variable de entorno GCP_CREDENTIALS).

## 3. Hallazgos y Observaciones

### Observación menor — `Admin.tsx` Historial de Recargas
La columna "Usuario" muestra "👤 Usuario" como texto fijo en cada fila, con el email en la columna adyacente. Sería más útil mostrar el email completo o la parte local (antes del @) directamente en la columna Usuario. No es un bug, sino una mejora estética pendiente.

### Verificación de build
`npm run build` pasa limpio. No hay imports huérfanos ni variables sin usar.

## 4. Conclusión
La implementación es **robusta y completa**. La eliminación del campo `status` fue coherente en todas las capas: TypeScript, Firestore rules, frontend, backend Python y Google Sheets. El cambio a ID compuesto es la solución correcta para prevenir duplicados, y la simplificación del panel de administración reduce el riesgo de error humano.

Código listo para producción. Requiere dos pasos manuales post-merge:
1. Ejecutar `python legacy_python/limpieza.py` para limpiar documentos legacy
2. Ejecutar `npx firebase deploy --only firestore:rules` para aplicar las nuevas reglas

### 🚨 Hallazgos Críticos Adicionales (Revisión de Antigravity)
**BUG SEVERO: Botón Eliminar permite perder tokens.**
El agente anterior dejó activo el botón "Eliminar" en `MisApuestas.tsx` para todas las apuestas que no tienen `result`. Sin embargo, la función `handleDelete` simplemente llama a `deleteUserBet(id)` y borra el documento de Firestore **SIN reembolsar los tokens al usuario**. 

Además, el plan de implementación dictaba explícitamente: *"Las apuestas son definitivas al crearse, pero pueden modificarse dentro del plazo de 48 horas"*. 

Por lo tanto, la permanencia del botón "Eliminar" no solo viola la regla de negocio (las apuestas son definitivas), sino que introduce un agujero crítico donde los usuarios pueden borrar su apuesta accidentalmente y perder su saldo irreversiblemente. **Es obligatorio remover el botón "Eliminar" y la función `handleDelete` por completo de `MisApuestas.tsx` y `src/services/firestore.ts` antes de hacer commit.**

### ✅ Corrección Aplicada (DeepSeek v4 Pro)
**Hallazgo aceptado y corregido en las 3 capas:**

1. **`MisApuestas.tsx`:** Se eliminó el botón "Eliminar", la función `handleDelete`, el import de `deleteUserBet`, el icono `Trash2`, y la columna completa "Acciones". Las apuestas ahora son inmóviles desde el frontend del usuario (solo modificables vía PollaMundialista dentro de las 48h).

2. **`firestore.rules`:** La regla `allow delete` se restringió a `isAdmin()` exclusivamente. Ya ningún usuario puede borrar sus predicciones ni siquiera mediante el SDK.

3. **`src/services/firestore.ts`:** Se conserva `deleteUserBet` como utilidad exportada para uso administrativo futuro, pero ya no se importa desde `MisApuestas.tsx`.

`npm run build` pasa limpio tras las correcciones.
