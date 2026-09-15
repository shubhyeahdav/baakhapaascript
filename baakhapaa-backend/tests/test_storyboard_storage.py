"""Storyboard frames as files, and the two shapes that have to coexist.

A frame arrives from the provider as base64. It used to be written into
`storyboard_frames.image_url` as a `data:` URI — over a megabyte per frame, up
to 24 per board, read back in full every time anything did `select *`. They go
to an object store now.

What is worth testing here is almost entirely the failure path. Uploading works
or it does not, and that is one assertion; what matters is that every way it can
fail costs a larger row rather than a writer's storyboard, and that the rows
already written the old way keep working forever.

The mock has no `storage` attribute at all, which is why demo mode and every
deployment without a bucket take the fallback without a branch at the call site.
"""
import base64

import storyboard_engine
import storyboard_storage

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * 64).decode()


class _Bucket:
    def __init__(self, fail_on=None):
        self.uploaded = []
        self.removed = []
        self.listed = []
        self.fail_on = fail_on

    def upload(self, path, data, opts=None):
        if self.fail_on == "upload":
            raise RuntimeError("bucket is not writable")
        self.uploaded.append((path, data))

    def get_public_url(self, path):
        return f"https://proj.supabase.co/storage/v1/object/public/{storyboard_storage.BUCKET}/{path}"

    def list(self, prefix):
        if self.fail_on == "list":
            raise RuntimeError("cannot list")
        self.listed.append(prefix)
        return [{"name": "a.png"}, {"name": "b.png"}]

    def remove(self, paths):
        self.removed.extend(paths)


class _Storage:
    def __init__(self, bucket=None, buckets=("storyboard-frames",), fail_on=None):
        self.bucket = bucket or _Bucket(fail_on=fail_on)
        self._buckets = list(buckets)
        self.created = []
        self.fail_on = fail_on

    def list_buckets(self):
        if self.fail_on == "list_buckets":
            raise RuntimeError("no permission")
        return [{"name": n} for n in self._buckets]

    def create_bucket(self, name, options=None):
        if self.fail_on == "create":
            raise RuntimeError("cannot create")
        self.created.append((name, options))
        self._buckets.append(name)

    def from_(self, _name):
        return self.bucket


def _use(monkeypatch, storage):
    monkeypatch.setattr(storyboard_storage, "_client", lambda: storage)
    return storage


# --- the happy path is one assertion ----------------------------------------

def test_a_frame_is_uploaded_and_its_url_returned(monkeypatch):
    storage = _use(monkeypatch, _Storage())

    url = storyboard_storage.store_png(PNG, script_id="script-7")

    assert storage.bucket.uploaded, "nothing was uploaded"
    path, data = storage.bucket.uploaded[0]
    assert path.startswith("script-7/") and path.endswith(".png")
    assert data == base64.b64decode(PNG), "the bytes were not decoded before upload"
    assert storyboard_storage.is_stored(url)


def test_frames_are_keyed_by_script_so_they_can_be_deleted_without_a_manifest(monkeypatch):
    """Prefixed by script because the store is listable by prefix, and the
    alternative is trusting that every row still holds the URL of every object
    it ever created — which is false the moment a row is deleted first."""
    _use(monkeypatch, _Storage())

    path = storyboard_storage.object_path("script-7")

    assert path.startswith("script-7/")


# --- every failure costs a bigger row, never a storyboard -------------------

def test_an_upload_failure_falls_back_rather_than_raising(monkeypatch):
    _use(monkeypatch, _Storage(fail_on="upload"))

    assert storyboard_storage.store_png(PNG, script_id="s") is None


def test_a_bucket_that_cannot_be_created_falls_back(monkeypatch):
    _use(monkeypatch, _Storage(buckets=(), fail_on="create"))

    assert storyboard_storage.store_png(PNG, script_id="s") is None


def test_a_client_with_no_storage_at_all_falls_back(monkeypatch):
    """This is the mock, which is what demo mode and every test run uses."""
    monkeypatch.setattr(storyboard_storage, "_client", lambda: None)

    assert storyboard_storage.store_png(PNG, script_id="s") is None


def test_storage_can_be_switched_off(monkeypatch):
    """The failure mode of a misconfigured bucket is silent fallback, so
    somebody debugging that needs a way to rule this out."""
    monkeypatch.setattr(storyboard_storage, "ENABLED", False)

    assert storyboard_storage._client() is None


