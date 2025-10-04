from __future__ import annotations

try:
    import app.compat  # noqa: F401  # aplica los parches de compatibilidad antes de otras importaciones
    from app.database import Base, get_session, sync_engine
    from app.models import PricingTier
except ModuleNotFoundError as exc:  # pragma: no cover - depende del entorno del usuario final
    missing = exc.name or ""
    instructions = [
        "No se pudieron importar las dependencias necesarias para inicializar la base de datos.",
        "Asegúrate de activar tu entorno virtual y reinstalar los requisitos:",
        "  python -m venv .venv",
        "  # PowerShell: .\\.venv\\Scripts\\Activate.ps1",
        "  # CMD: .\\.venv\\Scripts\\activate.bat",
        "  python -m pip install --upgrade pip",
        "  python -m pip install -r requirements.txt",
    ]
    if missing:
        instructions.insert(1, f"Módulo faltante: {missing}")
    raise SystemExit("\n".join(instructions)) from exc


def main() -> None:
    Base.metadata.create_all(bind=sync_engine)
    with get_session() as session:
        if session.query(PricingTier).count() == 0:
            session.add_all(
                [
                    PricingTier(
                        slug="student-local",
                        name="Plan Estudiante Local",
                        description="Corre Whisper en tu ordenador con anuncios ligeros y sin coste.",
                        price_cents=0,
                        currency="EUR",
                        max_minutes=120,
                        perks=[
                            "Anuncios discretos en la aplicación",
                            "Procesamiento en tu propio ordenador",
                            "Sin cuotas mensuales",
                        ],
                    ),
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
