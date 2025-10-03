# Grabadora Pro

Plataforma moderna para transcribir audios con WhisperX, identificar hablantes, guardar resultados en una base de datos consultable y ofrecer una interfaz web lista para desplegar en Docker.

## Características principales

- **API FastAPI** con endpoints para subir audios, consultar, descargar y eliminar transcripciones.
- **Integración con WhisperX** para transcripción rápida y diarización de hablantes (fallback configurable a modo simulado para entornos sin GPU).
- **Base de datos SQLite / SQLAlchemy** con búsqueda por texto, asignatura y estado.
- **Generación automática de archivos `.txt`** y estructura extensible para futuros planes premium con IA externa.
- **Interfaz web** en `/` construida con HTML, CSS y JavaScript moderno que permite subir audios, consultar resultados y revisar hablantes.
- **Dockerfile y docker-compose** para ejecutar el servicio completo (API + frontend) y posibilidad de habilitar GPU.
- **Tests con Pytest** que validan el flujo principal usando un transcriptor simulado.

## Requisitos

- Python 3.10 o superior.
- FFmpeg disponible en la ruta (`apt install ffmpeg` o equivalente).
- Dependencias de base de datos incluidas (por ejemplo, `aiosqlite` para el driver asíncrono de SQLite).
- Para usar WhisperX real: `torch` compatible y opcionalmente GPU con CUDA.

## Instalación local

### Crear entorno virtual

```bash
python -m venv .venv
```

- **Linux / macOS:** `source .venv/bin/activate`
- **Windows (PowerShell):** `.\.venv\Scripts\Activate.ps1`
- **Windows (CMD):** `.\.venv\Scripts\activate.bat`

### Instalar dependencias y preparar la base de datos

```bash
pip install --upgrade pip
pip install -r requirements.txt
python -m scripts.init_db
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
| `WHISPER_MODEL_SIZE` | Modelo WhisperX a usar | `large-v2` |
| `WHISPER_DEVICE` | `cuda` o `cpu` | `cuda` |
| `ENABLE_DUMMY_TRANSCRIBER` | Usa transcriptor simulado (ideal para pruebas) | `false` |

## Uso de la API

- `POST /api/transcriptions`: Subir un audio (`multipart/form-data`) con campos opcionales `language` y `subject`.
- `GET /api/transcriptions`: Listar y buscar transcripciones (`q`, `status`).
- `GET /api/transcriptions/{id}`: Detalle con segmentos y hablantes.
- `GET /api/transcriptions/{id}/download`: Descarga del `.txt` generado.
- `DELETE /api/transcriptions/{id}`: Eliminación.
- `GET /api/transcriptions/health`: Comprobación rápida del servicio.

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

Las pruebas activan el transcriptor simulado para validar el ciclo completo sin depender de WhisperX real.

## Futuras integraciones IA

La arquitectura está preparada para añadir un servicio externo (por ejemplo, GPT) que genere resúmenes o apuntes premium:

- Añade un nuevo campo `premium_notes` a `Transcription`.
- Implementa un servicio en `app/utils/ai.py` que consuma tu API favorita.
- Expón un endpoint `POST /api/transcriptions/{id}/notes` que encola una tarea asíncrona para generar los apuntes.

## Estructura de carpetas

```
app/
  config.py
  database.py
  main.py
  models.py
  routers/
    transcriptions.py
  schemas.py
  utils/
    storage.py
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