def test_a_frame_that_is_not_valid_base64_is_refused_quietly(monkeypatch):
    _use(monkeypatch, _Storage())

    assert storyboard_storage.store_png("not base64 at all!!", script_id="s") is None


def test_the_bucket_is_created_once_and_not_recreated(monkeypatch):
    storage = _use(monkeypatch, _Storage(buckets=()))

    storyboard_storage.store_png(PNG, script_id="s")
    storyboard_storage.store_png(PNG, script_id="s")

    assert len(storage.created) == 1
    assert storage.created[0][1] == {"public": True}


def test_a_bucket_created_concurrently_is_not_an_error(monkeypatch):
    """Two boards generated at once both see it missing and both create it."""
    class _Racing(_Storage):
        def create_bucket(self, name, options=None):
            raise RuntimeError('duplicate key value violates "buckets_pkey"')

    _use(monkeypatch, _Racing(buckets=()))

    assert storyboard_storage.ensure_bucket() is True


# --- both shapes, forever ----------------------------------------------------

def test_the_engine_stores_the_image_and_keeps_the_url(monkeypatch):
    storage = _use(monkeypatch, _Storage())
    item = type("R", (), {"url": None, "b64_json": PNG})()

    out = storyboard_engine._image_reference(item, script_id="s1")

    assert storyboard_storage.is_stored(out)
    assert not out.startswith("data:")
    assert storage.bucket.uploaded


def test_the_engine_falls_back_to_a_data_uri_when_storage_is_unavailable(monkeypatch):
    """The behaviour that shipped before this module existed, and the behaviour
    every deployment without a bucket still gets."""
    monkeypatch.setattr(storyboard_storage, "_client", lambda: None)
    item = type("R", (), {"url": None, "b64_json": PNG})()

    out = storyboard_engine._image_reference(item, script_id="s1")

    assert out == f"data:image/png;base64,{PNG}"


def test_a_provider_url_is_passed_through_untouched(monkeypatch):
    """Some providers return a hosted URL rather than base64. Nothing to store."""
    storage = _use(monkeypatch, _Storage())
    item = type("R", (), {"url": "https://example.test/frame.png", "b64_json": None})()

    out = storyboard_engine._image_reference(item, script_id="s1")

    assert out == "https://example.test/frame.png"
    assert not storage.bucket.uploaded


def test_a_refused_image_is_still_none(monkeypatch):
    _use(monkeypatch, _Storage())
    item = type("R", (), {"url": None, "b64_json": None})()

    assert storyboard_engine._image_reference(item, script_id="s1") is None


def test_a_data_uri_row_is_not_mistaken_for_a_stored_one():
    """Deletion only ever removes objects this module created. A data URI has
    no object behind it and a provider URL belongs to somebody else."""
    assert not storyboard_storage.is_stored("data:image/png;base64,AAAA")
    assert not storyboard_storage.is_stored("https://example.test/x.png")
    assert not storyboard_storage.is_stored(None)


# --- a deleted project takes its images -------------------------------------

def test_deleting_a_script_removes_its_frames(monkeypatch):
    storage = _use(monkeypatch, _Storage())

    removed = storyboard_storage.delete_for_scripts(["script-7"])

    assert storage.bucket.listed == ["script-7"]
    assert storage.bucket.removed == ["script-7/a.png", "script-7/b.png"]
    assert removed == 2


def test_deletion_works_by_prefix_not_by_url(monkeypatch):
    """The rows are deleted first, deliberately — children before parents — so
    by the time this runs the URLs may be gone. An object nobody holds the URL
    of is exactly the one that gets left behind forever."""
    storage = _use(monkeypatch, _Storage())

    storyboard_storage.delete_for_scripts(["script-7"])

    assert storage.bucket.listed == ["script-7"]


def test_a_store_that_cannot_be_reached_does_not_block_deletion(monkeypatch):
    """The row deletion is the part that matters to the writer. An orphaned
    image with nothing pointing at it is a cleanup job, not a privacy
    failure — and refusing to delete the project would be both."""
    _use(monkeypatch, _Storage(fail_on="list"))

    assert storyboard_storage.delete_for_scripts(["script-7"]) == 0


def test_deleting_nothing_touches_nothing(monkeypatch):
    storage = _use(monkeypatch, _Storage())

    assert storyboard_storage.delete_for_scripts([]) == 0
    assert storyboard_storage.delete_for_scripts([None]) == 0
    assert storage.bucket.removed == []
