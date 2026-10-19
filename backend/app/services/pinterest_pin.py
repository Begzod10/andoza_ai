"""From a Pinterest pin link to the pin's image, for the AI designer.

The user pastes a pin link; the designer needs the picture. Pinterest's API does
not hand out other people's pins without OAuth, so this goes through the oEmbed
endpoint Pinterest offers for embedding pins on other sites: one request per pin,
when the user asks, nothing cached and nothing crawled.

Because the link comes from the user, the server must not be steerable by it:

  * a link is accepted only on Pinterest's own hosts (PIN_HOST_RE, or pin.it);
  * the oEmbed request always goes to www.pinterest.com, built from the pin id
    alone, never from the user's URL;
  * the image is fetched only from i.pinimg.com;
  * httpx never follows a redirect by itself. pin.it short links are followed
    here by hand, at most three hops, and every hop is checked again.
"""
from __future__ import annotations

import re
from urllib.parse import urljoin, urlsplit

import httpx

# Pinterest and its country domains, with an optional short subdomain (www, api,
# mx, ru...). Anchored at both ends, so "pinterest.com.evil.com" does not match.
PIN_HOST_RE = re.compile(
    r"^(?:[a-z]{2,3}\.)?pinterest\."
    r"(?:com|ca|co\.uk|com\.au|com\.mx|com\.br|co\.kr|de|fr|es|it|pt|ru|jp|kr|at|ch|cl|nz|se|dk|ie|ph|cz|hu|in|id)$"
)
SHORT_HOST = "pin.it"
_PIN_ID_RE = re.compile(r"(\d{5,25})/?$")
_MAX_REDIRECTS = 3
_REDIRECT_TIMEOUT = 5.0


class NotAPinUrl(Exception):
    """Not a link to a single Pinterest pin."""


class PinNotFound(Exception):
    """Pinterest says the pin does not exist or is not public."""


class PinterestUnavailable(Exception):
    """Pinterest did not answer, or answered with something unusable."""


def pinterest_client() -> httpx.AsyncClient:
    """The client every Pinterest request goes through: redirects are never
    followed automatically (see the module docstring)."""
    return httpx.AsyncClient(follow_redirects=False, timeout=10.0)


def _checked_host(url: str) -> tuple[str, str]:
    """(host, path) of a well-formed https link on a Pinterest host."""
    try:
        parts = urlsplit(url.strip())
        port = parts.port
    except ValueError as exc:
        raise NotAPinUrl(url) from exc
    host = (parts.hostname or "").rstrip(".").lower()
    if parts.scheme != "https" or port is not None or parts.username or parts.password:
        raise NotAPinUrl(url)
    if host != SHORT_HOST and not PIN_HOST_RE.match(host):
        raise NotAPinUrl(url)
    return host, parts.path


def _pin_id_from_path(path: str) -> str:
    if not path.startswith("/pin/"):
        raise NotAPinUrl(path)
    match = _PIN_ID_RE.search(path[len("/pin/"):])
    if not match:
        raise NotAPinUrl(path)
    return match.group(1)


async def resolve_pin_id(url: str, client: httpx.AsyncClient) -> str:
    """The pin id a pasted link points at. Raises NotAPinUrl for anything that is
    not a single pin on Pinterest's own hosts."""
    current = url.strip()
    for hop in range(_MAX_REDIRECTS + 1):
        host, path = _checked_host(current)
        if host != SHORT_HOST and path.startswith("/pin/"):
            return _pin_id_from_path(path)
        # A pin.it link, or a step of its redirect chain on a Pinterest host
        # (api.pinterest.com/url_shortener/...): follow one more hop, by hand.
        if host != SHORT_HOST and hop == 0:
            raise NotAPinUrl(url)
        current = await _next_hop(current, client)
    raise NotAPinUrl(url)


async def _next_hop(url: str, client: httpx.AsyncClient) -> str:
    """Where a pin.it link (or a hop after it) redirects to."""
    try:
        response = await client.head(url, timeout=_REDIRECT_TIMEOUT)
        if response.status_code == 405:
            response = await client.get(url, timeout=_REDIRECT_TIMEOUT)
    except httpx.HTTPError as exc:
        raise PinterestUnavailable(str(exc)) from exc
    location = response.headers.get("Location")
    if not response.is_redirect or not location:
        raise NotAPinUrl(url)
    return urljoin(url, location)
