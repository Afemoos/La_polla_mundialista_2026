# Plan de Implementación: Fase 3 - Polla Mundialista (13 Partidos Oficiales y Gestión Avanzada)

## 1. Contexto y Objetivos
Basado en el QA reciente, se detectaron áreas de mejora en el registro de apuestas (cobro de tokens), la gestión administrativa, y la lista definitiva de partidos. El objetivo de esta fase es:
1. **Cobro correcto de tokens:** Asegurar que el frontend solo deduzca tokens una vez, permitiendo la modificación gratuita dentro de 48h, e introduciendo un botón de "Bloqueo Definitivo" (saltar espera de 48h).
2. **Auditoría de Usuarios (Admin):** Permitir a los administradores ver el historial individual de apuestas de cada jugador, junto con el tiempo restante de su ventana de modificación.
3. **Listado Exacto de Partidos (API-Football):** Abandonar las tarjetas "dummy" y forzar al bot de Python a sincronizar 13 partidos específicos del Mundial (definidos en Excel) consumiendo directamente de API-Football.

## 2. Arquitectura de Soluciones

### 2.1 Backend / Python Bot (`legacy_python/fetch_matches.py`)
- **Problema:** El bot actual solo busca los partidos de Colombia o usa lógica genérica.
- **Solución:** Reestructurar la función `fetch_worldcup_path(db)` para que consulte a la API-Football todos los partidos de la `league=1` (Mundial) y `season=2026` (o utilizar los IDs de equipos específicos).
- **El bot DEBE armar un array en `system/worldcup_path` estrictamente con estos 13 partidos:**
  1. México vs. Sudáfrica (11 de junio)
  2. Brasil vs. Marruecos (13 de junio)
  3. Países Bajos vs. Japón (14 de junio)
  4. Inglaterra vs. Croacia (17 de junio)
  5. Colombia vs. Uzbekistán (17 de junio)
  6. Argentina vs. Austria (22 de junio)
  7. Portugal vs. Uzbekistán (23 de junio)
  8. Colombia vs. RD Congo (23 de junio)
  9. Escocia vs. Brasil (24 de junio)
  10. Ecuador vs. Alemania (25 de junio)
  11. Noruega vs. Francia (26 de junio)
  12. Uruguay vs. España (26 de junio)
  13. Colombia vs. Portugal (27 de junio)
- **Extracción:** El bot extraerá logos, IDs de equipos y `fixtureId` de la API. *Obligatorio:* Si la API de fútbol no los retorna aún (por estar lejanos en el tiempo), el script de Python deberá usar la API de *Teams* para traer los logos de los países e insertar estos 13 registros en Firestore usando la fecha exacta indicada, garantizando que el Frontend no use datos planos locales.
- **Documentación API-Football para el Agente:** 
  - Host a utilizar: `v3.football.api-sports.io`
  - *Para buscar partidos:* Endpoint `GET /fixtures`. Parámetros útiles: `?league=1&season=2026` o `?date=YYYY-MM-DD`.
  - *Para buscar logos de países (si no hay partido):* Endpoint `GET /teams`. Parámetros útiles: `?search=Colombia` o `?name=Colombia`. Extraer de `response[0].team.logo`.
  - *Para predicciones:* Endpoint `GET /predictions`. Parámetro: `?fixture={id}`.

### 2.2 Frontend / UI (`PollaMundialista.tsx`)
- **Limpieza de Datos Planos:** Eliminar por completo el fallback local `DUMMY_MATCHES`. La vista debe renderizar exclusivamente el array `matches` proveniente de `system/worldcup_path`.
- **Botón de Bloqueo Inmediato:** En cada tarjeta donde el usuario tenga una apuesta activa y esté dentro de las 48 horas, además del botón "Modificar", añadir un botón rojo o distintivo llamado `[Bloquear Definitivamente]`.
  - **Lógica:** Al presionarlo, actualizar el documento en Firestore cambiando `lockedAt` a una fecha antigua (ej. restando 48h) o añadiendo un flag `isLockedManually: true`. Esto inhabilitará las modificaciones inmediatamente.
- **Cobro de Tokens (Aclaración):** *Nota para el agente:* Las reglas de Firestore ya fueron parcheadas para permitir al usuario descontar sus propios tokens. Revisa la lógica de `handleModify` para confirmar que modificar NO resta tokens nuevamente.

### 2.3 Panel Admin (`Admin.tsx`)
- **Modal de Historial Individual:** En la tabla "Gestión de Tokens" (donde se listan los usuarios), añadir un botón con el icono de un "Ojo" (Ver Predicciones).
- **Lógica:** Al hacer clic, se abrirá un Modal (o se expandirá la fila) mostrando una tabla filtrada que contenga **solo** las predicciones (`allBets`) donde `bet.email === usuario_seleccionado`.
- **Datos a mostrar:** Partido, Predicción Actual, y Estado del Tiempo (ej. "Faltan 12 horas para bloqueo" o "Bloqueado").

---

## 3. To-Do List (Checklist de Progreso)
*Agente: Marca con una `[x]` las tareas a medida que las vayas completando.*

### Backend / API-Football
- [x] 1. **fetch_matches.py**: Modificar la extracción para armar y guardar en Firestore exclusivamente los 13 partidos listados en los requerimientos. Usar la API de equipos (`/teams`) o de partidos (`/fixtures`) para poblar logos reales de API-Football. No usar arrays estáticos de fallback en el frontend.

### Frontend: Lógica de Apuestas
- [x] 2. **PollaMundialista.tsx**: Eliminar constantes de Dummy Matches. Cargar dinámicamente desde Firebase (`worldcup_path`).
- [x] 3. **PollaMundialista.tsx**: Añadir el botón "Bloquear Definitivamente" en las tarjetas de apuestas activas para cancelar voluntariamente el periodo de gracia de 48h.

### Frontend: Panel de Control (Admin)
- [x] 4. **Admin.tsx**: Añadir un botón para inspeccionar usuarios individuales en la tabla de Gestión de Tokens.
- [x] 5. **Admin.tsx**: Crear un Modal o Vista Secundaria que muestre los 13 partidos (o predicciones hechas) del usuario seleccionado, reflejando si están bloqueados o cuánto tiempo les queda de modificación.
