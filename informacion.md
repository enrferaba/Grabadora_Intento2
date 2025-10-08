# Informe del proyecto Grabadora Pro

## 1. Stack actual y entrega incremental
- **Framework principal**: la API se construye con FastAPI/Starlette y sirve la SPA estática desde el mismo proceso. 【F:app/main.py†L5-L39】
- **Streaming en vivo**: hoy emitimos las transcripciones incrementales vía peticiones POST/JSON a `/api/transcriptions/live/sessions/{id}/chunk`, con un búfer de audio que se combina y se procesa en el backend antes de devolver el texto y los segmentos más recientes. 【F:app/routers/transcriptions.py†L579-L640】
- **Plan SSE/WebSocket**: la arquitectura actual facilita reemplazar la respuesta JSON por `EventSourceResponse` para reducir la sobrecarga de pooling. El controlador del *tail* ya separa la lógica de render incremental, de modo que sólo habría que intercambiar la fuente de datos por un `EventSource` o un canal WS.

## 2. Experiencia de lectura en tiempo real
- **Autoscroll inteligente**: el componente `createTailController` mantiene el scroll pegado al final siempre que el usuario no haya subido manualmente, mostrando un botón “Volver al final” cuando detecta que se alejó del último token. 【F:frontend/app.js†L1102-L1159】
- **Cola del MediaRecorder**: en el cliente guardamos cada *chunk* con reintentos exponenciales, recuento de pendientes y latencia medida para que la UI muestre el backlog con precisión. 【F:frontend/app.js†L3412-L3515】
- **Actualización del progreso**: cada respuesta en vivo recalcula WPM, latencia y porcentaje estimado, evitando repeticiones al reconstruir el texto a partir de los segmentos normalizados. 【F:frontend/app.js†L3548-L3593】

## 3. Modelos, GPU y mitigación de repeticiones
- **Motor principal**: usamos `faster-whisper` con CTranslate2 cuando hay GPU disponible, retrocediendo a CPU sólo si el runtime CUDA no está accesible. 【F:app/whisper_service.py†L1261-L1309】
- **Selección automática**: `get_transcriber` evalúa qué backend instanciar y conserva la preferencia del usuario, pero el UI sugiere GPU para modelos grandes. 【F:app/whisper_service.py†L1190-L1239】【F:frontend/app.js†L1084-L1099】
- **Compute type adaptativo**: priorizamos `float16` en GPU y `int8` en CPU, con lista de *fallbacks* para garantizar carga aunque el hardware sea limitado. 【F:app/whisper_service.py†L1287-L1303】
- **Reducción de frases repetidas**: Whisper se ejecuta con `condition_on_previous_text=True` y calentamos el modelo con audio silencioso para estabilizar la decodificación. 【F:app/whisper_service.py†L1332-L1342】

## 4. Flujo offline y persistencia
- **Almacenamiento de audios**: cada subida se guarda en `data/uploads/<id>/<archivo>` y se registra la ruta en BD para reprocesos futuros. 【F:app/routers/transcriptions.py†L500-L576】
- **Metadatos y texto**: SQLAlchemy persiste la transcripción, métricas, eventos de depuración y la ruta al `.txt` generado. 【F:app/models.py†L18-L86】
- **Normalización**: los audios se convierten a 16 kHz mono PCM y se cachean por hash para reutilizar procesados repetidos. 【F:app/utils/storage.py†L53-L113】
- **Formato de salida**: escribimos el `.txt` ensamblado junto con fragmentos por hablante y eventos recientes para diagnóstico. 【F:app/models.py†L52-L85】

## 5. Escalabilidad y colas
- **Estado actual**: el orquestado de trabajos usa tareas en background de FastAPI, suficiente para un nodo.
- **Plan a corto plazo**: migrar esa cola a Redis/RQ o Celery para retener trabajos incluso si el proceso se reinicia y repartir carga entre workers GPU.
- **Persistencia externa**: contemplamos MinIO/S3 para almacenar audio y transcripciones en blobs si el volumen crece; el diseño de `compute_txt_path` y `ensure_storage_subdir` ya encapsula esa ruta para poder sustituirla. 【F:app/utils/storage.py†L13-L52】【F:app/utils/storage.py†L115-L156】

## 6. Multiusuario, seguridad y contención de abusos
- **OAuth**: existe endpoint para iniciar sesión con Google; sólo requiere configurar `GOOGLE_CLIENT_ID/GOOGLE_REDIRECT_URI` para activarlo. 【F:app/routers/auth.py†L10-L27】
- **Límites y métricas**: el frontend muestra contadores de minutos/colas y ya diferencia sesiones en vivo vs. en lote, primera piedra para un sistema de cuotas.
- **Próximos pasos**: añadir autenticación completa (tokens + refresh) y un *rate limit* en los endpoints públicos antes de exponerlos a terceros.

## 7. Testing, herramientas e IDE
- **Pruebas**: hay *fixtures* que ejercitan el ciclo de vida de una transcripción y del servicio whisper usando Pytest. 【F:tests/test_api.py†L43-L122】【F:tests/test_whisper_service.py†L1-L120】
- **Entorno de trabajo**: el equipo desarrolla principalmente en VS Code con formato auto (Prettier/Black) y linters integrados.
- **CI local**: `pytest` y la suite de linting se ejecutan antes de cada commit.

## 8. Despliegue y perfiles GPU
- **Docker Compose**: incluye un servicio `grabadora-gpu` con perfil dedicado que reserva dispositivos CUDA al levantar la pila. 【F:docker-compose.yml†L14-L29】
- **Fallback automático**: si el contenedor GPU no detecta drivers, la aplicación cae de forma segura a CPU manteniendo la cola en curso. 【F:app/whisper_service.py†L1261-L1309】

## 9. Observabilidad y métricas
- **Eventos estructurados**: cada etapa agrega entradas en `debug_events`, visibles desde la UI para diagnosticar descargas, VAD o errores de audio. 【F:app/utils/debug.py†L9-L43】
- **Plan de monitorización**: con esos hooks podemos exportar eventos a Prometheus/Grafana y sumar métricas de latencia, GPU y reintentos.

## 10. Consideraciones legales y de negocio
- **Cumplimiento**: mantenemos sólo los datos necesarios (audio + texto) y planeamos políticas de retención configurables para alinearnos con GDPR.
- **Monetización**: ya hay modelos de precios en BD con *perks*, y la UI lista planes para convertirlos en SaaS. 【F:app/models.py†L88-L150】
- **Roadmap**: preparar un business plan ligero, reforzar términos de servicio y completar soporte multiinquilino antes de abrir beta pública.

## 11. Próximos hitos sugeridos
1. Implementar streaming SSE para el modo en vivo (reutilizando `EventSourceResponse`).
2. Migrar la cola de background a Redis/Celery para tolerancia a fallos.
3. Externalizar audio/transcripciones en almacenamiento compatible S3 con cifrado en reposo.
4. Añadir autenticación completa y cuotas por usuario para el SaaS.
5. Integrar Prometheus + Grafana para observabilidad de GPU, latencias y errores.

Gracias por el feedback; seguiremos iterando para llegar a producción con garantías.
