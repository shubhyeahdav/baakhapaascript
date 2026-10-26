"""Craft retrieval seeded from the section the caret is in.

The Patterns panel asked the same question wherever the writer was standing.
The craft a hook needs and the craft a payoff needs are different crafts, and
a writer inside the hook has already told us what they are working on by being
there.

The ordering is the point. A typed complaint beats everything, because the
writer named it. A linter flag beats a positional guess, because it is a
problem actually found in the draft. The section only speaks when neither of
those has anything to say — which, on a half-written draft, is most of the
time.
"""
import scripts


class TestTheQueries:
    def test_every_kind_in_both_vocabularies_has_one(self):
        """A kind with no query falls through to embedding the raw draft, which
        is the behaviour this exists to replace."""
        import videoscript
        for kinds in videoscript.SECTION_KINDS_BY_MODE.values():
            for kind in kinds:
                assert kind in scripts.SECTION_QUERIES, f"no query for {kind}"

    def test_the_two_vocabularies_do_not_collide(self):
        import videoscript
        essay = set(videoscript.SECTION_KINDS_BY_MODE["essay"])
        course = set(videoscript.SECTION_KINDS_BY_MODE["course"])
        assert not (essay & course), "a shared kind would need one query for two crafts"

    def test_a_query_is_a_symptom_not_a_label(self):
        """`retrieve_relevant_patterns` embeds each entry's PROBLEM first, so a
        bare "hook" queries the corpus in the wrong register and returns
        whatever shares those letters. Every seed has to read like a
        complaint, which at minimum means it is a sentence rather than a word.
        """
        for kind, query in scripts.SECTION_QUERIES.items():
            assert len(query.split()) >= 6, f"{kind} reads like a label: {query!r}"
            assert kind not in query.split(), f"{kind} queries itself"


class TestTheRequestCarriesIt:
    def test_section_kind_is_accepted(self):
        import models
        assert models.RecommendRequest(section_kind="hook").section_kind == "hook"

    def test_it_is_optional(self):
        import models
        assert models.RecommendRequest().section_kind is None

    def test_an_unknown_kind_does_not_refuse_the_request(self):
        """An unrecognised value steers retrieval slightly and costs nothing.
        Refusing the whole request would turn a cosmetic mismatch between
        client and server into a dead panel."""
        import models
        assert models.RecommendRequest(section_kind="chorus").section_kind == "chorus"


class TestTheOrdering:
    """Exercised through the route, so the ladder is tested where it runs."""

    def _post(self, client, token, **kw):
        body = {"scene_text": "", "genre": "Drama", "tone": "Grounded"}
        body.update(kw)
        return client.post("/scripts/recommendations", json=body,
                           headers={"Authorization": f"Bearer {token}"})

    def test_a_section_seed_returns_patterns(self, client, make_user):
        user = make_user()
        r = self._post(client, user["token"], section_kind="hook")
        assert r.status_code == 200
        assert isinstance(r.json()["patterns"], list)

    def test_a_typed_focus_still_wins(self, client, make_user):
        """If the section overrode a typed complaint, the Ask box would stop
        working the moment a writer put their caret in a section."""
        user = make_user()
        typed = self._post(client, user["token"],
                           focus="my dialogue is on the nose", section_kind="payoff")
        section = self._post(client, user["token"], section_kind="payoff")
        assert typed.status_code == section.status_code == 200
        # Different seeds should not reliably produce identical orderings.
        t = [p["technique"] for p in typed.json()["patterns"]]
        s = [p["technique"] for p in section.json()["patterns"]]
        assert t != s or not t, "the typed focus did not change retrieval"

    def test_no_section_kind_behaves_as_before(self, client, make_user):
        user = make_user()
        r = self._post(client, user["token"])
        assert r.status_code == 200
