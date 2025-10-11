"""baseline schema for transcripts and related tables"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20240507_01_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transcripts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("org_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("lang", sa.String(), nullable=False, server_default="es"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_transcripts_org_id", "transcripts", ["org_id"])

    op.create_table(
        "segments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("transcript_id", sa.String(), nullable=False),
        sa.Column("segment_id", sa.String(), nullable=False),
        sa.Column("rev", sa.Integer(), nullable=False),
        sa.Column("t0", sa.Float(), nullable=False),
        sa.Column("t1", sa.Float(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("speaker", sa.String(), nullable=True),
        sa.Column("conf", sa.Float(), nullable=True),
        sa.Column("last_write_ts", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["transcript_id"], ["transcripts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("transcript_id", "segment_id", name="uix_segment"),
    )
    op.create_index("ix_segments_transcript_id", "segments", ["transcript_id"])
    op.create_index("ix_segments_segment_id", "segments", ["segment_id"])

    op.create_table(
        "actions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("transcript_id", sa.String(), nullable=False),
        sa.Column("owner", sa.String(), nullable=True),
        sa.Column("due", sa.String(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source_from", sa.Float(), nullable=True),
        sa.Column("source_to", sa.Float(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.ForeignKeyConstraint(["transcript_id"], ["transcripts.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_actions_transcript_id", "actions", ["transcript_id"])

    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("transcript_id", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["transcript_id"], ["transcripts.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_audit_events_transcript_id", "audit_events", ["transcript_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_transcript_id", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_actions_transcript_id", table_name="actions")
    op.drop_table("actions")
    op.drop_index("ix_segments_segment_id", table_name="segments")
    op.drop_index("ix_segments_transcript_id", table_name="segments")
    op.drop_table("segments")
    op.drop_index("ix_transcripts_org_id", table_name="transcripts")
    op.drop_table("transcripts")
