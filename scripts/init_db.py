from __future__ import annotations

from app.database import Base, sync_engine


def main() -> None:
    Base.metadata.create_all(bind=sync_engine)
    print("Database initialized")


if __name__ == "__main__":
    main()
