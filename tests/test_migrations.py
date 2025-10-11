from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import sessionmaker

from backend_sync import models

ROOT = Path(__file__).resolve().parents[1]


def _upgrade(database_url: str) -> None:
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")


def test_alembic_creates_schema(tmp_path) -> None:
    db_url = f"sqlite+pysqlite:///{tmp_path / 'blank.sqlite'}"
    _upgrade(db_url)

    engine = create_engine(db_url, future=True)
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    assert {"transcripts", "segments", "actions", "audit_events"}.issubset(tables)


def test_alembic_preserves_existing_rows(tmp_path) -> None:
    db_path = tmp_path / "data.sqlite"
    db_url = f"sqlite+pysqlite:///{db_path}"
    _upgrade(db_url)

    engine = create_engine(db_url, future=True)
    Session = sessionmaker(bind=engine, expire_on_commit=False, future=True)

    with Session() as session:
        transcript = models.Transcript(id="tr_test", org_id="org", title="Demo", status="active", lang="es")
        session.add(transcript)
        session.flush()
        session.add(
            models.Segment(
                transcript_id="tr_test",
                segment_id="sg_1",
                rev=1,
                t0=0.0,
                t1=5.0,
                text="hola",
            )
        )
        session.add(
            models.Action(
                id="ac_1",
                transcript_id="tr_test",
                text="Revisar acta",
                status="open",
            )
        )
        session.commit()

    _upgrade(db_url)

    with Session() as session:
        segments = session.execute(
            select(models.Segment).where(models.Segment.transcript_id == "tr_test")
        ).scalars().all()
        assert segments, "Segments should remain after reapplying head migration"
