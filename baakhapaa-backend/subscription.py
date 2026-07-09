import os
from fastapi import APIRouter, HTTPException, Depends, Request
from models import CheckoutRequest
from auth import get_current_user
import subscription_service

router = APIRouter(prefix="/subscription", tags=["subscription"])


@router.post("/checkout")
def checkout(req: CheckoutRequest, request: Request, user_id: str = Depends(get_current_user)):
    origin = request.headers.get("origin") or os.getenv("FRONTEND_URL", "http://localhost:3000")
    try:
        return subscription_service.create_checkout_session(user_id, req.tier, origin)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Stripe/network failures shouldn't leak a stack trace to the client.
        raise HTTPException(status_code=503, detail=f"Could not start checkout: {e}")


@router.post("/webhook")
async def webhook(request: Request):
    # Stripe calls this directly (no auth). Verify against the raw body.
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    try:
        return subscription_service.handle_webhook(payload, sig_header)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
