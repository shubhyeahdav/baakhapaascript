"""Mass-assignment defence on the two routes that take a raw client dict.

`PUT /projects/{id}` and `PUT /storyboard/{frame_id}` both hand the request body
straight to the database. What stands between them and a client-chosen column is
six lines in `updates.apply_whitelist` — and until now nothing tested it, on
either side. That is an uncomfortable place for zero coverage: the fields these
routes do *not* list are the interesting ones. `projects.user_id` is who owns the
work. `storyboard_frames.scene_id` is which script a frame belongs to. Neither is
protected by the ownership check, because the ownership check runs against the
row's *current* values, before the update is applied.

Two halves, and both are needed. The unit half pins the helper's contract,
including the case that makes it more than a filter: an update that survives the
filter with nothing left is a 400, not a silent write of `{}`. The route half
proves the routes actually call it — a whitelist nobody invokes tests clean.

Assertions read the row back through `supabase` rather than trusting the
response body, because the response is the mock's own dict and would hide a
write that landed somewhere unexpected.
"""
import pytest
from fastapi import HTTPException

from database import supabase
from projects import PROJECT_UPDATE_FIELDS
from storyboard import FRAME_UPDATE_FIELDS
from tests.test_storyboard_limits import add_scenes
from updates import apply_whitelist


def _project_row(project_id):
    return supabase.table("projects").select("*").eq("id", project_id).execute().data[0]


def _frame_row(frame_id):
    return supabase.table("storyboard_frames").select("*").eq("id", frame_id).execute().data[0]


def _user_row(user_id):
    return supabase.table("users").select("*").eq("id", user_id).execute().data[0]


# --- the helper itself ------------------------------------------------------

def test_only_allowed_keys_survive():
    got = apply_whitelist({"title": "Sapana", "user_id": "someone-else"}, {"title"})
    assert got == {"title": "Sapana"}


def test_a_payload_of_nothing_but_forbidden_keys_is_a_400():
    """Not a 200 that quietly changed nothing — the caller asked for something
    and every part of it was refused, which is worth saying out loud."""
    with pytest.raises(HTTPException) as exc:
        apply_whitelist({"user_id": "x", "id": "y"}, {"title"})
    assert exc.value.status_code == 400


def test_an_empty_payload_is_a_400():
    with pytest.raises(HTTPException) as exc:
        apply_whitelist({}, {"title"})
    assert exc.value.status_code == 400


def test_a_none_payload_is_a_400_rather_than_an_attribute_error():
    """`(updates or {})` exists for this. A body of literal `null` arrives as
    `None`, and a crash there is a 500 where a 400 belongs."""
    with pytest.raises(HTTPException) as exc:
        apply_whitelist(None, {"title"})
    assert exc.value.status_code == 400


def test_the_400_names_the_problem():
    """The frontend surfaces `detail` verbatim, so the wording is a contract."""
    with pytest.raises(HTTPException) as exc:
        apply_whitelist({"nope": 1}, {"title"})
    assert exc.value.detail == "No valid fields to update"


def test_values_are_passed_through_untouched():
    """Including the falsy ones. A truthiness filter instead of a key filter
    would silently drop `0`, `""` and `False` — all legitimate values here
    (`episode_count: 0`, an emptied `tone`)."""
    got = apply_whitelist(
        {"title": "", "episode_count": 0, "duration_minutes": None},
        {"title", "episode_count", "duration_minutes"},
    )
    assert got == {"title": "", "episode_count": 0, "duration_minutes": None}


def test_the_allowed_list_may_be_any_iterable():
    """Both call sites pass a set, but the signature says `Iterable`."""
    assert apply_whitelist({"title": "x"}, ["title", "genre"]) == {"title": "x"}


# --- through PUT /projects/{id} ---------------------------------------------

def test_a_project_update_changes_what_it_is_allowed_to(client, make_user, make_script):
    user = make_user()
    project_id, _ = make_script(user)

    r = client.put(f"/projects/{project_id}", json={"title": "Naya Sapana"},
                   headers=user["headers"])
    assert r.status_code == 200, r.text
    assert _project_row(project_id)["title"] == "Naya Sapana"


def test_a_project_update_cannot_reassign_the_owner(client, make_user, make_script):
    """`user_id` is the whole ownership model. If it were writable, one PUT would
    hand a project to somebody else — or take one."""
    owner = make_user()
    intruder = make_user()
    project_id, _ = make_script(owner)

    client.put(f"/projects/{project_id}",
               json={"title": "Still Mine", "user_id": intruder["id"]},
               headers=owner["headers"])

    assert _project_row(project_id)["user_id"] == owner["id"]


def test_a_project_update_cannot_change_its_own_id(client, make_user, make_script):
    owner = make_user()
    project_id, _ = make_script(owner)

    client.put(f"/projects/{project_id}", json={"title": "Renamed", "id": "chosen-id"},
               headers=owner["headers"])

    assert _project_row(project_id)["id"] == project_id


