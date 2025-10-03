# Grabadora Pro

Plataforma moderna para transcribir audios con WhisperX, identificar hablantes, guardar resultados en una base de datos consultable y ofrecer una interfaz web lista para desplegar en Docker.

## Características principales

- **API FastAPI** con endpoints para subir audios en lote, consultar, descargar y eliminar transcripciones.
- **Integración con WhisperX** para transcripción rápida y diarización de hablantes (fallback configurable a modo simulado para entornos sin GPU).
- **Base de datos SQLite / SQLAlchemy** con búsqueda por texto, asignatura y estado.
- **Generación automática de archivos `.txt`** y estructura extensible para futuros planes premium con IA externa.
- **Interfaz web** en `/` construida con HTML, CSS y JavaScript moderno que permite subir varios audios a la vez, consultar resultados y revisar hablantes.
- **Pasarela de pago simulada** con planes configurables, checkout y confirmación de compras que desbloquean contenido premium por transcripción.
- **Inicio de sesión con Google (OAuth 2.0)** listo para conectar con tus credenciales y personalizar la experiencia del dashboard.
- **Dockerfile y docker-compose** para ejecutar el servicio completo (API + frontend) y posibilidad de habilitar GPU.
- **Tests con Pytest** que validan el flujo principal usando un transcriptor simulado.

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
| `WHISPER_MODEL_SIZE` | Modelo WhisperX a usar | `large-v2` |
| `WHISPER_DEVICE` | `cuda` o `cpu` | `cuda` |
| `ENABLE_DUMMY_TRANSCRIBER` | Usa transcriptor simulado (ideal para pruebas) | `false` |

## Uso de la API

- `POST /api/transcriptions`: Subir un audio (`multipart/form-data`) con campos opcionales `language`, `subject`, `price_cents` y `currency`.
- `POST /api/transcriptions/batch`: Subida múltiple (`uploads[]`) aplicando la misma configuración a todos los archivos.
- `GET /api/transcriptions`: Listar y buscar transcripciones (`q`, `status`, `premium_only`).
- `GET /api/transcriptions/{id}`: Detalle con segmentos y hablantes.
- `GET /api/transcriptions/{id}/download`: Descarga del `.txt` generado.
- `DELETE /api/transcriptions/{id}`: Eliminación.
- `GET /api/transcriptions/health`: Comprobación rápida del servicio.
- `GET /api/payments/plans`: Listado de planes activos.
- `POST /api/payments/checkout`: Crea un checkout para un plan y una transcripción concreta.
- `POST /api/payments/{id}/confirm`: Marca la compra como completada y desbloquea las notas premium.

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

Al confirmar una compra, la API genera notas premium automáticamente (`app/utils/notes.py`). Sustituye esta lógica por tu integración favorita (OpenAI, Azure, etc.) y marca los planes para ofrecer ventajas adicionales.

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
