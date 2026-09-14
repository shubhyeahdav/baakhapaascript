"""Onboarding must be able to describe what the product can actually make.

`UserPreferences.format` is what onboarding asks for. `ProjectBase.format` is
what a project can be. They were two different lists — onboarding offered
short / web_series / film, while a project could also be `short_form`.

So a creator making vertical video was asked "What are you making?" and had to
pick something untrue. And it did not stop there: `NewProject.jsx:78` reads
`prefs.format` to choose the default format for EVERY project they create
afterwards, so one un-answerable question mis-set the wizard for good.

This is the kind of drift nothing notices, because both lists are individually
valid and each has its own validator. The only thing that catches it is
asserting they are the same list — which is why that is the first test here and
why it will matter again the moment `long_form` lands.
"""
import models


def test_onboarding_offers_every_format_a_project_can_be():
    """If these diverge again, somebody can make a thing the product cannot ask
    them about."""
    assert models.FORMATS == models.PROJECT_FORMATS


def test_the_default_format_is_one_of_them():
    assert models.UserPreferences().format in models.PROJECT_FORMATS


def test_the_two_defaults_agree():
    """`UserPreferences.format` and `ProjectBase.format` both default, and a
    user with no preferences falls through to one or the other depending on
    which code path they reach. Two answers to "what do you make by default" is
    one answer too many."""
    assert models.UserPreferences().format == models.ProjectBase().format


def test_short_form_can_be_chosen_at_onboarding():
    """The case that was impossible: a creator who makes reels."""
    assert models.UserPreferences(format="short_form").format == "short_form"
