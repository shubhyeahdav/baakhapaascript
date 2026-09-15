"""Storyboard frames as files, not as rows.

A generated frame arrives from the image provider as base64. Until now it was
written into `storyboard_frames.image_url` as a `data:` URI, which works and
which the comment in `storyboard_engine._image_reference` has called "not the
right long-term answer" since the day it was written.

The size is why. A 1536x1024 PNG is over a megabyte base64'd, and
`MAX_STORYBOARD_FRAMES` allows 24 per board — so a single storyboard can put
thirty megabytes of image data into Postgres rows that are then read back in
full every time the board is opened, every time the production package is
exported, and every time anything does `select *` on the table. Postgres will
hold it. It should not have to.

Three properties this has to keep, in order:

  **Generation never fails because storage did.** Every path here returns None
  on any error and the caller falls back to the data URI, which is exactly what
  shipped before. A missing bucket, a revoked key, an outage — none of them may
  cost a writer their storyboard.

  **Old boards keep working.** Nothing migrates. A row holding a data URI is
  still read, still rendered, still embedded in an export. The two shapes coexist
  indefinitely, because rewriting historical rows to gain nothing is a way to
  lose data for tidiness.

  **A deleted project takes its images.** An object store does not cascade. If
  nothing deletes these, erasing a project leaves its frames sitting in a public
  bucket, which makes the deletion promise in `DATA_HANDLING.md` untrue.
"""
import base64
import os
import uuid

# Public, because a storyboard frame is drawn from a prompt and holds no
# script text, and because the export path fetches these by URL — a signed URL
# would expire exactly the way the old DALL-E links did, which is the bug that
# made data URIs necessary in the first place.
BUCKET = os.getenv("STORYBOARD_BUCKET", "storyboard-frames")

# Set false to keep writing data URIs, which is what demo mode and any
# deployment without a bucket do anyway. Here as a switch because the failure
# mode of a misconfigured bucket is silent fallback, and someone debugging that
# needs a way to rule this out.
ENABLED = os.getenv("STORYBOARD_STORAGE", "true").lower() not in ("false", "0", "no")


def _client():
    """The storage API, or None when there isn't one.

    `MockSupabaseClient` has no `storage` attribute at all, so demo mode takes
    the fallback without raising — which is the correct behaviour and not worth
    a branch at every call site.
    """
    if not ENABLED:
        return None
    try:
        from database import supabase
        return getattr(supabase, "storage", None)
    except Exception:
        return None


def ensure_bucket():
    """Create the bucket if it is missing. Safe to call repeatedly.

    Called from `store_png` rather than at import, because importing a module
    should not reach across the network — and because the first storyboard of a
    deployment's life is a perfectly good moment to find out the bucket is not
    there.
    """
    storage = _client()
    if storage is None:
        return False
    try:
        existing = {b.name if hasattr(b, "name") else b.get("name")
                    for b in (storage.list_buckets() or [])}
        if BUCKET in existing:
            return True
    except Exception as e:
        print(f"Storyboard storage: could not list buckets ({e}).")
        return False

    try:
        storage.create_bucket(BUCKET, options={"public": True})
        print(f"Storyboard storage: created bucket {BUCKET!r}.")
        return True
    except Exception as e:
        # A parallel board may have created it between the list and the create.
        if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
            return True
        print(f"Storyboard storage: could not create bucket ({e}).")
        return False


def object_path(script_id, frame_id=None):
    """`<script_id>/<uuid>.png`.

    Prefixed by script so a board's images can be removed without a manifest —
    the store is listable by prefix, and the alternative is trusting that every
    row still holds the URL of every object it ever created.
    """
    name = f"{frame_id or uuid.uuid4().hex}.png"
    return f"{script_id or 'unassigned'}/{name}"


def store_png(b64_png, script_id=None):
    """Upload one base64 PNG and return its public URL, or None.

    None means "use a data URI", which every caller already knows how to do.
    """
    if not b64_png:
        return None
    storage = _client()
    if storage is None:
        return None
    if not ensure_bucket():
        return None

    path = object_path(script_id)
    try:
        raw = base64.b64decode(b64_png)
    except Exception as e:
        print(f"Storyboard storage: frame was not valid base64 ({e}).")
        return None

    try:
        bucket = storage.from_(BUCKET)
        bucket.upload(path, raw, {"content-type": "image/png"})
        url = bucket.get_public_url(path)
        # supabase-py has returned this with a trailing "?" in some versions,
        # which is harmless in a browser and confusing in a log.
        return url.rstrip("?") if isinstance(url, str) else None
    except Exception as e:
        print(f"Storyboard storage: upload failed ({e}); falling back to a data URI.")
        return None


def is_stored(url):
    """Does this URL point at our bucket?

    Used to tell a stored frame from a data URI and from a provider URL, so
    deletion only ever removes objects this module created.
    """
    return bool(url) and isinstance(url, str) and f"/{BUCKET}/" in url


def delete_for_scripts(script_ids):
    """Remove every stored frame belonging to these scripts.

    By prefix rather than by URL: a row can be gone before this runs — purge
    deletes children first, deliberately — and an object nobody has the URL of
    any more is exactly the object that gets left behind forever.

    Never raises. A project must still delete when the object store is
    unreachable; the row deletion is the part that matters for the promise made
    to the writer, and an orphaned image with no row pointing at it is a
    cleanup job rather than a privacy failure.
    """
    storage = _client()
    if storage is None or not script_ids:
        return 0

    removed = 0
    try:
        bucket = storage.from_(BUCKET)
    except Exception:
        return 0

    for script_id in script_ids:
        if not script_id:
            continue
        try:
            listed = bucket.list(str(script_id)) or []
            paths = [f"{script_id}/{o['name'] if isinstance(o, dict) else o.name}"
                     for o in listed]
            if paths:
                bucket.remove(paths)
                removed += len(paths)
        except Exception as e:
            print(f"Storyboard storage: could not clear {script_id} ({e}).")
    return removed
