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
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

from app.services.design_image import MAX_DESIGN_IMAGE_BYTES, ImageTooLarge

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
_OEMBED = "https://www.pinterest.com/oembed.json"
_OEMBED_TIMEOUT = 8.0
_IMAGE_TIMEOUT = 10.0
_IMAGE_HOST = "i.pinimg.com"


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
    stripped = url.strip()
    # urlsplit quietly drops tabs and newlines for the check, while the raw string
    # would still reach httpx (which refuses control characters with an error that
    # is not an HTTPError). Refuse them here, as not a link.
    if any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in stripped):
        raise NotAPinUrl(url)
    try:
        parts = urlsplit(stripped)
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
    except httpx.InvalidURL as exc:
        raise NotAPinUrl(url) from exc
    except httpx.HTTPError as exc:
        raise PinterestUnavailable(str(exc)) from exc
    location = response.headers.get("Location")
    if not response.is_redirect or not location:
        raise NotAPinUrl(url)
    return urljoin(url, location)


@dataclass(frozen=True)
class PinImage:
    data: bytes
    content_type: str
    url: str


async def fetch_pin_image(pin_id: str, client: httpx.AsyncClient) -> PinImage:
    """The pin's picture, as large as Pinterest's CDN offers it up to 736 px.

    oEmbed gives a 236 px thumbnail on i.pinimg.com; the same path under /736x/
    is the bigger copy. Neither is documented by Pinterest, so a missing 736x
    falls back to the thumbnail itself."""
    canonical = f"https://www.pinterest.com/pin/{pin_id}/"
    try:
        response = await client.get(_OEMBED, params={"url": canonical}, timeout=_OEMBED_TIMEOUT)
    except httpx.HTTPError as exc:
        raise PinterestUnavailable(str(exc)) from exc
    if response.status_code in (400, 404):
        raise PinNotFound(pin_id)
    if response.status_code != 200:
        raise PinterestUnavailable(f"oembed {response.status_code}")
    try:
        thumbnail = response.json().get("thumbnail_url")
    except (ValueError, AttributeError) as exc:
        raise PinterestUnavailable("oembed is not json") from exc
    if not isinstance(thumbnail, str):
        raise PinterestUnavailable("no thumbnail")
    parts = urlsplit(thumbnail)
    if parts.scheme != "https" or parts.hostname != _IMAGE_HOST:
        raise PinterestUnavailable("thumbnail is not on i.pinimg.com")

    candidates = [thumbnail]
    if "/236x/" in parts.path:
        candidates.insert(0, thumbnail.replace("/236x/", "/736x/", 1))
    for i, url in enumerate(candidates):
        image = await _download(url, client, last=i == len(candidates) - 1)
        if image is not None:
            return image
    raise PinterestUnavailable("no image")


async def _download(url: str, client: httpx.AsyncClient, *, last: bool) -> PinImage | None:
    """The image at *url*, or None when the next candidate should be tried: a 404,
    or any non-200 while this is not the last candidate (the 736x copy is an
    undocumented convention; the thumbnail oEmbed handed out is the fallback).
    Stops reading the moment it passes MAX_DESIGN_IMAGE_BYTES, Content-Length or not."""
    try:
        async with client.stream("GET", url, timeout=_IMAGE_TIMEOUT) as response:
            if response.status_code == 404 or (response.status_code != 200 and not last):
                return None
            content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
            if response.status_code != 200 or not content_type.startswith("image/"):
                raise PinterestUnavailable(f"image {response.status_code} {content_type}")
            data = bytearray()
            async for chunk in response.aiter_bytes():
                data += chunk
                if len(data) > MAX_DESIGN_IMAGE_BYTES:
                    raise ImageTooLarge(len(data))
    except httpx.HTTPError as exc:
        raise PinterestUnavailable(str(exc)) from exc
    return PinImage(data=bytes(data), content_type=content_type, url=url)