def test_a_project_update_cannot_reach_the_users_table(client, make_user, make_script):
    """A free account writing `subscription_tier` into a project update is the
    cheapest upgrade attempt there is. It must not even reach a column."""
    owner = make_user("free")
    project_id, _ = make_script(owner)

    client.put(f"/projects/{project_id}",
               json={"title": "Upgrade Me", "subscription_tier": "studio"},
               headers=owner["headers"])

    assert _user_row(owner["id"])["subscription_tier"] == "free"
    assert "subscription_tier" not in _project_row(project_id)


def test_forbidden_keys_alongside_a_real_one_are_dropped_not_fatal(client, make_user, make_script):
    """The mixed payload is the case that matters. Rejecting the whole request
    would be the obvious hardening and it would be wrong: clients send extra
    fields for ordinary reasons, and a 400 here breaks a working save."""
    owner = make_user()
    project_id, _ = make_script(owner)

    r = client.put(f"/projects/{project_id}",
                   json={"title": "Half Refused", "user_id": "someone-else"},
                   headers=owner["headers"])

    assert r.status_code == 200, r.text
    row = _project_row(project_id)
    assert row["title"] == "Half Refused"
    assert row["user_id"] == owner["id"]


def test_a_project_update_of_only_forbidden_fields_is_a_400(client, make_user, make_script):
    owner = make_user()
    project_id, _ = make_script(owner)

    r = client.put(f"/projects/{project_id}", json={"user_id": "someone-else"},
                   headers=owner["headers"])

    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "No valid fields to update"


def test_the_project_whitelist_holds_no_identity_or_billing_field():
    """A guard on the list itself, so adding a field to `PROJECT_UPDATE_FIELDS`
    for a new form control cannot quietly open one of these."""
    for forbidden in ("id", "user_id", "created_at", "subscription_tier"):
        assert forbidden not in PROJECT_UPDATE_FIELDS


# --- through PUT /storyboard/{frame_id} -------------------------------------

@pytest.fixture
def a_frame(client, make_user, make_script):
    """A real generated frame, with its owner. Storyboard generation is gated on
    tier, so the owner has to be able to pay for it."""
    owner = make_user("pro")
    _, script_id = make_script(owner)
    add_scenes(client, owner, script_id, 2)
    r = client.post(f"/storyboard/generate/{script_id}", headers=owner["headers"])
    assert r.status_code == 200, r.text
    return owner, r.json()["frames"][0]


def test_a_frame_update_changes_what_it_is_allowed_to(client, a_frame):
    owner, frame = a_frame

    r = client.put(f"/storyboard/{frame['id']}",
                   json={"camera_notes": "Push in slowly on her hands."},
                   headers=owner["headers"])

    assert r.status_code == 200, r.text
    assert _frame_row(frame["id"])["camera_notes"] == "Push in slowly on her hands."


def test_a_frame_update_cannot_move_the_frame_to_another_scene(client, a_frame):
    """`scene_id` is the frame's tenancy. Rewriting it would attach a board frame
    to a scene in a script the caller may not own — and `require_frame_access`
    cannot catch it, because it checks the row as it stands before the write."""
    owner, frame = a_frame
    original = _frame_row(frame["id"])["scene_id"]

    client.put(f"/storyboard/{frame['id']}",
               json={"shot_type": "CLOSE UP", "scene_id": "some-other-scene"},
               headers=owner["headers"])

    assert _frame_row(frame["id"])["scene_id"] == original


def test_a_frame_update_cannot_overwrite_the_generated_image_url(client, a_frame):
    """The image URL is written by the server after a billed generation. A client
    that could set it could point a frame at any URL it liked — which would leave
    the export's SSRF guard as the only thing standing in front of it."""
    owner, frame = a_frame
    original = _frame_row(frame["id"])["image_url"]

    client.put(f"/storyboard/{frame['id']}",
               json={"shot_type": "WIDE",
                     "image_url": "http://169.254.169.254/latest/meta-data/"},
               headers=owner["headers"])

    assert _frame_row(frame["id"])["image_url"] == original


def test_a_frame_update_of_only_forbidden_fields_is_a_400(client, a_frame):
    owner, frame = a_frame

    r = client.put(f"/storyboard/{frame['id']}",
                   json={"image_url": "http://example.com/x.png"},
                   headers=owner["headers"])

    assert r.status_code == 400, r.text


def test_the_frame_whitelist_holds_only_the_three_editable_controls():
    """FR09 gives the user a shot-type override, a camera note and an order.
    Nothing else on that row is theirs to set."""
    assert FRAME_UPDATE_FIELDS == {"shot_type", "camera_notes", "order_index"}
