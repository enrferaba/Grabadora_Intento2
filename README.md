# Transcripción Local con Sincronización Inteligente

> **Promesa al cliente:** “Grabamos la reunión en tu PC, transcribimos localmente en tiempo real, sacamos tareas y resúmenes, y sincronizamos solo texto y metadatos a tu panel y al CRM. Nada de audio sale de tu máquina salvo que tú lo actives”.

El repositorio entrega todos los componentes necesarios para ejecutar esa promesa en entornos empresariales: un agente local que procesa audio en tiempo real con Whisper acelerado, un backend de sincronización con FastAPI/SQLAlchemy, workers heurísticos que emulan a los LLM y un `docker-compose` listo para desplegar en on-premises o en la nube privada. Se incluyen scripts de empaquetado, colas persistentes y documentación operativa para acelerar implementaciones pilotas, profesionales y enterprise.

## Tabla de contenidos
1. [Arquitectura](#arquitectura)
2. [Flujo principal](#flujo-principal)
3. [Agente Local](#agente-local)
4. [Backend Sync](#backend-sync)
5. [UI Web y conectores](#ui-web-y-conectores)
6. [Esquemas de datos](#esquemas-de-datos)
7. [Endpoints y mensajes](#endpoints-y-mensajes)
8. [LLM y prompts](#llm-y-prompts)
9. [Rendimiento](#rendimiento)
10. [Seguridad y privacidad](#seguridad-y-privacidad)
11. [Instalación y despliegue](#instalación-y-despliegue)
12. [Observabilidad](#observabilidad)
13. [QA y criterios de aceptación](#qa-y-criterios-de-aceptación)
14. [Roadmap](#roadmap)
15. [Precios y empaquetado](#precios-y-empaquetado)
16. [Riesgos y mitigaciones](#riesgos-y-mitigaciones)
17. [Pseudocódigo clave](#pseudocódigo-clave)
18. [Checklist para otra IA](#checklist-para-otra-ia)
19. [Guía de contribución](#guía-de-contribución)

## Arquitectura

| Componente | Tecnologías | Responsabilidad |
| --- | --- | --- |
| **Agente Local** | Python 3.11, `faster-whisper`, `numpy`, VAD (`webrtcvad` opcional), SQLite | Captura audio local, segmenta con VAD, ejecuta ASR incremental, crea deltas `{segment.upsert}` y los guarda en una cola duradera con estados `queued/sent/acked`. Exporta Markdown/SRT/JSON al finalizar. |
| **Backend Sync** | FastAPI, SQLAlchemy 2.0, JWT (`PyJWT`), WebSockets, Postgres/SQLite | Recibe parches por WS, aplica estrategia LWW, persiste transcripciones, expone endpoints REST, coordina workers y conectores. |
| **Workers LLM** | Python, heurísticas plug-in reemplazables | Resume, extrae acciones con due dates prudentes e identifica temas. Pensados para ejecutarse on-prem o en GPU local cuando se integre un modelo cuantizado (Llama 3 8B / Mistral 7B vía llama.cpp o vLLM). |
| **UI Web (pendiente)** | SPA React/WS | Consumirá `/sync` para transcripción en vivo, `/transcripts` para listado, `/connectors` para push a CRM/Notion/Trello y `/transcripts/:id/export` para exportaciones. |

Principio sagrado: el audio nunca abandona la máquina sin consentimiento explícito. El backend maneja únicamente texto, metadatos y eventos de auditoría.

## Flujo principal

1. El usuario pulsa “Grabar” en el agente (`agent_local.session.LocalAgent`).
2. Capturamos audio (mono, 16 kHz) y aplicamos VAD con `frame_duration_ms=30`, `min_speech_ms=350`, `min_silence_ms=200` (`agent_local.vad`).
3. Cada chunk se transcribe con `beam_size=1`, `temperature=[0.0, 0.2]`, `patience=0`, `vad_filter=True`, `word_timestamps=True`, `compression_ratio_threshold=2.6` (`agent_local.asr`).
4. Se generan deltas `{type:"segment.upsert", transcript_id, segment_id, rev, text, t0, t1, conf}` y se encolan en SQLite con estados (`agent_local.queue`).
5. El agente envía los parches por WebSocket (`agent_local.sync.SyncClient`) y espera ACK. Si no hay red, la cola persiste y `flush()` reintenta con backoff exponencial al volver la conexión.
6. El backend (`backend_sync.api.sync_ws`) valida la organización, persiste segmentos (`backend_sync.models.Segment`) y dispara workers (`workers.llm_tasks`).
7. La UI refleja el streaming mediante WebSocket, permite editar texto/tareas y exportar PDF/Markdown/SRT.
8. Conectores (`/connectors/{target}/push`) sincronizan notas y acciones con CRM/Notion/Trello.

## Agente Local

- **Detección de hardware** (`agent_local.hardware.detect_hardware`): prioriza GPU Nvidia (`compute_type="int8_float16"`) o cae a CPU (`int8`).
- **ASR incremental** (`agent_local.asr.IncrementalTranscriber`): mantiene el modelo cargado durante toda la sesión; usa `faster-whisper` cuando está disponible y un modo simulado cuando no.
- **VAD híbrido** (`agent_local.vad`): usa `webrtcvad` si está instalado, de lo contrario energía RMS con umbrales configurables.
- **Cola local** (`agent_local.queue.DeltaQueue`): SQLite con schema `seq`, `payload`, `state`, `created_at`, `updated_at`. Métodos `enqueue`, `mark_sent`, `mark_acked`, `list_pending`, `list_all`.
- **Sincronización robusta** (`agent_local.sync.SyncClient`): transport plug-and-play (WebSocket real o `TestTransport`). Marca `sent` antes de enviar y `acked` tras respuesta `{type:"ack", seq}`. `flush()` procesa backlog completo.
- **Exportaciones automáticas** (`agent_local.session.LocalAgent.export_session`): genera `session.md`, `session.srt`, `session.json` con todos los deltas (incluso acked) en `storage_dir/exports/`.
- **Privacidad**: `AgentConfig.upload_audio=False` por defecto. Las rutas locales se definen por organización.

### Ejecutar solo el agente

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python - <<'PY'
from pathlib import Path
from agent_local.config import AgentConfig
from agent_local.session import LocalAgent

config = AgentConfig(
    transcript_id="tr_demo",
    org_id="org_demo",
    storage_dir=Path("./data/local"),
    websocket_url="ws://localhost:8000/sync",
    jwt="<TOKEN_JWT>"
)
agent = LocalAgent(config)
# alimentar audio, llamar a agent.process_audio(...) + agent.flush()
PY
```

## Backend Sync

- **FastAPI + SQLAlchemy** (`backend_sync/main.py`, `backend_sync/models.py`).
- **JWT** (`backend_sync/security.py`): `POST /auth/login` genera access y refresh tokens.
- **Persistencia**: tablas `transcripts`, `segments`, `actions`, `audit_events` (timestamps y trazabilidad completa).
- **WebSocket `/sync`** (`backend_sync/api/sync_ws.py`): valida JWT, aplica LWW (`segment.rev`), registra auditoría y lanza workers. Soporta `segment.upsert`, `segment.delete`, `meta.update`.
- **REST** (`backend_sync/api/http.py`):
  - `POST /transcripts` crea sesiones.
  - `GET /transcripts/{id}` recupera metadatos.
  - `GET /transcripts/{id}/summary` devuelve bullets + bloque “Riesgos/Dependencias”.
  - `GET /transcripts/{id}/actions` sincroniza acciones (`status=open`).
  - `GET /transcripts/{id}/export?fmt=md|srt|json` exporta texto.
  - `POST /connectors/{target}/push` deja listo el push a HubSpot, Pipedrive, Notion o Trello.
- **Workers heurísticos** (`workers/llm_tasks.py`): resumen, extracción de acciones (verbos “enviar/preparar/programar”), clasificación de temas y auditoría.
- **Servicio Worker** (`workers/service.py`): lazo simple cada 30 s para reconstruir resúmenes y acciones.

## UI Web y conectores

El repositorio expone el contrato para la SPA:

- WebSocket `/sync` para streaming.
- Endpoints REST descritos arriba para listado, resumen, acciones y export.
- `POST /connectors/:target/push` para orquestar integraciones HubSpot/Pipedrive/Notion/Trello.

Puedes implementar la SPA con React (tabla virtualizada, filtros por speaker/confianza/keyword, edición inline, botón “Regenerar resumen”). La política de privacidad, retención y selección de modelos se configura mediante endpoints de metadatos (`meta.update`).

## Esquemas de datos

```json
// Delta agente -> backend
{
  "type": "segment.upsert",
  "seq": 1842,
  "transcript_id": "tr_7f2",
  "segment_id": "sg_000123",
  "rev": 3,
  "t0": 125.40,
  "t1": 132.18,
  "text": "La corona se regula en el título segundo...",
  "speaker": "S1",
  "conf": 0.86,
  "meta": {"lang": "es"}
}

// Acción detectada por LLM
{
  "id": "ac_9a1",
  "transcript_id": "tr_7f2",
  "text": "Marta enviará el presupuesto antes del martes",
  "owner": "Marta",
  "due": "2025-10-14",
  "source_span": {"from": 812.2, "to": 835.0},
  "status": "open"
}
```

## Endpoints y mensajes

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/auth/login` | Devuelve `access_token` JWT (15 min) y `refresh_token` (24 h). |
| `POST` | `/transcripts` | Crea registro de transcripción, retorna `transcript_id`. |
| `GET` | `/transcripts/{id}` | Recupera metadatos. |
| `GET` | `/transcripts/{id}/summary` | Resumen en bullets + bloque “Riesgos/Dependencias”. |
| `GET` | `/transcripts/{id}/actions` | Lista de acciones `status=open`. |
| `GET` | `/transcripts/{id}/export?fmt=md|srt|json` | Exportaciones.
| `POST` | `/connectors/{target}/push` | Encola envío a CRM/Notion/Trello. |
| `WS` | `/sync` | Recibe `segment.upsert|delete`, `meta.update`; responde `ack`, `summary.update`, `actions.upsert` (hookeable). |

## LLM y prompts

- Modelos locales recomendados: Llama 3 8B o Mistral 7B en Q4_K_M con llama.cpp/vLLM. `workers/llm_tasks.py` expone punto único para reemplazar heurísticas por invocaciones reales.
- Prompts sugeridos:
  - `extract_actions`: JSON `{owner?, verb, task, due? ISO, evidence_span}`. Inferencia prudente: `hoy+7` para “esta semana”, `hoy+1` para “mañana”. Confianza <0.65 no genera acción.
  - `summarize`: 5 bullets, hechos + decisiones + bloque final “Riesgos/Dependencias”.
  - `crm_note`: nota concisa con contexto, necesidades, próximos pasos.
- Límite duro 2.5k tokens por lote, ventana deslizante con solape 10 %. Batch cada 30–60 s o 20 segmentos nuevos.

## Rendimiento

- ASR optimizado: `beam_size=1`, `temperature=[0.0, 0.2]`, `vad_filter=True`, `word_timestamps=True`, chunks 8–12 s.
- Compute type: GPU → `int8_float16`, CPU → `int8`.
- Memoria mínima: modelos tiny/base/small funcionan con 8–12 GB RAM y GPU modesta. Medium requiere más VRAM.
- VAD: `frame_duration_ms=30`, `min_speech_len_ms=350`, `min_silence_ms=200`.
- Exportación local: `session.md`, `session.srt`, `session.json` por sesión.
- Garantías QA: RTF ≤ 0.6 en GPU modesta (`small`); ≤ 1.2 en CPU. Latencia delta ≤ 500 ms en LAN; reconexión WS < 3 s.

## Seguridad y privacidad

- Audio fuera solo bajo `AgentConfig.upload_audio=True` con cifrado TLS y borrado programado.
- JWT de corta vida + refresh tokens (`backend_sync/security.py`).
- TLS recomendado en despliegues productivos. DB cifrada con AES-GCM cuando el cliente lo exija.
- Auditoría completa (`audit_events`). Política de retención configurable (ejemplo: auto-borrado 90 días).
- Redacción de PII opcional en logs (hook en workers).

## Instalación y despliegue

### Dependencias

- Python 3.11+
- FFmpeg en PATH
- Opcional: GPU Nvidia + CUDA para aceleración

### Instalación rápida (desarrollo)

```bash
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
uvicorn backend_sync.main:app --reload
```

### Docker Compose

```bash
docker compose up --build backend
# worker opcional: docker compose --profile worker up --build
```

Variables clave:
- `DATABASE_URL` (por defecto `sqlite+pysqlite:///./data/backend.db`).
- `DATA_DIR` (`./data`).
- `JWT_SECRET` (cambia en producción).
- `ASR_AUDIO_UPLOAD` (flag futuro para subir audio en on-demand).

### Empaquetado del agente

- Usa PyInstaller `onefile` sobre `agent_local`.
- Arranque en bandeja del sistema, auto-actualizaciones vía canal controlado.

## Observabilidad

- Métricas sugeridas: RTF por sesión, latencia de delta, tasa de reconexiones WS, backlog cola local (>500 parches alerta).
- Trazas: `capture → VAD → ASR → delta → LLM → connectors`, correlacionadas por `transcript_id`.
- Alertas: caída WS, worker >60 s, backlog cola >500.

## QA y criterios de aceptación

- RTF ≤ 0.6 (`small` GPU), ≤ 1.2 en CPU.
- Latencia delta ≤ 500 ms LAN, reconexión WS < 3 s.
- Acciones: precisión ≥ 0.8 en dataset de tareas explícitas.
- Sin pérdidas: segmentos offline se reenvían al restaurar red (gracias a `DeltaQueue`).

## Roadmap

1. **Fase 1 (0–4 semanas):** Agente + Sync + resumen + tareas + export + conectores Trello/Notion.
2. **Fase 2 (4–8 semanas):** Conectores CRM, plantillas sectoriales, diarización con embeddings, búsqueda semántica (pg_trgm/Meilisearch).
3. **Fase 3 (8–12 semanas):** Compliance avanzado, scoring de llamadas, multiorganización, instalador MSI firmado.

## Precios y empaquetado

| Plan | Precio | Audio incluido | Observaciones |
| --- | --- | --- | --- |
| Piloto | 990 € setup + 390 €/mes | 20 h/mes | Extra 6 €/h procesada. |
| Pro | 690 €/mes | 10 usuarios, 60 h/mes | On-prem opcional 1.900 € setup. |
| Enterprise | Personalizado | SLA dedicado | Soporte y compliance extendido. |

## Riesgos y mitigaciones

- **PCs limitados:** modelos tiny/base + menor frecuencia de workers.
- **Audio deficiente:** normalización, VAD agresivo, guía de uso.
- **Conectividad:** cola local robusta + reintentos exponenciales.
- **PII:** redacción configurable, logging minimalista.

## Pseudocódigo clave

```python
# Agente Local
mdl = load_faster_whisper(model="small", device=autodetect())
ws = connect_ws(url, jwt)
for chunk in vad_stream(mic_source(), win_ms=30):
    segs = asr.transcribe(chunk)
    for s in segs:
        delta = mk_delta(transcript_id, s)
        enqueue_local(delta)
        try_send(ws, delta)

# Backend WS
@ws.on_message
def handle(msg):
    if msg.type == "segment.upsert":
        upsert_segment(msg.transcript_id, msg.segment_id, msg.rev, msg.payload)
        ws.send({"type": "ack", "seq": msg.seq})
        schedule_llm_if_needed(msg.transcript_id)
```

## Checklist para otra IA

- [x] Crear repos `agent_local`, `backend_sync`, `workers`.
- [x] Captura + VAD + ASR incremental.
- [x] Cola local SQLite con ACKs y reintentos.
- [x] WebSocket `/sync` con LWW.
- [x] Tablas `transcripts`, `segments`, `actions`, `audit_events`.
- [x] Worker heurístico con prompts descritos.
- [x] Contrato de UI (streaming, edición, export MD/PDF/SRT, conectores).
- [x] Métricas y trazas básicas.
- [x] Docker Compose backend + worker.
- [x] Política por defecto: no subir audio.
- [x] Tests automáticos (`pytest`).

## Guía de contribución

1. Ejecuta `pytest` antes de abrir PR.
2. Documenta nuevas opciones en este README.
3. Mantén el código del agente libre de dependencias obligatorias no multiplataforma.
4. Usa la nomenclatura `segment_id`, `transcript_id`, `rev` en todas las capas para preservar idempotencia.
5. Aporta métricas de rendimiento cuando modifiques el pipeline ASR/LLM.

¡Gracias por contribuir a una transcripción privada, veloz y sincronizada!
