from __future__ import annotations

import importlib
import platform
import shutil
import sys
from dataclasses import dataclass
from typing import Iterable, List

try:  # pragma: no cover - solo garantiza parches en tiempo de ejecución
    import app.compat  # noqa: F401
except Exception:  # pragma: no cover - entorno mínimo puede no tener el paquete
    pass


REQUIRED_MODULES: List[str] = [
    "sqlalchemy",
    "uvicorn",
    "fastapi",
    "whisperx",
    "numpy",
]


@dataclass
class ModuleStatus:
    name: str
    installed: bool
    detail: str | None = None


def inspect_modules(modules: Iterable[str] = REQUIRED_MODULES) -> List[ModuleStatus]:
    statuses: List[ModuleStatus] = []
    for name in modules:
        try:
            importlib.import_module(name)
        except ModuleNotFoundError as exc:  # pragma: no cover - depends on user env
            statuses.append(ModuleStatus(name=name, installed=False, detail=str(exc)))
        else:
            statuses.append(ModuleStatus(name=name, installed=True))
    return statuses


def print_report(statuses: Iterable[ModuleStatus]) -> int:
    missing = [status for status in statuses if not status.installed]
    print("Python:", sys.version)
    print("Platform:", platform.platform())
    print()
    for status in statuses:
        if status.installed:
            print(f"  ✓ {status.name}")
        else:
            print(f"  ✗ {status.name} — {status.detail}")
    print()
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        print(f"ffmpeg: {ffmpeg_path}")
    else:
        print("ffmpeg: no encontrado en el PATH (instala FFmpeg o coloca el binario junto a la app)")

    if not missing:
        print()
        print("Todo listo. Puedes inicializar la base de datos y arrancar la API:")
        print("  python -m scripts.init_db")
        print("  python -m uvicorn app.main:app --reload")
        print()
        print("Inicio de sesión con Google opcional: exporta GOOGLE_CLIENT_ID y GOOGLE_REDIRECT_URI si quieres habilitarlo.")
        return 0

    print()
    print("Faltan dependencias de Python. Activa tu entorno virtual e instala los requisitos:")
    print("  python -m venv .venv")
    if platform.system() == "Windows":
        print("  .\\.venv\\Scripts\\activate")
    else:
        print("  source .venv/bin/activate")
    print("  python -m pip install --upgrade pip")
    print("  python -m pip install -r requirements.txt")
    return 1


def main() -> None:
    statuses = inspect_modules()
    exit_code = print_report(statuses)
    sys.exit(exit_code)


if __name__ == "__main__":  # pragma: no cover - manual invocation
    main()
