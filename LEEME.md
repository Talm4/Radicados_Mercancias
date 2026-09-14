# Talma · Control de asistencia

Aplicación web para validar la asistencia al curso de Radicación de Mercancías Peligrosas. Mantiene Firebase, CRUD, importación/exportación, filtros, perfiles y certificados.

## Uso

Sirve esta carpeta desde un servidor HTTP estático y abre `index.html`:

```bash
python -m http.server 8080
```

Luego abre `http://localhost:8080/index.html`.

## Navegación

- **Resumen:** total de registros, personas que asistieron, personas que no asistieron y lista de inasistencias.
- **Registros:** tabla paginada con búsqueda, filtros, CRUD, acciones masivas e importación/exportación.
- **Personas:** asistencia consolidada y perfil lateral por colaborador.
- **Cursos:** personas, grupos y asistencia por curso.
- **Grupos:** participantes y asistencia por grupo.

## Certificados

El perfil permite ver, configurar, descargar o guardar en Firebase el certificado cuando la persona asistió y obtuvo una nota superior a 80. Con inasistencia, nota igual o inferior a 80, o una nota no válida, queda bloqueado en la interfaz y en la lógica de generación.

El código se asigna una sola vez por colaborador mediante una transacción de Firestore. Los valores existentes en `CERT_NUMERO` se conservan durante la migración; quienes todavía no tengan código reciben automáticamente el siguiente `CI-#####` disponible. El PDF añade el prefijo visual `N°:`.

Las licencias IET se completan automáticamente para Álvaro López (`94314461`), Juan Arias (`80022447`) y Adriana Vanegas (`31172210`).

El PDF conserva las fuentes Calibri y Calibri Bold incrustadas en `assets/pdf/PLANTILLA-CERTIFICADO.pdf`. Los campos personalizados se guardan en el registro de `capacitaciones`; los PDF enviados a la nube se almacenan en Firebase Storage.

## Arquitectura

```text
Firestore (un listener)
  → normalización
  → índices por dimensión
  → filtros cacheados
  → agregación de asistencia
  → tablero y tablas paginadas
```

## Importaciones de más de 5.000 filas

La vista previa está paginada y Firebase recibe lotes de 450 operaciones con avance visible. El navegador guarda un punto de recuperación después de cada lote; si se corta la conexión o se cierra la página, al regresar aparecerá la opción **Reanudar**. Los lotes repetidos son idempotentes y no crean copias del mismo registro.

Se admiten archivos Excel o CSV de hasta 25 MB. Conviene mantener una fila de encabezados reconocible y las columnas ID/Cédula y Nombres; las columnas adicionales se ignoran.

## Revisión automática de notas

La automatización compara Firebase con el reporte de Aprende Talma. La coincidencia usa la cédula y el tipo de curso, sin distinguir tildes ni mayúsculas:

- `Básico inicial` y sus variaciones usan el curso LMS de 8 horas, Inicial 2026V2.
- `Básico repaso`, `Básico recurrente` y sus variaciones usan el curso LMS de 4 horas, Recurrente 2026V2.

El proceso toma el registro más reciente por persona y tipo de curso, redondea la nota al entero más cercano y actualiza Firebase. Las notas iguales no se vuelven a guardar y los registros sin coincidencia permanecen intactos. El botón **Revisar notas** muestra el estado de la última ejecución y actualiza los datos visibles.

El archivo completo del LMS pesa aproximadamente 55 MB y el servidor no permite descargarlo directamente desde JavaScript por CORS. Por eso `.github/workflows/actualizar-notas.yml` ejecuta `scripts/actualizar_notas.py` todos los días a las 5:00 a. m. de Colombia y escribe las notas directamente en Firebase. Ninguna cédula o nota se publica como archivo estático.

Al subir el proyecto a GitHub:

1. En Firebase Console abre **Configuración del proyecto → Cuentas de servicio** y genera una clave privada nueva.
2. En GitHub abre **Settings → Secrets and variables → Actions** y crea el secreto `FIREBASE_SERVICE_ACCOUNT`; pega como valor todo el contenido JSON de la clave.
3. En **Settings → Actions → General**, habilita **Read and write permissions** para `GITHUB_TOKEN`.
4. Abre **Actions → Actualizar notas de Aprende Talma** y ejecuta **Run workflow** una vez.
5. Publica la web normalmente. Desde ese momento Firebase se actualizará cada día sin Power Automate Premium y sin claves en el navegador.

La clave privada solo debe existir en GitHub Secrets. No debe copiarse dentro de JavaScript, del ZIP ni del repositorio.

## Pruebas

```bash
node test-logica.mjs
node test-v2.mjs
python test-notas.py
```

Consulta `CAMBIOS-V2.md` para ver el detalle técnico y las mediciones de rendimiento.
