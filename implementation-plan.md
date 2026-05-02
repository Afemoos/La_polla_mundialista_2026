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
- **Problema de UX:** El panel de administración (`Admin.tsx`) actualmente muestra todas las tablas desplegadas al mismo tiempo. Al tener más de 100 predicciones, el administrador debe hacer un scroll excesivo para llegar a funciones críticas como la "Gestión de Tokens".
- **Problema de Sincronización:** El administrador necesita una forma de forzar el envío de datos a Google Sheets (Excel) bajo demanda desde la página web, sin tener que esperar los 5 minutos del bot, y sobre todo, **sin** disparar consultas innecesarias a la API-Football que consuman la cuota diaria.

> [!IMPORTANT]
> **Aprobación Requerida:** Para lograr el botón de sincronización manual de forma segura sin exponer tokens en el frontend, se requerirá crear una "Vercel Serverless Function" (una API en la nube) y generar un Token de Acceso Personal en GitHub. ¿Estás de acuerdo con este enfoque técnico?

## 2. Infraestructura y Backend
- **Nuevo GitHub Action (`sync_excel_manual.yml`):** Se creará un nuevo workflow en GitHub que se pueda disparar manualmente (`workflow_dispatch`). Este workflow ejecutará **exclusivamente** el script `legacy_python/contabilidad.py` (y opcionalmente `auditor.py`), omitiendo por completo `fetch_matches.py`. Así protegemos las peticiones a la API-Football.
- **Vercel API (`api/trigger-excel-sync.js` o `.ts`):** Dado que estamos en Vite, Vercel nos permite crear funciones de backend en una carpeta `/api`. Esta función recibirá la petición del botón de React, verificará el token de Firebase del admin (para seguridad), y utilizará un Token de GitHub (`GITHUB_PAT` en las variables de entorno de Vercel) para disparar silenciosamente el Action de arriba.

## 3. Frontend: Interfaces y Componentes (UI/UX)
- **Componente de Acordeón:** En `Admin.tsx`, envolveremos las tablas de "Usuarios Registrados", "Gestión de Tokens" y "Auditoría de Apuestas" en contenedores colapsables. 
- **Reordenamiento lógico:** Sugerimos mover "Gestión de Tokens" a la parte superior, ya que es la tarea administrativa más frecuente (aprobar pagos). Las tablas iniciarán contraídas por defecto para mantener la pantalla limpia.
- **Botón de Sincronización:** Un botón prominente "Exportar a Excel (Manual)" que llamará a nuestra nueva función Serverless y mostrará un estado de carga mientras GitHub realiza el proceso.

## 4. Detalles Técnicos y Reglas de Implementación (Para el Agente)

### A. Vercel Serverless Function (`api/trigger-excel-sync.ts`)
- **Firma:** Debe exportar por defecto un handler asíncrono para Vercel: `export default async function handler(req, res)`.
- **Llamada a GitHub API:** Deberá hacer un `POST` a `https://api.github.com/repos/Afemoos/La_polla_mundialista_2026/actions/workflows/sync_excel_manual.yml/dispatches`.
- **Cuerpo (Payload):** `{"ref":"main"}`.
- **Headers requeridos por GitHub:** 
  - `Accept: application/vnd.github.v3+json`
  - `Authorization: Bearer ${process.env.GITHUB_PAT}`
  - `User-Agent: Vercel-Serverless-Function`
- **Seguridad Ligera:** Como no tenemos `firebase-admin` configurado en Node.js, el frontend enviará el email del usuario en el body. Valida en el backend que el email pertenezca a la lista de administradores autorizados (Afemos027, Afemos023, Daar.523) antes de hacer la petición a GitHub.

### B. Diseño Frontend (`Admin.tsx`)
- **Acordeones:** No instales librerías pesadas como Radix o MUI. Utiliza etiquetas nativas de HTML5 `<details>` y `<summary>` o construye un componente simple usando `useState` (ej. `isTokensOpen`) con una animación CSS sencilla y los iconos de *lucide-react* (ChevronDown/ChevronUp).
- **Estado de Carga:** El botón de "Sincronizar" debe bloquearse (disabled) una vez clickeado y mostrar un `Loader` (lucide-react). Debe liberar el estado después de obtener respuesta exitosa de la API `/api/trigger-excel-sync`.

### C. Experiencia de Usuario y Reglas de Negocio Extra
- **Modo Claro por defecto:** Cambiar el estado inicial en `ThemeContext.tsx` o el atributo en el `index.html` para que inicie en Light Mode.
- **Fix Botón de Bloqueo:** El error actual ocurre probablemente por un mismatch de tipos de fecha (`Date` vs `Timestamp`). En `handleLockNow`, asegúrate de usar `Timestamp.fromDate(pastTime)` en lugar de enviar un objeto Date crudo a Firebase, o verifica si la regla de Firebase exige un string.
- **Bloqueo por Horario de Partido (Pre-Match Lock):** 
  - La tarjeta de apuesta (`MatchCard`) recibe la `match.date` (Fecha del partido). 
  - Implementa una validación: Si la fecha/hora actual está a menos de 1 hora del `match.date`, la tarjeta debe considerarse `isLocked = true` automáticamente, deshabilitando el botón de Guardar y Modificar. Esto cerrará "manualmente" pero de forma automática las apuestas antes de que empiece a rodar el balón.

## 5. To-Do List (Checklist de Progreso)

### Infraestructura (GitHub & Vercel)
- [x] 1. Crear el archivo `.github/workflows/sync_excel_manual.yml` con el flujo recortado (solo ejecutar Python contabilidad).
- [x] 2. Crear la carpeta raíz `/api` y el endpoint `trigger-excel-sync.ts` con la lógica de conexión a GitHub.

### Interfaz del Panel de Administración (`Admin.tsx`)
- [x] 3. Refactorizar el diseño de `Admin.tsx` usando un sistema de acordeones para las 3 tablas.
- [x] 4. Reordenar el renderizado: colocar "Gestión de Tokens" en la primera posición.
- [x] 5. Integrar el botón "Sincronizar a Excel Ahora", conectado al endpoint `/api/trigger-excel-sync`, con manejo de errores y notificaciones de éxito/carga.

### Reglas de Negocio Extra (UI General)
- [x] 6. Establecer el Modo Claro como tema por defecto.
- [x] 7. Corregir el error de Firebase en la función `handleLockNow` al bloquear la tarjeta.
- [x] 8. Implementar lógica matemática en `PollaMundialista.tsx` para bloquear las tarjetas automáticamente 1 hora antes del inicio oficial del partido (`match.date`).

## Estado de Variables de Entorno
- ✅ **GITHUB_PAT**: Configurado en Vercel para permitir a la API Serverless ejecutar los flujos de GitHub Actions.
