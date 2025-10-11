"""Minimal worker loop to reprocess transcripts periodically."""
from __future__ import annotations

import logging
import time

from backend_sync.database import session_scope
from backend_sync import models
from . import llm_tasks

logger = logging.getLogger(__name__)


def run_once() -> None:
    with session_scope() as session:
        transcripts = session.query(models.Transcript).all()
        for transcript in transcripts:
            llm_tasks.build_summary(session, transcript.id)
            llm_tasks.build_actions(session, transcript.id)
            llm_tasks.tag_topics(session, transcript.id)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logger.info("Worker loop started")
    while True:
        run_once()
        time.sleep(30)


if __name__ == "__main__":
    main()
