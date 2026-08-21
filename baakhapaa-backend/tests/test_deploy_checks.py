"""The production preflight.

Each of these corresponds to a line that lived in a markdown file asking a human
to remember something at deploy time. The tests exist because the failure mode
of a documented-but-unenforced setting is silent: it works in development and is
wrong in production, and nobody finds out until a user does.

`collect()` is pure and takes the environment name as an argument, so none of
this needs to boot an app or restart one.
"""
import deploy_checks


def _errors(env="production"):
    return deploy_checks.collect(env)[0]


def _joined(env="production"):
    return " ".join(_errors(env))


# ---------------------------------------------------------------------------
# Development must be untouched — a check that fires locally gets disabled
# ---------------------------------------------------------------------------
def test_development_is_never_blocked(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.setenv("DEMO_SEED", "true")
    assert _errors("development") == []


def test_the_default_environment_is_development():
    """Nobody should have to set anything to run this locally."""
    assert deploy_checks.APP_ENV != "production" or deploy_checks.IS_PRODUCTION


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
def test_production_without_cors_origins_refuses_to_boot(monkeypatch):
    """The fallback allows ANY http://localhost:* origin. In production that
    lets any page on a victim's machine call the API with their credentials."""
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert "CORS_ORIGINS" in _joined()


def test_a_configured_allowlist_clears_the_cors_check(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://baakhapaa.com")
    assert "CORS_ORIGINS is unset" not in _joined()


def test_plain_http_origins_are_warned_about_not_blocked(monkeypatch):
    """A staging box on http is a real thing; it should be noisy, not fatal."""
    monkeypatch.setenv("CORS_ORIGINS", "http://staging.baakhapaa.com")
    errors, warnings = deploy_checks.collect("production")
    assert not any("plain-http" in e for e in errors)
    assert any("plain-http" in w for w in warnings)


def test_cors_origins_are_split_and_stripped(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", " https://a.com , https://b.com ,, ")
    assert deploy_checks.cors_origins() == ["https://a.com", "https://b.com"]


# ---------------------------------------------------------------------------
# The seeded demo account
# ---------------------------------------------------------------------------
def test_demo_seed_in_production_refuses_to_boot(monkeypatch):
    """test@example.com / password, in a database anyone on the internet can
    reach, with the credential printed in the project README."""
    monkeypatch.setenv("CORS_ORIGINS", "https://baakhapaa.com")
    monkeypatch.setenv("DEMO_SEED", "true")
    assert "DEMO_SEED" in _joined()


def test_demo_seed_false_is_fine(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://baakhapaa.com")
    monkeypatch.setenv("DEMO_SEED", "false")
    assert "DEMO_SEED" not in _joined()


# ---------------------------------------------------------------------------
# The database
# ---------------------------------------------------------------------------
def test_production_on_sqlite_refuses_to_boot(monkeypatch):
    """On Railway or any container host the SQLite file is erased on every
    redeploy — every user and every script with it."""
    monkeypatch.setenv("CORS_ORIGINS", "https://baakhapaa.com")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_KEY", raising=False)
    assert "SUPABASE_URL" in _joined()


def test_supabase_keys_clear_the_database_check(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://baakhapaa.com")
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "service-role-key")
    assert "SUPABASE_URL" not in _joined()


# ---------------------------------------------------------------------------
# The Devanagari font, at runtime rather than only in the test suite
# ---------------------------------------------------------------------------
def test_the_font_gate_runs_in_production(monkeypatch):
    """REQUIRE_SHIPPABLE_FONT was only ever read by a test. A deploy that never
    ran the suite got no gate at all — which is exactly the deploy that has no
    font, because the font is an asset the build has to carry."""
    import export_service
    monkeypatch.setenv("CORS_ORIGINS", "https://baakhapaa.com")
    monkeypatch.setattr(export_service, "DEVANAGARI_READY", False)
    assert "Devanagari" in _joined()


def test_nirmala_alone_is_a_production_error(monkeypatch):
    """Nirmala is Microsoft's. It resolves on the Windows dev box, is absent
    from every Linux host, and is not ours to redistribute — so a build that
    depends on it renders every Nepali PDF as blank boxes in production."""
    import export_service
    monkeypatch.setenv("CORS_ORIGINS", "https://baakhapaa.com")
    monkeypatch.setattr(export_service, "DEVANAGARI_READY", True)
    monkeypatch.setattr(export_service, "RESOLVED_FONT_PATH", r"C:\Windows\Fonts\Nirmala.ttc")
    assert "Nirmala" in _joined()


def test_the_bundled_font_clears_the_gate(monkeypatch):
    import export_service
    monkeypatch.setenv("CORS_ORIGINS", "https://baakhapaa.com")
    monkeypatch.setattr(export_service, "DEVANAGARI_READY", True)
    monkeypatch.setattr(export_service, "RESOLVED_FONT_PATH",
                        "/app/assets/NotoSansDevanagari-Regular.ttf")
    assert "Devanagari" not in _joined()


def test_require_shippable_font_gates_outside_production_too(monkeypatch):
    """CI sets it on Linux without declaring itself production."""
    import export_service
    monkeypatch.setenv("REQUIRE_SHIPPABLE_FONT", "true")
    monkeypatch.setattr(export_service, "DEVANAGARI_READY", False)
    assert any("Devanagari" in e for e in deploy_checks.collect("development")[0])


# ---------------------------------------------------------------------------
# run()
# ---------------------------------------------------------------------------
def test_run_raises_on_errors(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    try:
        deploy_checks.run("production")
    except RuntimeError as e:
        assert "CORS_ORIGINS" in str(e)
    else:
        raise AssertionError("run() should refuse a production boot with no CORS allowlist")


def test_run_is_silent_about_development(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    deploy_checks.run("development")  # must not raise
