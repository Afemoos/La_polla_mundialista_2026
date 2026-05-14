# La Polla Mundialista 2026 — AGENTS.md

## Comandos

- **install:** `corepack pnpm install` — usa pnpm. **`npm install` queda ESTRICTAMENTE PROHIBIDO.**
- **dev:** `corepack pnpm dev`
- **build (obligatorio antes de commit):** `corepack pnpm build` — ejecuta `tsc -b && vite build`. El build debe pasar limpio; si falla, el push rompe Vercel.
- **lint:** `corepack pnpm lint`
- **deploy de reglas Firestore:** `npx firebase deploy --only firestore:rules`

## Arquitectura

### Frontend (React 19 + Vite 8 + TypeScript 6)

SPA con autenticación Google via Firebase Auth. Páginas:

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/` | `Home.tsx` | Radares (Colombia y Global) con datos de `system/colombia_match` y `system/radar_match`. La zona de apuesta ("Participar en este Evento") está temporalmente deshabilitada. |
| `/mis-apuestas` | `MisApuestas.tsx` | Historial del usuario con sus predicciones |
| `/resultados` | `Resultados.tsx` | Últimos resultados de `system/recent_results` |
| `/admin` | `Admin.tsx` | Solo admins. Gestión de pagos, cancelaciones |
| `/polla-mundialista` | `PollaMundialista.tsx` | Placeholder "próximamente" |

- `src/components/Sidebar.tsx` — navegación lateral con toggle dark/light
- `src/contexts/AuthContext.tsx` — provee `useAuth()` con `currentUser`, `loginWithGoogle`, `logout`, `isAdmin`. Admins hardcodeados: `afemos027@gmail.com`, `afemos023@gmail.com`, `daar.523@gmail.com`
- `src/contexts/ThemeContext.tsx` — dark/light mode via `data-theme` attr en `<html>`
- `src/types/firestore.ts` — interfaces `Prediction` y `RadarMatch`
- `src/services/firestore.ts` — funciones helper para queries y mutaciones en Firestore

**Importante sobre TS:** `tsconfig.app.json` tiene `noUnusedLocals: true` y `noUnusedParameters: true`. Cualquier variable o import sin usar rompe el build. Al eliminar código, limpia también los imports y variables huérfanas.

### Backend (Python en `legacy_python/`)

La carpeta `legacy_python/` contiene dos cosas:

**A. Scripts automatizados (bots)** ejecutados via GitHub Actions:
- `fetch_matches.py` — busca próximos partidos de Colombia (team 8), Champions (league 2) y Mundial (league 1) via API-Football. Guarda en `system/colombia_match` y `system/radar_match`.
- `auditor.py` — revisa partidos finalizados, compara predicciones con marcador real, asigna `result: GANADA | PERDIDA` en los docs de `predictions`.
- `fetch_results.py` — descarga últimos resultados y los guarda en `system/recent_results`.
- `contabilidad.py` — sincroniza datos de Firestore con Google Sheets (sheet ID hardcodeada). Usa `gspread`.

**B. Streamlit dashboard legacy** (`app.py`) — panel admin antiguo, no desplegado en Vercel. Usa Google OAuth directo y módulos en `core/` y `components/`.

### GitHub Actions

| Workflow | Cron | Scripts |
|----------|------|---------|
| `accounting_sync.yml` | cada 5 min | `fetch_matches.py` → `contabilidad.py` → `auditor.py` |
| `results_sync.yml` | cada 6 horas | `fetch_results.py` |

Ambos inyectan secretos como variables de entorno: `GCP_CREDENTIALS` (JSON de credenciales Firebase/Google), `API_FOOTBALL_KEY`.

## Firestore

### Colecciones/Documentos del sistema (`system/`)

- `system/colombia_match` — próximo partido de Colombia (radar tricolor). Escritura solo admin/bots; lectura requiere auth.
- `system/radar_match` — próximo partido global (Champions/Mundial). Mismas reglas que `colombia_match`.
- `system/recent_results` — array de resultados recientes. Solo lectura pública autenticada; escritura `false` (solo Admin SDK).
- `system/api_status` — `{ requests_current, requests_limit, last_updated }`. Lectura solo admin; escritura `false` (solo bots).

### Colección `predictions`

Documentos con estructura (`src/types/firestore.ts`):
- `status`: `PENDIENTE` | `PAGADO` | `CANCELACION_SOLICITADA` | `CANCELADA`
- `result`: `GANADA` | `PERDIDA` (asignado por `auditor.py`)

**Reglas de negocio críticas:**

1. Una predicción con `result` asignado (`GANADA` o `PERDIDA`) no debe modificarse ni eliminarse. Las reglas de Firestore lo validan (`resource.data.result == null` en condiciones de escritura).
2. El usuario solo puede crear predicciones con `status: PENDIENTE`. Solo admin cambia a `PAGADO`.
3. Un usuario puede cambiar su predicción de `PAGADO` → `CANCELACION_SOLICITADA` (solicitar cancelación). Solo admin aprueba/rechaza.
4. Un usuario puede eliminar su predicción solo si `status == PENDIENTE`.
5. Los campos `probHome + probDraw + probAway` deben sumar exactamente 100 (validado en reglas Firestore).

## Estilo y UI

- **CSS variables para colores** — usar siempre `var(--bg-dark)`, `var(--text-main)`, `var(--primary)`, etc. No hardcodear `#hex` o `rgba()`.
- **Dark/Light mode** — controlado por `data-theme="light"` en `<html>`. El tema por defecto es dark (sin atributo).
- **Glassmorphism** — tarjetas con `class="glass-card"`, fondos semitransparentes, bordes suaves.
- **Iconos:** `lucide-react`
- **Idioma:** español para toda la UI y comentarios.

