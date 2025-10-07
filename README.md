# Grabadora Pro

Plataforma moderna para transcribir audios con WhisperX, identificar hablantes, guardar resultados en una base de datos consultable y ofrecer una interfaz web lista para desplegar en Docker.

## Características principales

- **API FastAPI** con endpoints para subir audios en lote, consultar, descargar y eliminar transcripciones.
- **Integración con WhisperX** para transcripción rápida y diarización de hablantes: prioriza GPU/CUDA cuando está disponible y cae automáticamente a CPU o al transcriptor simulado en entornos sin aceleración.
- **Base de datos SQLite / SQLAlchemy** con búsqueda por texto, asignatura y estado.
- **Generación automática de archivos `.txt`** y estructura extensible para futuros planes premium con IA externa.
- **Interfaz web** en `/` con selector multimedia animado, validación de audio/video y barra de progreso en tiempo real.
- **Inicio unificado** que combina subida rápida, transcripción en vivo, vista instantánea con auto-scroll y accesos directos a carpetas y trabajos recientes.
- **Biblioteca por carpetas** con filtros por etiquetas, estado, número de tema y búsqueda libre para localizar transcripciones rápidas.
- **Dashboard con métricas en vivo** (totales, completadas, minutos procesados, etc.) y vista estilo ChatGPT con animación adaptativa que escribe según el modelo y el dispositivo usado, desplazando la vista automáticamente.
- **Beneficios premium simulados** con checkout y confirmación que desbloquean notas IA enriquecidas sin mostrar importes hasta definir tu estrategia comercial.
- **Selector de planes profesional** con fichas enriquecidas, resumen de cobro paso a paso y diálogo modal listo para conectar con tu pasarela real.
- **Selector de idioma** con español (predeterminado), inglés y francés, además de autodetección cuando lo necesites.
- **Autocompletado de carpetas** que recuerda la última carpeta usada, sugiere destinos existentes y sincroniza el modo en vivo con el formulario principal.
- **Modo estudiante web**: vista ligera con anuncios educativos y ejecución local accesible en `student.html` o desde el botón “Abrir simulador independiente”.
- **Transcripción en vivo** que captura audio del navegador, permite elegir modelo/dispositivo y convierte la sesión en una transcripción almacenada con sus TXT generados.
- **Barra de progreso en Inicio y En vivo** que refleja segundos procesados y retraso estimado, con auto-actualización mientras hablas.
- **Preparación guiada de modelos** con precarga y seguimiento porcentual cuando es necesario descargar Whisper o sus variantes.
- **Diagnósticos de CUDA** con eventos de fallback detallados y avisos en la Biblioteca para que puedas corregir drivers o forzar la GPU cuando sea necesario.
- **Inicio de sesión con Google (OAuth 2.0)** listo para conectar con tus credenciales y personalizar la experiencia del dashboard.
- **Dockerfile y docker-compose** para ejecutar el servicio completo (API + frontend) y posibilidad de habilitar GPU.
- **Tests con Pytest** que validan el flujo principal usando un transcriptor simulado y comprueban la compatibilidad con las versiones recientes de faster-whisper.

## Arquitectura y optimización de modelos

- **Orquestación de modelos (`app/whisper_service.py`)**: concentra la inicialización de WhisperX, la detección de idioma y el fallback hacia `faster-whisper` o el transcriptor simulado. Aquí puedes ajustar cachés, tipos de cómputo por dispositivo, beam search y opciones avanzadas (`_build_asr_options`).
- **Preparación asíncrona y seguimiento (`app/whisper_service.py` + `/api/transcriptions/models/*`)**: `request_model_preparation` usa un `ThreadPoolExecutor` para descargar modelos en segundo plano, expone progreso y errores, y comparte el estado a través de `_model_progress` para que el frontend muestre el avance porcentual antes de iniciar sesiones o subidas.
- **Selección de modelos en API (`app/routers/transcriptions.py`)**: normaliza aliases y resuelve el dispositivo antes de invocar `get_transcriber`. Si deseas añadir nuevos tamaños o estrategias de balanceo, amplía los diccionarios `SUPPORTED_MODEL_SIZES` y `MODEL_ALIASES`.
- **Parámetros dinámicos**: la configuración en `app/config.py` se inyecta en el servicio Whisper para fijar hilos, directorios de caché, modo multilingüe o uso forzado de GPU. Puedes sobreescribirla vía variables de entorno sin tocar el código.
- **Scripts de benchmark (`scripts/benchmark_models.py`)**: útiles para medir los efectos de tus cambios de optimización directamente sobre tus datos históricos.

