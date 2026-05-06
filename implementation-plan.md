# Plan de Implementación: Fase 5 - Resolución de Conflictos Operativos

## 1. Contexto y Objetivos
- **Fallo del Botón de Exportación (Vercel):** El botón manual "Exportar a Excel" está devolviendo un error HTTP. La causa técnica es que Vercel, en su entorno Node.js, no soporta la función `req.json()` de la API Web estándar (solo disponible en Edge).
- **Aclaración sobre Excel "Duplicados":** Los usuarios reportan que modificar una predicción crea un "nuevo reporte" como si hubieran apostado dos veces. El script oficial `contabilidad.py` **no duplica** los datos, sino que sobreescribe todo desde cero de manera segura. Si hay duplicidad, es muy probable que tengan instalada una extensión externa (ej. "Export to Google Sheets" de Firebase) o Zapier. Necesitamos instruir al administrador vía UI para usar solo la exportación manual y desestimar sistemas de terceros.
- **Limpieza Estética (Porcentajes):** Se reportó que los porcentajes de probabilidad (Gana, Empate, Pierde) no son útiles y consumen espacio.
- **Economía de Tokens:** Se solicitó un ajuste económico. Todos los partidos pasarán de costar 1 token a 3 tokens, con excepción de los partidos de la Selección Colombia, que valdrán 5 tokens en fase de grupos.

## 2. Arquitectura de Base de Datos (Firestore)
- **Reglas de Seguridad:** *No es necesario modificarlas.* Las reglas actuales permiten que el saldo de `tokens` disminuya (`request.resource.data.tokens <= resource.data.tokens`), sin importar si se restan 1, 3 o 5 tokens. Además, la colección `predictions` no tiene el costo hardcodeado. ¡El sistema es dinámico por diseño!

## 3. Backend / APIs
- **Vercel API:** Se refactorizará `api/trigger-excel-sync.ts` para usar los parámetros clásicos de Node.js (`VercelRequest`, `VercelResponse`).
- **Python Bot (`fetch_matches.py`):** Modificar la constante `TARGET_MATCHES` para ajustar el precio de cada partido según si juega Colombia o no.

## 4. Frontend: Interfaces y Componentes (UI/UX)
- `Home.tsx`: Eliminación completa de la sección de probabilidades (`<div className="radar-prob">`).
- `Admin.tsx`: Mensaje aclaratorio de uso para prevenir confusión con duplicados en Excel generados por integraciones de terceros.

## 5. Lógica de Reglas de Negocio
- Costo Base: 3 tokens.
- Costo Premium (Colombia): 5 tokens.

## 6. To-Do List (Checklist de Progreso)
*Agente: Marca con una `[x]` las tareas a medida que las vayas completando.*

### [Categoría 1: Resolución del Endpoint Vercel]
- [x] 1. En `api/trigger-excel-sync.ts`, importar `VercelRequest` y `VercelResponse` desde `@vercel/node`. Cambiar la declaración de la función a `export default async function handler(req: VercelRequest, res: VercelResponse)`. Reemplazar `const body = (await req.json()) as { email?: string }` por `const body = req.body`. Y cambiar todos los retornos `return new Response(...)` por `return res.status(...).json(...)`. Eliminar el `/// <reference types="node" />` si se usa la importación de Vercel. 

### [Categoría 2: Limpieza de UI (`Home.tsx`)]
- [x] 2. Abrir `src/pages/Home.tsx` y localizar el componente funcional `MatchRadar`. Borrar todo el bloque `<div className="radar-prob">...</div>` y sus 3 divs hijos para desaparecer permanentemente los porcentajes de victoria de la UI.

### [Categoría 3: Economía y Python Bot (`fetch_matches.py` y `contabilidad.py`)]
- [x] 3. En `legacy_python/fetch_matches.py`, actualizar la lista `TARGET_MATCHES`. Identificar los 3 partidos donde el local o visitante sea "Colombia" y cambiar el 5º elemento de la tupla (costo en tokens) de `1` a `5`. Para los otros 10 partidos, cambiarlo a `3`.
- [x] 4. En `legacy_python/contabilidad.py`, al actualizar la pestaña 'Resumen Financiero' (alrededor de la línea 103), añadir una nueva fila al arreglo `resumen_data` que muestre: `["Última Sincronización", datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "Hora del servidor"]`. (Asegurarse de importar `datetime`).

### [Categoría 4: Aclaraciones de Interfaz (`Admin.tsx`)]
- [x] 5. En `src/pages/Admin.tsx`, añadir un pequeño texto informativo `<p>` con estilo `color: var(--text-muted), fontSize: 0.8rem` inmediatamente debajo del botón de *Sincronizar a Excel*, que diga: *"Nota: El botón reemplaza la hoja completa de Auditoría evitando duplicados. Extensiones de terceros sí pueden causar duplicados."*
