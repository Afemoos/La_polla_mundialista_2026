# Plan de Implementación: Sistema de Tokens, Eliminación de Estados de Pago y Prevención de Duplicados

## 1. Contexto y Objetivos
- Las predicciones ahora se pagan por adelantado utilizando el saldo de tokens del usuario. Por lo tanto, el concepto de "Estado de Pago" (PENDIENTE, PAGADO, CANCELADA) es obsoleto.
- Se eliminará toda la lógica visual, de backend y de base de datos relacionada con el `status` de la predicción. Toda apuesta en el sistema se considera oficial y "pagada".
- **Objetivo adicional:** Solucionar el bug reportado donde un usuario puede generar múltiples predicciones para un mismo partido (duplicados en Google Sheets). Esto se resolverá cambiando la forma en que se guardan los documentos en Firestore.

## 2. Arquitectura de Base de Datos (Firestore)
- **Colección a modificar:** `predictions`.
- **Eliminación de campos:** El campo `status` dejará de existir en el esquema y en el tipado (`src/types/firestore.ts`).
- **Prevención de Duplicados (Nuevo Enfoque):** Actualmente se usa `addDoc` (que genera un ID aleatorio) para guardar una predicción, lo que puede causar duplicados si falla la conexión o el usuario hace clics rápidos. Se migrará a `setDoc(doc(db, 'predictions', \`${currentUser.uid}_${match.id}\`))`. Al usar un **ID predecible**, es matemáticamente imposible que existan dos predicciones del mismo usuario para el mismo partido.
- **Cambios en `firestore.rules`:** 
  - Eliminar todas las restricciones que exigen o validan transiciones del campo `status`.

## 3. Backend / APIs (`legacy_python`)
- **`contabilidad.py`:**
  - Ignorar o remover la extracción del `estado`.
  - En la pestaña de **Resumen Financiero**, eliminar las métricas de "Dinero Faltante" y los cálculos basados en apuestas "PENDIENTES". Todo en la base de datos se asume pagado.
  - La condición de ganancia pasa de `if bet["resultado"] == "GANADOR" and bet["estado"] == "PAGADO":` a `if bet["resultado"] == "GANADOR":`.
- **Limpieza de Datos (Script Único):** Se creará y ejecutará un pequeño script temporal (ej. `limpieza.py`) que buscará todas las predicciones antiguas en Firestore con `status == 'CANCELADA'` o `status == 'PENDIENTE'` y las borrará para dejar la base de datos limpia.

## 4. Frontend: Interfaces y Componentes (UI/UX)
- **`src/pages/PollaMundialista.tsx`:**
  - Cambiar la lógica de creación de `addDoc(...)` a `setDoc(...)` usando el ID compuesto `uid_matchId`.
- **`src/pages/MisApuestas.tsx`:** 
  - Eliminar las columnas y etiquetas visuales (badges) relacionadas con "PENDIENTE" y "PAGADO".
  - Las apuestas son definitivas al crearse, pero pueden modificarse dentro del plazo de 48 horas. No hay botón de "Solicitar Cancelación".
- **`src/pages/Admin.tsx`:**
  - Eliminar por completo el acordeón/sección de "Aprobación de Pagos y Cancelaciones".
  - **NUEVO:** Añadir una tabla colapsable llamada "Historial de Recargas de Tokens" que permita al administrador revisar cuándo y a quién se le asignaron o descontaron tokens (si existe registro de esto en Firebase, de lo contrario, sentar las bases en la UI).

## 5. To-Do List (Checklist de Progreso)
*Agente: Marca con una `[x]` las tareas a medida que las vayas completando.*

### Fase 1: Limpieza de Base de Datos y Tipos
- [x] 1. Crear y ejecutar un script de Python que borre todos los documentos en `predictions` cuyo `status` sea 'CANCELADA' o 'PENDIENTE'.
- [x] 2. Modificar `firestore.rules` eliminando las restricciones relacionadas con `status`.
- [x] 3. Actualizar `src/types/firestore.ts` eliminando el atributo `status` de la interfaz `Prediction`.
- [x] 4. Limpiar `src/services/firestore.ts` eliminando funciones huérfanas de estado de pago (`togglePaymentStatus`, etc.).

### Fase 2: Corrección Arquitectónica (Duplicados)
- [x] 5. En `PollaMundialista.tsx` (o donde se creen apuestas): Cambiar `addDoc(collection...)` por `setDoc(doc(db, 'predictions', \`${currentUser.uid}_${match.id}\`))`. Ajustar la lógica de comprobación de existencia `hasPrediction` para que encaje con este nuevo formato de ID.

### Fase 3: Refactorización de la UI (Frontend)
- [x] 6. En `MisApuestas.tsx`: Remover la columna "Pago", sus indicadores, y los botones de solicitar cancelación.
- [x] 7. En `Admin.tsx`: Eliminar el panel de control de cobros.
- [x] 8. En `Admin.tsx`: Crear la nueva sección colapsable "Historial de Recargas" (asegurarse de que inicie cerrada).

### Fase 4: Ajustes en Backend (Bots)
- [x] 9. Actualizar `legacy_python/contabilidad.py` para ignorar el `status`, simplificando la evaluación de resultados y eliminando "Dinero Faltante" del resumen de Google Sheets.