## Requisitos

- Python 3.10 o superior.
- FFmpeg disponible en la ruta (`apt install ffmpeg` o equivalente).
- Dependencias de base de datos incluidas (por ejemplo, `aiosqlite` para el driver asíncrono de SQLite).
- Librerías auxiliares para la interfaz (`aiofiles` para servir los archivos estáticos).
- Para usar WhisperX real: `torch` compatible y opcionalmente GPU con CUDA.

## Instalación local

### Crear entorno virtual

```bash
python -m venv .venv
```

- **Linux / macOS:** `source .venv/bin/activate`
- **Windows (PowerShell):** `.\.venv\Scripts\Activate.ps1`
- **Windows (CMD):** `.\.venv\Scripts\activate.bat`

> **Importante (Windows):** si ves advertencias indicando que `pip.exe` o `uvicorn.exe` no están en el PATH, aún no se ha
> activado el entorno virtual. Actívalo y utiliza siempre `python -m pip` para asegurarte de instalar en la misma versión de
> Python con la que ejecutarás la aplicación.

### Instalar dependencias y preparar la base de datos

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m scripts.init_db
```

Para comprobar que todo está listo puedes ejecutar:

```bash
python -m scripts.doctor
```

El comando revisa las dependencias clave (FastAPI, SQLAlchemy, WhisperX, etc.) y muestra cómo resolver cualquier ausencia.

## Transcripción en vivo desde el navegador

1. **Permisos de micrófono**: el navegador solicitará acceso la primera vez. Usa Chrome, Edge o Firefox actualizados para aprovechar la API `MediaRecorder`.
2. **Inicio**: desde el panel “En vivo” elige idioma, modelo y dispositivo. Al pulsar “Iniciar” se crea una sesión (`POST /api/transcriptions/live/sessions`) y comienza a enviarse audio en fragmentos `webm/opus`.
3. **Preparación del modelo**: si el tamaño seleccionado no está en caché, la interfaz llama a `/api/transcriptions/models/prepare`, muestra el porcentaje descargado y continúa automáticamente cuando llega al 100 %.
4. **Streaming incremental**: cada chunk se sube a `POST /api/transcriptions/live/sessions/{id}/chunk`. El backend consolida el audio en disco y re-transcribe todo el buffer para ofrecer texto acumulado, segmentos y métricas actualizadas sin perder el historial.
5. **Pausa y reanudación**: aprovecha los controles del visor para detener la captura sin cerrar la sesión. El TTL de la sesión se renueva con cada actividad, por lo que no expirará mientras sigas hablando.
6. **Finalización**: al pulsar “Finalizar & guardar” se detiene la grabación, se espera a que se procesen los últimos fragmentos y se invoca `POST /api/transcriptions/live/sessions/{id}/finalize` para crear una transcripción completa con su `.txt`. El historial del visor permanece visible hasta que inicies una nueva sesión.
7. **Cancelación segura**: si cierras el navegador o hay un error, la interfaz solicita `DELETE /api/transcriptions/live/sessions/{id}` para limpiar memoria y archivos temporales.

## Planes premium y pagos

| Plan | Precio | Dónde se procesa | Incluye | Flujo de pago |
| --- | --- | --- | --- | --- |
| **Estudiante Local** | 10 €/mes | Tu propio ordenador | Ejecución ilimitada en local, validación académica y recibos inmediatos en PDF. | Confirma correo educativo, descarga el modelo en tu equipo y autoriza tarjeta, débito o PayPal sin recargos. |
| **Starter Cloud** | 25 €/mes | Servidores GPU gestionados | 30 h/mes prioritarias, exportaciones enriquecidas y soporte <12 h. | Completa datos de facturación, asigna miembros con GPU y paga con tarjeta, PayPal o SEPA recurrente. |
| **Pro Teams** | 59 €/mes | Infraestructura dedicada | 120 h/mes, reprocesado large-v3, integraciones y gestor técnico. | Aporta orden de compra, configura límites por equipo y elige tarjeta corporativa, transferencia programada o factura anual. |

Cada botón “Elegir plan” abre un resumen modal con los beneficios, los pasos de cobro y un CTA que enlaza al checkout seguro (`https://pay.grabadora.pro/checkout/{plan}`). El modal bloquea el scroll, puede cerrarse con `Escape` o clic fuera y está listo para inyectar lógica real de pago.

