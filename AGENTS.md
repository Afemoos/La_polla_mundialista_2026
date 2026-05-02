# Contexto y Reglas del Proyecto: La Polla Mundialista 2026

Este documento (`AGENTS.md`) sirve como guía principal y memoria del proyecto para cualquier agente de IA que asista en el desarrollo de "La Polla Mundialista 2026". Contiene la arquitectura, el stack tecnológico, las reglas de negocio y las convenciones de código derivadas de las interacciones previas.

## 🛠️ Stack Tecnológico

- **Frontend**: React 19, Vite, TypeScript.
- **Backend (Scripts automatizados)**: Python 3.10.
- **Base de Datos y Autenticación**: Firebase (Firestore, Firebase Auth con Google).
- **Despliegue**: Vercel (Frontend), GitHub Actions (Ejecución de scripts Python mediante cron jobs).
- **API Externa**: API-Football (v3).

## 🏗️ Arquitectura del Sistema

El proyecto se divide en dos grandes bloques:

1.  **Frontend (React SPA)**
    *   `src/pages/Home.tsx`: Vista principal donde los usuarios ven los próximos partidos (radar) y envían sus predicciones.
    *   `src/pages/MisApuestas.tsx`: Historial del usuario con sus apuestas. Muestra logos, resultados oficiales y permite cancelar apuestas `PENDIENTES` o solicitar cancelación de las `PAGADAS`.
    *   `src/pages/Resultados.tsx`: Tablero de resultados recientes (Colombia, Champions League, Mundial 2026).
    *   `src/pages/Admin.tsx`: Panel exclusivo para administradores para gestionar pagos, aprobar/rechazar cancelaciones y monitorear el consumo de la API.
2.  **Backend (Bots de Python en `legacy_python/`)**
    *   `fetch_matches.py`: Consulta la API para encontrar el próximo partido relevante (radar) y lo guarda en Firestore (`system/radar_match`).
    *   `auditor.py`: Revisa los partidos finalizados, compara el marcador real con las predicciones y actualiza el estado de las apuestas a `GANADA` o `PERDIDA`, guardando también el `finalScore`.
    *   `fetch_results.py`: Descarga los últimos 10 resultados de competiciones clave y los guarda en `system/recent_results`.

## 🚨 Reglas Críticas de Negocio

1.  **Límites de la API (Rate Limiting)**
    *   Tenemos un límite estricto de **7,500 requests diarias** en API-Football.
    *   Todo script de Python DEBE registrar su consumo actualizando `system/api_status` (campos `requests_current` y `requests_limit`).
    *   Los bots se ejecutan mediante GitHub Actions (`.github/workflows/`) con frecuencias controladas (ej. `fetch_results.py` cada 6 horas).
2.  **Seguridad de Base de Datos (Firestore Rules)**
    *   Las reglas de Firestore (`firestore.rules`) son la principal barrera de seguridad.
    *   **Inmutabilidad Auditada**: Una vez que una apuesta tiene un campo `result` (`GANADA` o `PERDIDA`), **NUNCA** debe ser modificada o eliminada, ni siquiera por un administrador.
    *   Las colecciones `system/recent_results` y `system/api_status` son de solo lectura para el cliente; solo los bots (vía Admin SDK) pueden escribir en ellas.
3.  **Flujo de Estados de una Apuesta**
    *   `status`: `PENDIENTE` -> `PAGADO`. (Modificable por Admin).
    *   `status`: `CANCELACION_SOLICITADA` -> `CANCELADA`. (Usuario solicita, Admin aprueba).
    *   `result`: `GANADA` o `PERDIDA`. Inyectado exclusivamente por el `auditor.py`.

## 🎨 Convenciones de Diseño y UI

-   **Aesthetic**: Diseño moderno, "glassmorphism" (tarjetas semitransparentes, bordes suaves), colores vibrantes para resaltar (ej. verde para GANADA, rojo para PERDIDA).
-   **Temas (Dark / Light Mode)**: El sistema soporta ambos temas a través de variables CSS (`--bg-dark`, `--text-main`, etc.) y el atributo `[data-theme='light']`. Los colores no deben estar hardcodeados como `rgba()` o `#hex` en los componentes, deben usar siempre las variables de `index.css`.
-   **Idioma**: Toda la interfaz de usuario, comentarios de código (preferiblemente) y mensajes deben estar en **Español**.
-   **Iconografía**: Se utiliza la librería `lucide-react`.
-   **Logos y Banderas**: Siempre que sea posible, las vistas de partidos deben mostrar los logos/banderas de los equipos (`homeLogo`, `awayLogo`) almacenados en Firestore.

## 💻 Comandos Frecuentes

-   **Desarrollo Local**: `npm run dev`
-   **Verificación de Build**: `npm run build`
-   **Despliegue de Reglas**: `npx firebase deploy --only firestore:rules`
-   **Git Workflow**: `git add .`, `git commit -m "..."`, `git push origin main` (El push a `main` dispara el despliegue automático en Vercel).
