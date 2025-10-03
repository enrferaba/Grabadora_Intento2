from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/google/login")
def google_login() -> dict[str, str]:
    cfg = get_settings()
    client_id = cfg.google_client_id
    redirect_uri = cfg.google_redirect_uri
    if not client_id or not redirect_uri:
        raise HTTPException(
            status_code=400,
            detail="Configura GOOGLE_CLIENT_ID y GOOGLE_REDIRECT_URI para habilitar el inicio de sesión con Google.",
        )

    base_url = "https://accounts.google.com/o/oauth2/v2/auth"
    scope = "openid email profile"
    authorization_url = (
        f"{base_url}?client_id={client_id}&redirect_uri={redirect_uri}&response_type=code"
        f"&scope={scope}&access_type=offline&prompt=select_account"
    )
    return {"authorization_url": authorization_url}
