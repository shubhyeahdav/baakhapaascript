import os

from fastapi import APIRouter, Depends, HTTPException, Request

import payments
import subscription_service
from auth import get_current_user
from database import get_user_by_id
from models import CheckoutRequest, VerifyPaymentRequest

router = APIRouter(prefix="/subscription", tags=["subscription"])


def _origin(request: Request) -> str:
    return request.headers.get("origin") or os.getenv("FRONTEND_URL", "http://localhost:3000")


@router.get("/providers")
def providers():
    """What the pricing page should offer, and which of them are live.

    Nepal is the market and Stripe cannot charge most Nepali cards, so the
    frontend must not assume a single hardcoded gateway the way it used to.
    """
    return {"providers": payments.available(), "default": payments.default_provider()}


@router.post("/checkout")
def checkout(req: CheckoutRequest, request: Request, user_id: str = Depends(get_current_user)):
    provider = req.provider or payments.default_provider()
    try:
        return payments.start(
            user_id, req.tier, provider, _origin(request), get_user_by_id(user_id)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        # Gateway/network failures shouldn't leak a stack trace to the client.
        raise HTTPException(status_code=503, detail=f"Could not start checkout: {e}") from e


@router.post("/verify")
def verify(req: VerifyPaymentRequest, user_id: str = Depends(get_current_user)):
    """Settle a payment the user has just returned from.

    Everything in `params` came back through the user's browser, so none of it
    is trusted: it only says *which* payment to look up. Whether that payment
    succeeded is asked of the gateway directly, and the amount is checked
    against the price recorded before the user left.
    """
    try:
        result = payments.verify(req.provider, req.params or {}, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Could not verify payment: {e}") from e

    if result["status"] == "unknown":
        raise HTTPException(status_code=404, detail=result["detail"])
    return result


@router.get("/payments")
def payment_history(user_id: str = Depends(get_current_user)):
    """The user's own receipts. A person who paid through a wallet has no card
    statement line to check this against, so the app has to be able to show it."""
    return {"payments": payments.history(user_id)}


@router.get("/usage")
def ai_usage(user_id: str = Depends(get_current_user)):
    """What this account has spent on generation this month, and its ceiling.

    Reported in dollars because that is what the ceiling is denominated in — a
    token count means nothing to a screenwriter. Free plans report
    `metered: false`: they never call a model, so there is nothing to meter and
    a progress bar reading 0% of 0 would be worse than no bar at all.
    """
    import ai_budget
    from auth import get_user_tier

    return ai_budget.summary(user_id, get_user_tier(user_id))


@router.post("/webhook")
async def webhook(request: Request):
    # Stripe calls this directly (no auth). Verify against the raw body.
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    try:
        return subscription_service.handle_webhook(payload, sig_header)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
