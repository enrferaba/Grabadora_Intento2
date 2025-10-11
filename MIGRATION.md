# Guía de migraciones de base de datos

Este proyecto utiliza [Alembic](https://alembic.sqlalchemy.org/) para versionar el esquema de la base de datos.
Las instrucciones siguientes cubren escenarios comunes para entornos de desarrollo (SQLite) y producción
(PostgreSQL).

## Requisitos previos

* Python 3.11 con las dependencias del proyecto instaladas (`pip install -r requirements.txt`).
* Acceso al fichero `.env` o variables de entorno que definan `DATABASE_URL`.
* Cliente de PostgreSQL (`psql`) cuando se opere sobre un servidor Postgres gestionado.

## Ejecutar migraciones

1. Exporta/configura las variables de entorno necesarias (`cp .env.example .env` como base).
2. Ejecuta las migraciones pendientes:

   ```bash
   alembic upgrade head
   ```

   El comando utilizará `DATABASE_URL` si está definido; de lo contrario aplicará el valor por defecto definido en
   `backend_sync.config.Settings`.

## Migrar de SQLite a PostgreSQL

1. **Genera un volcado** de tu base de datos SQLite actual:

   ```bash
   sqlite3 data/backend.db ".mode insert" ".output sqlite_dump.sql" ".dump" ".exit"
   ```

2. **Prepara la base de datos Postgres** vacía:

   ```bash
   createdb grabadora_pro
   ```

3. **Aplica el esquema** en Postgres mediante Alembic apuntando al nuevo `DATABASE_URL`:

   ```bash
   export DATABASE_URL=postgresql+psycopg://user:password@host:5432/grabadora_pro
   alembic upgrade head
   ```

4. **Importa los datos** desde el volcado SQLite (opcional). Revisa y adapta los tipos cuando sea necesario:

   ```bash
   psql "$DATABASE_URL" -f sqlite_dump.sql
   ```

5. **Verifica** que las tablas `transcripts`, `segments`, `actions` y `audit_events` contienen los registros esperados.

## Generar nuevas migraciones

1. Realiza los cambios en los modelos de SQLAlchemy.
2. Ejecuta `alembic revision --autogenerate -m "descripcion"`.
3. Revisa el fichero creado en `alembic/versions/` y ajústalo si es necesario.
4. Ejecuta `alembic upgrade head` y añade el archivo a tu commit.

## Resolución de problemas

* Usa `alembic history --verbose` para inspeccionar el árbol de migraciones.
* Si una migración falla, puedes regresar temporalmente con `alembic downgrade -1`.
* Para depurar conexiones, establece `SQLALCHEMY_ECHO=1` antes de correr Alembic.

