"""The outbound-fetch guard on production package exports.

Building a production package embeds the storyboard frames, which means this
server fetches URLs. That is the only place it does, which makes it the only
place an attacker could aim it inward — at cloud metadata on 169.254.169.254, at
an admin port on localhost, at anything else on the private network that trusts
its own subnet. On Railway that metadata endpoint is one unauthenticated GET away
from deployment credentials.

Frame URLs are written by the server, so in normal operation they are always
external. This guard is the second lock, for the two cases where that reasoning
runs out: a provider hostname that later resolves somewhere unexpected, and a
redirect, whose target is chosen *after* the host check has already passed.

Nothing here may touch real DNS — CI must not depend on a name server, and a
test that resolves `localhost` differently on someone's machine is worse than no
test. Note that `export_service` imports `socket` *inside* `_is_public_host`, so
patching `export_service.socket` raises `AttributeError`; the stdlib module is
what gets patched, and the fake returns the real 5-tuple shape because the code
indexes `info[4][0]`.
"""
import socket

import pytest

from export_service import _is_public_host, _NoRedirects


def _resolves_to(*ips):
    """A `getaddrinfo` stand-in returning the addresses given."""
    def fake(host, port, *args, **kwargs):
        return [
            (socket.AF_INET6 if ":" in ip else socket.AF_INET,
             socket.SOCK_STREAM, 6, "", (ip, 0))
            for ip in ips
        ]
    return fake


@pytest.fixture
def resolves(monkeypatch):
    def _set(*ips):
        monkeypatch.setattr(socket, "getaddrinfo", _resolves_to(*ips))
    return _set


def test_a_public_address_is_allowed(resolves):
    """The normal case: an image on a CDN. A guard that refused everything would
    pass every test below and quietly break exports."""
    resolves("93.184.216.34")
    assert _is_public_host("images.example.com") is True


def test_loopback_is_refused(resolves):
    resolves("127.0.0.1")
    assert _is_public_host("localhost") is False


def test_the_cloud_metadata_address_is_refused(resolves):
    """169.254.169.254 is the one that matters most: on most cloud hosts it
    serves deployment credentials to anything that asks."""
    resolves("169.254.169.254")
    assert _is_public_host("metadata.internal") is False


@pytest.mark.parametrize("ip", ["10.0.0.5", "192.168.1.1", "172.16.0.1"])
def test_private_ranges_are_refused(resolves, ip):
    resolves(ip)
    assert _is_public_host("internal.service") is False


def test_the_unspecified_address_is_refused(resolves):
    resolves("0.0.0.0")
    assert _is_public_host("nowhere") is False


def test_multicast_and_reserved_are_refused(resolves):
    resolves("224.0.0.1")
    assert _is_public_host("multicast.example") is False
    resolves("240.0.0.1")
    assert _is_public_host("reserved.example") is False


def test_ipv6_loopback_is_refused(resolves):
    """`getaddrinfo` returns AAAA records first on plenty of hosts, so an
    IPv4-only guard would be bypassed by anything with a AAAA record."""
    resolves("::1")
    assert _is_public_host("localhost") is False


def test_a_host_that_resolves_to_both_public_and_private_is_refused(resolves):
    """DNS rebinding, in its simplest form. *Every* address a name resolves to
    has to pass — checking only the first one is the classic hole here."""
    resolves("93.184.216.34", "127.0.0.1")
    assert _is_public_host("rebind.example.com") is False


def test_an_unresolvable_host_is_refused(monkeypatch):
    """A name that does not resolve is refused, not raised on. Everything in the
    export path degrades to a captioned box rather than failing the download."""
    def boom(host, port, *args, **kwargs):
        raise socket.gaierror("Name or service not known")

    monkeypatch.setattr(socket, "getaddrinfo", boom)
    assert _is_public_host("no-such-host.invalid") is False


def test_an_empty_host_is_refused():
    """What a URL with no netloc produces. No DNS lookup happens at all."""
    assert _is_public_host("") is False
    assert _is_public_host(None) is False


def test_a_host_that_resolves_to_nothing_is_refused(resolves):
    """An empty answer must not read as "no address failed the check, so pass"."""
    resolves()
    assert _is_public_host("empty.example") is False


def test_a_redirect_is_never_followed():
    """Validating the host and then following a redirect validates nothing: the
    target is chosen after the check has passed. Returning `None` is urllib's
    documented way to refuse, and it makes the opener raise on the 3xx.

    The unused-looking arguments in that override are urllib's, not ours — see
    the docstring on `_NoRedirects`. This test is what should stop anyone
    "simplifying" the signature.
    """
    handler = _NoRedirects()

    refused = handler.redirect_request(
        None, None, 302, "Found", {}, "http://169.254.169.254/latest/meta-data/"
    )

    assert refused is None
