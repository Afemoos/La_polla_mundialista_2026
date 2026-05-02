# Plan de Implementación: Correcciones UI y Datos de la Polla

## 1. Contexto y Objetivos
Tras la implementación inicial del sistema de tokens y la interfaz de predicciones, se identificaron tres áreas de mejora inmediata que deben abordarse:
1. **Accesibilidad Visual:** El contador de tokens en la barra lateral es ilegible en el tema claro debido al uso de un amarillo *hardcodeado*.
2. **Precisión de Datos:** Los partidos de la fase de grupos de Colombia (Grupo K) ya están definidos y deben reflejarse por defecto en la UI.
3. **Gestión de Administrador:** Los botones de incremento de tokens fallan silenciosamente cuando el campo de entrada está vacío, y la lista de usuarios solo muestra a aquellos que han iniciado sesión recientemente, dejando por fuera a usuarios históricos.

## 2. Soluciones Técnicas

### 2.1 UI del Contador de Tokens (`Sidebar.tsx`)
- **Problema:** El color `#FFD700` con opacidad no hace contraste sobre fondos blancos.
- **Solución:** Refactorizar los estilos en línea del contenedor del contador de tokens. Reemplazar los colores hexadecimales estáticos por variables CSS responsivas (ej. `var(--text-main)` o `var(--primary)`) y asegurar que el fondo se adapte (`var(--glass-bg)`).

### 2.2 Actualización de Partidos y Automatización
- **Problema Backend:** El script de Python `fetch_matches.py` actualmente no está configurado para poblar correctamente la ruta `system/worldcup_path` con los datos de la fase de grupos del Mundial para Colombia.
- **Solución Backend:** Modificar `legacy_python/fetch_matches.py` para que realice una petición a API-Football filtrando por la liga 1 (Mundial), equipo 8 (Colombia), y actualice automáticamente el documento `system/worldcup_path` en Firestore.
- **Problema Frontend (Fallback):** `DUMMY_MATCHES` en `PollaMundialista.tsx` utiliza datos genéricos cuando el bot falla o la API no responde.
- **Solución Frontend:** Actualizar las primeras 3 tarjetas del array constante `DUMMY_MATCHES` con la información oficial como capa de seguridad:
  - **Jornada 1:** Colombia vs Uzbekistán (17/06/2026, 10:00 p.m.)
  - **Jornada 2:** Colombia vs RD Congo (23/06/2026, 10:00 p.m.)
  - **Jornada 3:** Colombia vs Portugal (27/06/2026, 7:30 p.m.)
- *Nota:* Asignar `isDefined: true` a estas tres tarjetas en el fallback.


### 2.3 Panel de Administración (`Admin.tsx`)
- **Botones Silenciosos:** El código actual hace `if (amount <= 0) return;`. Si el administrador no escribe un número y solo presiona `+`, `amount` es 0, y la función no hace nada.
  - **Solución:** Si el input está vacío, asumir un incremento por defecto de `1` (`const finalAmount = amount || 1;`). Añadir un pequeño `alert()` o notificación de éxito/error.
- **Sincronización de Usuarios:** Como Firebase Auth no permite listar todos los correos directamente en el frontend, usaremos los datos históricos.
  - **Solución:** Añadir un botón secundario llamado "Sincronizar Usuarios Antiguos". Este botón ejecutará una función que recorra el estado `allBets` (apuestas históricas), extraiga todos los correos únicos (`email`), y verifique si existen en la colección `users`. Si no existen, creará un documento para ellos con `tokens: 0` (utilizando su propio email validado como identificador o generando uno nuevo) para que aparezcan disponibles en la tabla de recargas.

---

## 3. To-Do List (Checklist de Progreso)
*Agente: Marca con una `[x]` las tareas a medida que las vayas completando.*

### Correcciones UI
- [x] 1. **Sidebar.tsx**: Eliminar el color `#FFD700` *hardcodeado* en el contador de tokens y reemplazarlo por variables CSS que contrasten correctamente tanto en tema claro como oscuro.

### Actualización de Datos y Automatización (Backend/Frontend)
- [x] 2. **fetch_matches.py**: Modificar el bot de Python para que consulte la API-Football (Team 8, League 1) y actualice el array de partidos en el documento `system/worldcup_path` de Firestore.
- [x] 3. **PollaMundialista.tsx**: Modificar la constante `DUMMY_MATCHES` (el fallback de seguridad) para incluir los nombres, fechas (17/6, 23/6, 27/6) y equipos reales del Grupo K (Uzbekistán, RD Congo, Portugal), estableciendo `isDefined: true`.

### Panel Administrativo
- [x] 4. **Admin.tsx (Botones +/-)**: Modificar las funciones `addTokens` y `removeTokens` para que asuman `1` por defecto si el input de cantidad está vacío. Agregar un `alert("Tokens actualizados")`.
- [x] 5. **Admin.tsx (Sincronización)**: Implementar una función `syncMissingUsers` que extraiga emails únicos de `allBets`, compruebe si están en la variable de estado `users`, y si no, ejecute escrituras por lotes (`writeBatch` o `setDoc`) en la colección `users` en Firestore.
- [x] 6. **Admin.tsx (UI)**: Añadir un botón en la cabecera del panel de "Gestión de Tokens" para disparar la función `syncMissingUsers`.