## Convenciones de código

- **AI-NOTE:** Al implementar workarounds o soluciones no obvias, comentar con `// AI-NOTE: explicación`. Esto previene que futuros agentes "corrijan" código que es intencional.
- **No eliminar sin certeza** — ante la duda, comentar con `// DEPRECATED`.
- **Secretos:** usar `import.meta.env.VITE_...` en frontend, `os.getenv('...')` en Python.
- **Commits:** conventional commits (`feat:`, `fix:`, `refactor:`, `style:`, `docs:`). Push a `main` dispara deploy automático en Vercel.

## Flujo de Trabajo y Verificación (Mandatorio)

1. **Fase de Planificación:** Para cambios estructurales, crear primero un `implementation_plan.md` y `task.md` para aprobación del usuario.
2. **Testing Local:** Ejecutar `npm run dev` y probar la UI manualmente antes de dar por terminado un cambio visual.
3. **Pre-Commit Check:** Es **OBLIGATORIO** ejecutar `npm run build` antes de cualquier commit. Si TypeScript falla, el despliegue automático en Vercel se romperá. Corrige el tipado (ej. quitando `any` o importando tipos) y reintenta el build.
4. **Manejo de Habilidades (Autoskills):** Si se añaden/modifican *skills* en `.agents/skills/`, ejecutar `npx autoskills` y asegurarse de subir el `skills-lock.json` en el commit.

## Firestore — Reglas de Migración de Datos

**⚠️ NUNCA borres una colección para re-poblarla desde cero si solo necesitas corregir unos pocos documentos.** 
Firestore tiene un límite de 20,000 escrituras/día en el plan gratuito. Borrar y re-crear una colección de 1616 documentos consume ~3,200 operaciones que podrían haberse resuelto con ~10 escrituras correctivas.

