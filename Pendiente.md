# Pendiente.md

## Fecha límite para modificar predicciones

**Contexto:** Los usuarios pueden modificar sus predicciones de Mi Campeón, Mi Goleador y Mis 16 sin costo adicional hasta que comiencen los dieciseisavos (al finalizar la fase de grupos).

**Pendiente:** Definir la fecha exacta de inicio de dieciseisavos del Mundial 2026.

Una vez conocida esta fecha, implementar:

1. **Bloqueo automático:** Cuando `new Date() > fechaLimite`, deshabilitar el botón "Modificar predicción" en Mi Campeón, Mi Goleador y Mis 16. Mostrar mensaje: "Las predicciones están cerradas. Los dieciseisavos han comenzado."

2. **Validación en backend:** `saveUserPick()` debe rechazar modificaciones después de la fecha límite.

3. **UI feedback:** Cambiar el texto del confirm() en handleSave para reflejar la fecha exacta:
   ```
   `Puedes modificarla sin costo adicional hasta el ${fechaLimite}.\n\n¿Deseas cambiar tu predicción?`
   ```

**Archivos a modificar cuando se conozca la fecha:**
- `src/pages/MiCampeon.tsx` — handleSave, bloqueo
- `src/pages/MiGoleador.tsx` — handleSave, bloqueo  
- `src/services/firestore.ts` — saveUserPick (validación)
- `src/pages/Mis16.tsx` — bloqueo (cuando tenga bracket completo)

**Fecha estimada (según calendario FIFA):** Fase de grupos: 11-27 junio 2026. Dieciseisavos comienzan ~28 junio 2026.