### Copiar y pegar todo el flujo

#### Windows (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m scripts.init_db
python -m scripts.doctor
python -m uvicorn app.main:app --reload
```

### Consejos para merges sin dolor

Si resuelves a menudo los mismos conflictos en GitHub, puedes pedirle a Git que
recuerde tus decisiones con `rerere` (reuse recorded resolution). Actívalo una
sola vez en tu máquina y Git repetirá automáticamente las resoluciones que ya
conocen:

```bash
git config --global rerere.enabled true
git config --global rerere.autoUpdate true
```

Cuando aparezca un conflicto nuevo, resuélvelo como siempre, ejecuta `git add`
para marcarlo como solucionado y finaliza el merge/rebase. La próxima vez que
surja la misma colisión Git propondrá tu solución sin que tengas que revisar el
archivo manualmente.

#### Linux / macOS

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m scripts.init_db
python -m scripts.doctor
python -m uvicorn app.main:app --reload
```

### Arrancar la API en modo desarrollo

```bash
python -m uvicorn app.main:app --reload
```

La interfaz quedará disponible en http://127.0.0.1:8000/ y la API en http://127.0.0.1:8000/api/transcriptions.

### Variables de entorno útiles

| Variable | Descripción | Valor por defecto |
| --- | --- | --- |
| `DATABASE_URL` | Cadena de conexión async SQLAlchemy | `sqlite+aiosqlite:///./data/app.db` |
| `SYNC_DATABASE_URL` | Cadena de conexión síncrona | `sqlite:///./data/app.db` |
| `STORAGE_DIR` | Carpeta donde se guardan audios | `data/uploads` |
| `TRANSCRIPTS_DIR` | Carpeta de archivos `.txt` | `data/transcripts` |
| `WHISPER_MODEL_SIZE` | Modelo WhisperX a usar | `large-v3` |
| `WHISPER_DEVICE` | `cuda` o `cpu` | `cuda` |
| `WHISPER_FORCE_CUDA` | Fuerza el uso de CUDA (no cae a CPU si falla) | `false` |
| `ENABLE_DUMMY_TRANSCRIBER` | Usa transcriptor simulado (ideal para pruebas) | `false` |
| `HUGGINGFACE_TOKEN` | Token opcional para descargar el VAD de `pyannote/segmentation` | *(vacío)* |

## Uso de la API

- `POST /api/transcriptions`: Subir un audio (`multipart/form-data`) con campos opcionales `language`, `subject`, `model_size` y `device_preference`.
- `POST /api/transcriptions/batch`: Subida múltiple (`uploads[]`) aplicando la misma configuración a todos los archivos.
- `GET /api/transcriptions`: Listar y buscar transcripciones (`q`, `status`, `premium_only`).
- `GET /api/transcriptions/{id}`: Detalle con segmentos y hablantes.
- `GET /api/transcriptions/{id}/download`: Descarga del `.txt` generado.
- `DELETE /api/transcriptions/{id}`: Eliminación.
- `GET /api/transcriptions/health`: Comprobación rápida del servicio.
- `GET /api/payments/plans`: Listado de planes activos.
- `POST /api/payments/checkout`: Crea un checkout para un plan y una transcripción concreta.
- `POST /api/payments/{id}/confirm`: Marca la compra como completada y desbloquea las notas premium.
- `POST /api/transcriptions/models/prepare`: Garantiza que el modelo seleccionado esté descargado y devuelve el progreso actual.
- `GET /api/transcriptions/models/status`: Consulta el estado (idle, descargando, listo o error) de un modelo/dispositivo concretos.

## Modo estudiante en la web

- Desde el panel principal pulsa **“Abrir simulador independiente”** para lanzar `student.html` en una nueva pestaña.
- La versión educativa sincroniza el texto con el backend cada pocos segundos, escribe con animaciones más pausadas y muestra
  anuncios discretos entre segmentos.