**Reglas:**
1. **Antes de migrar:** Auditar qué documentos faltan o son incorrectos. Solo escribir los que necesitan cambio.
2. **Correcciones puntuales:** Usar `setDoc()` para sobreescribir documentos individuales, no re-ejecutar el script completo.
3. **Idempotencia:** Todos los scripts de poblado deben usar `setDoc()` (no `addDoc()`) y aceptar re-ejecución sin crear duplicados.
4. **Rate limiting:** Si el script escribe más de 100 documentos, agregar `time.sleep(0.5)` entre lotes para no agotar el quota.
5. **Respaldo:** Las colecciones antiguas no se eliminan hasta que las nuevas estén verificadas y funcionando en producción.
6. **Quota:** Si aparece `429 Quota exceeded`, detener todas las escrituras. Esperar al reset diario. No reintentar en bucle.
7. **⚠️ `collectionGroup()` en Web SDK ≠ Admin SDK:** El Admin SDK (Python) ejecuta `collectionGroup` sin necesidad de índices explícitos. El Web SDK (frontend) REQUIERE índices explícitos desplegados en `firestore.indexes.json`. Sin ellos, cualquier query con `collectionGroup()` falla con "Missing or insufficient permissions" — un error engañoso porque parece un problema de reglas pero es falta de índices. Si necesitas `collectionGroup` en el frontend, despliega los índices primero con `npx firebase deploy --only firestore:indexes`.
8. **Firestore paths deben tener segmentos PARES:** Un documento necesita número par de segmentos en su path (`collection/doc` = 2, `collection/doc/sub/doc` = 4, `collection/doc/sub/doc/sub2/doc2` = 6). Un número impar indica colección, no documento. Ej: `users/{uid}/profile` (3 segmentos) ❌ → `users/{uid}/profile/data` (4 segmentos) ✅.

## Manejo de Errores y Estabilidad

- **Cero pantallas en blanco:** Toda operación asíncrona (Firestore o API externa) debe tener un estado de `loading` (UI visual) y bloques `try/catch` rigurosos. Si algo falla, notificar al usuario (no ocultar el error).
- **Tipado Fuerte:** Se prohíbe el uso de `any`. Todo dato proveniente de Firestore o APIs debe mapearse a una Interfaz TypeScript estricta.
- **Modularidad DRY:** Archivos de UI que superen las ~250 líneas y contengan lógica repetida deben extraerse a `src/components/` o `src/hooks/`.

## 📋 Estándar de Implementación de Funcionalidades (Plan & Prompt)

Para asegurar que los agentes entiendan y ejecuten desarrollos complejos sin desviarse, todo nuevo desarrollo masivo debe seguir esta plantilla para la creación de un plan, y ejecutarse mediante un *prompt* estándar.

### Prompt Estándar para Ejecución de Planes

Cuando el archivo `implementation-plan.md` esté listo, inicia una nueva sesión con el agente y utiliza EXACTAMENTE este prompt:

> *"Hello. We are going to develop a major new feature for this project. First, strictly read the `@AGENTS.md` file to understand my business rules, design guidelines, and security standards. Then, open and read `@implementation-plan.md`. That file contains your roadmap. I want you to execute the 'To-Do List' section step by step, modifying the necessary code. After completing each task on the To-Do list, edit the `@implementation-plan.md` file by marking the checkbox with an `[x]` before proceeding to the next one. Only stop and ask me if you encounter a critical error that requires my decision."*

### Estructura Estándar de `implementation-plan.md`

Si vas a redactar un nuevo plan para el futuro, utiliza esta plantilla obligatoria:

```markdown
# Plan de Implementación: [Nombre de la Funcionalidad]

## 1. Contexto y Objetivos
- Breve descripción de qué se quiere lograr y por qué.

## 2. Arquitectura de Base de Datos (Firestore)
- Colecciones a crear o modificar.
- Nuevos campos requeridos y tipos de datos (TypeScript interfaces).
- Cambios requeridos en `firestore.rules`.

## 3. Backend / APIs (Si aplica)
- Nuevos scripts de Python o llamadas necesarias a la API-Football.

## 4. Frontend: Interfaces y Componentes (UI/UX)
- Rutas nuevas a crear en el enrutador.
- Componentes clave a desarrollar y estilos requeridos (uso de variables CSS, glassmorphism).

## 5. Lógica de Reglas de Negocio
- Estados de UI (cargas, bloqueos, permisos de administrador).
- Validaciones matemáticas, de tiempo o de saldo de usuario.

## 6. To-Do List (Checklist de Progreso)
*Agente: Marca con una `[x]` las tareas a medida que las vayas completando.*

### [Categoría 1: ej. Base de Datos]
- [ ] 1. Tarea específica.
- [ ] 2. Tarea específica.

### [Categoría 2: ej. UI y Lógica]
- [ ] 3. Tarea específica.
- [ ] 4. Tarea específica.
```
