from __future__ import annotations

from uuid import uuid4

from ..models import Purchase


def generate_checkout_link(purchase: Purchase) -> str:
    """Genera una URL simulada para redirigir al usuario a un checkout externo."""
    token = uuid4().hex
    return f"https://payments.grabadora.pro/checkout/{purchase.id}-{token}"
