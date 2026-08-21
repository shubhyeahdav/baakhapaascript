"""Production preflight.

Every item in this file was, until now, a line in a markdown file asking a human
to remember something at deploy time. `CORS_ORIGINS`, `DEMO_SEED`,
`REQUIRE_SHIPPABLE_FONT` — all documented, none enforced. The failure mode of a
documented-but-unenforced setting is that it works fine in dev and is wrong in
production, which is exactly the class of problem a boot check exists for.

The switch is `APP_ENV`. It defaults to `development`, so nothing here changes
how the app runs locally: the checks only bite when someone declares this a
production deployment.

Errors refuse the boot (same posture as the missing `JWT_SECRET`). Warnings
print, because some of them — running on mock payments, say — are legitimate
states for a staging box.
"""
import os

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"


def _truthy(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes")


def cors_origins() -> list[str]:
    """The configured allowlist, or [] to mean 'fall back to the dev regex'."""
    return [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]


def collect(env: str | None = None) -> tuple[list[str], list[str]]:
    """Return (errors, warnings) for the given APP_ENV. Pure — no side effects,
    so the test suite can drive it without booting an app."""
    env = (env or APP_ENV).strip().lower()
    production = env == "production"
    errors: list[str] = []
    warnings: list[str] = []

    origins = cors_origins()
    if production:
        if not origins:
            errors.append(
                "CORS_ORIGINS is unset. In production the fallback allows ANY "
                "http://localhost:* origin, which lets any page on a victim's "
                "machine call this API with their credentials. Set it to your "
                "frontend domain, e.g. https://baakhapaa.com"
            )
        else:
            insecure = [o for o in origins if o.startswith("http://") and "localhost" not in o]
            if insecure:
                warnings.append(f"CORS_ORIGINS contains plain-http origins: {insecure}")

    # A known email and a known password, in a database anyone can reach.
    if production and _truthy("DEMO_SEED"):
        errors.append(
            "DEMO_SEED=true in production creates test@example.com with the "
            "published password. Set it to false."
        )

    if production and not (os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY")):
        errors.append(
            "SUPABASE_URL/SUPABASE_KEY are unset, so the app would run on a local "
            "SQLite file. On Railway or any container host that file is erased on "
            "every redeploy - every user and every script with it."
        )

    # The font gate, at runtime rather than only in the test suite. Nepali
    # rendering as blank boxes is invisible until a user opens their own PDF.
    if production or _truthy("REQUIRE_SHIPPABLE_FONT"):
        try:
            import export_service
            if not export_service.DEVANAGARI_READY:
                errors.append(
                    "No Devanagari font resolved — every Nepali PDF export would "
                    "render as blank boxes. Ship assets/NotoSansDevanagari-Regular.ttf."
                )
            elif "Nirmala" in (export_service.RESOLVED_FONT_PATH or ""):
                errors.append(
                    "The resolved Devanagari font is Windows' Nirmala, which is "
                    "Microsoft's and must not be redistributed. Bundle the OFL Noto face."
                )
        except Exception as e:  # a broken import here must not mask the real error
            warnings.append(f"Could not verify the Devanagari font: {e}")

    if production and not os.getenv("FRONTEND_URL"):
        warnings.append(
            "FRONTEND_URL is unset. Payment providers redirect back to it when a "
            "request carries no Origin header; the fallback is localhost:3000."
        )

    return errors, warnings


def run(env: str | None = None) -> None:
    """Print warnings, raise on errors. Called once from main.py at import."""
    errors, warnings = collect(env)

    for w in warnings:
        print(f"WARNING: {w}")

    if errors:
        joined = "\n  - ".join(errors)
        raise RuntimeError(
            f"Refusing to start with APP_ENV=production:\n  - {joined}\n\n"
            "Fix these or set APP_ENV=development if this is not a production host."
        )

    if IS_PRODUCTION:
        print("Preflight: production checks passed.")
