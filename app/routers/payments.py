from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_session
from ..models import PaymentStatus, PricingTier, Purchase, Transcription
from ..schemas import CheckoutRequest, PricingTierSchema, PurchaseDetail, PurchaseResponse
from ..utils.payments import generate_checkout_link
from ..utils.notes import generate_premium_notes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


def _get_session() -> Session:
    with get_session() as session:
        yield session


@router.get("/plans", response_model=List[PricingTierSchema])
def list_pricing_plans(session: Session = Depends(_get_session)) -> List[PricingTierSchema]:
    tiers = (
        session.query(PricingTier)
        .filter(PricingTier.is_active.is_(True))
        .order_by(PricingTier.price_cents.asc())
        .all()
    )
    return [PricingTierSchema.from_orm(tier) for tier in tiers]


@router.post("/checkout", response_model=PurchaseResponse, status_code=201)
def create_checkout(
    payload: CheckoutRequest,
    session: Session = Depends(_get_session),
) -> PurchaseResponse:
    tier = session.query(PricingTier).filter_by(slug=payload.tier_slug, is_active=True).first()
    if not tier:
        raise HTTPException(status_code=404, detail="Plan de precios no encontrado")

    transcription: Transcription | None = None
    if payload.transcription_id is not None:
        transcription = session.get(Transcription, payload.transcription_id)
        if transcription is None:
            raise HTTPException(status_code=404, detail="Transcripción no encontrada")

    purchase = Purchase(
        tier=tier,
        transcription=transcription,
        amount_cents=tier.price_cents,
        currency=tier.currency,
        customer_email=payload.customer_email,
        extra_metadata={"minutes_limit": tier.max_minutes, "perks": tier.perks},
    )
    session.add(purchase)
    session.flush()

    purchase.payment_url = generate_checkout_link(purchase)
    session.commit()

    logger.info("Checkout creado para el plan %s (purchase=%s)", tier.slug, purchase.id)

    return PurchaseResponse(
        id=purchase.id,
        status=PaymentStatus(purchase.status),
        amount_cents=purchase.amount_cents,
        currency=purchase.currency,
        payment_url=purchase.payment_url or "",
        tier_slug=tier.slug,
        transcription_id=payload.transcription_id,
    )


@router.get("/{purchase_id}", response_model=PurchaseDetail)
def get_purchase(purchase_id: int, session: Session = Depends(_get_session)) -> PurchaseDetail:
    purchase = session.get(Purchase, purchase_id)
    if purchase is None:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    return PurchaseDetail(
        id=purchase.id,
        status=PaymentStatus(purchase.status),
        amount_cents=purchase.amount_cents,
        currency=purchase.currency,
        payment_url=purchase.payment_url or "",
        tier_slug=purchase.tier.slug,
        transcription_id=purchase.transcription_id,
        provider=purchase.provider,
        extra_metadata=purchase.extra_metadata,
    )


@router.post("/{purchase_id}/confirm", response_model=PurchaseDetail)
def confirm_purchase(purchase_id: int, session: Session = Depends(_get_session)) -> PurchaseDetail:
    purchase = session.get(Purchase, purchase_id)
    if purchase is None:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    if purchase.status == PaymentStatus.COMPLETED.value:
        return get_purchase(purchase_id, session=session)

    purchase.status = PaymentStatus.COMPLETED.value
    session.add(purchase)

    transcription = purchase.transcription
    if transcription is not None:
        transcription.premium_enabled = True
        transcription.price_cents = purchase.amount_cents
        transcription.currency = purchase.currency
        transcription.premium_perks = (
            purchase.extra_metadata.get("perks") if purchase.extra_metadata else None
        )
        transcription.billing_reference = f"ORDER-{purchase.id:06d}"
        if not transcription.premium_notes:
            transcription.premium_notes = generate_premium_notes(transcription.text or "")

    session.commit()

    logger.info("Compra %s confirmada", purchase_id)
    return get_purchase(purchase_id, session=session)