- También puedes acceder directamente navegando a `http://localhost:8000/student.html` cuando el servidor esté activo.

## Benchmarks desde tu base de datos

Utiliza el script `scripts/benchmark_models.py` para comparar la duración real de tus transcripciones frente al tiempo de
ejecución observado. Ejemplos:

```bash
python -m scripts.benchmark_models --models large-v2 large-v3
python -m scripts.benchmark_models --subject historia --export metrics.json
```

El resultado imprime una tabla con número de muestras, duración media, runtime medio y caracteres/segundo para documentar la
mejora obtenida al cambiar de modelo.

## ¿Problemas descargando el VAD de HuggingFace?

Si ves errores `401` o `403` al intentar descargar `pyannote/segmentation`, configura la variable de entorno
`HUGGINGFACE_TOKEN` con tu token personal (`huggingface-cli login`). Cuando no haya token, la aplicación reduce el log a una
advertencia y continúa con el fallback de faster-whisper para evitar bloqueos.

## Docker

### Construir y ejecutar (CPU)

```bash
docker compose up --build
```

El servicio quedará expuesto en http://localhost:8000.

### Ejecutar con GPU

1. Instala [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).
2. Ajusta `docker-compose.gpu.yml` o ejecuta:

```bash
docker compose -f docker-compose.yml --profile gpu up --build
```

> El contenedor ya incluye WhisperX; instala `torch` con soporte CUDA si tu GPU lo requiere.

## Pruebas

```bash
pytest
```

Las pruebas activan el transcriptor simulado para validar el ciclo completo sin depender de WhisperX real e incluyen el flujo de pagos premium.

## Contenido premium y notas IA

Al confirmar una compra, la API genera notas premium automáticamente (`app/utils/notes.py`). El motor actual resume, destaca ideas y propone próximos pasos de manera heurística, listo para que sustituyas la lógica por tu integración favorita (OpenAI, Azure, etc.) cuando habilites cobros reales.

## Ideas de mejora a corto plazo

- **Persistir filtros personalizados:** guardar en `localStorage` la etiqueta, estado y búsqueda seleccionados en la biblioteca para retomar el contexto al volver a entrar. Esto reduce clics repetitivos cuando trabajas con muchas materias.
- **Lector de eventos en tiempo real:** exponer un panel cronológico con los `debug_events` más recientes para seguir el progreso sin abrir cada tarjeta. Ayuda a detectar cuellos de botella o fallos de VAD mientras ocurren.
- **Diagnóstico de dependencias:** detectar avisos como la ausencia de `hf_xet` o la incompatibilidad de `torchaudio` y sugerir la instalación o actualización adecuada desde la interfaz. Prioriza la salud del backend y evita sorpresas en producción.
- **Acciones masivas en carpetas:** permitir descargar, reintentar o borrar en lote todos los elementos de una carpeta o los que coinciden con un filtro determinado. Acelera la higiene de la biblioteca cuando llegan tandas grandes.
- **Anotaciones rápidas por asignatura:** guardar notas o recordatorios asociados a cada carpeta/tema para documentar qué falta por repasar. Mantiene el contexto pedagógico en la misma herramienta.
- **Alertas de calidad en vivo:** añadir métricas de latencia y confianza durante las sesiones de streaming para saber cuándo conviene cambiar de modelo o dispositivo.
- **Respaldo automático de sesiones en vivo:** subir fragmentos firmados al almacenamiento definitivo mientras se graba para mitigar pérdidas si el navegador se cierra o falla la red.
- **Resumen incremental por IA:** generar resúmenes parciales conforme se transcribe para dar feedback inmediato a los alumnos y enfocar la revisión en lo importante.

## Estructura de carpetas

```
app/
  config.py
  database.py
  main.py
  models.py
  routers/
    transcriptions.py
    payments.py
  schemas.py
  utils/
    storage.py
    payments.py
    notes.py
  whisper_service.py
frontend/
  index.html
  styles.css
  app.js
scripts/
  init_db.py
tests/
  test_api.py
```

## Contribuciones

1. Crea una rama descriptiva.
2. Añade tests para nuevas funcionalidades.
3. Ejecuta `pytest` antes de enviar tu PR.

¡Felices transcripciones! 🎙️
