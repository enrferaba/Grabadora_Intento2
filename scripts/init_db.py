from __future__ import annotations

from app.database import Base, get_session, sync_engine
from app.models import PricingTier


def main() -> None:
    Base.metadata.create_all(bind=sync_engine)
    with get_session() as session:
        if session.query(PricingTier).count() == 0:
            session.add_all(
                [
                    PricingTier(
                        slug="starter-15",
                        name="Starter 15",
                        description="Hasta 15 minutos por archivo, ideal para entrevistas cortas.",
                        price_cents=799,
                        currency="EUR",
                        max_minutes=15,
                        perks=["Notas básicas", "Descarga TXT inmediata"],
                    ),
                    PricingTier(
                        slug="pro-60",
                        name="Plan Pro 60",
                        description="Sesiones completas con diarización avanzada y notas IA.",
                        price_cents=1499,
                        currency="EUR",
                        max_minutes=60,
                        perks=["Notas IA", "Diarización avanzada", "Exportación SRT"],
                    ),
                ]
            )
            session.commit()
    print("Database initialized")


if __name__ == "__main__":
    main()
