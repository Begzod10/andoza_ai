"""
Pinterest pin links: from what the user pasted to the pin's image.

The server only ever talks to Pinterest's own hosts (pin.it, *.pinterest.*,
www.pinterest.com for oEmbed, i.pinimg.com for the image) and never lets
httpx follow a redirect on its own, so a link cannot steer it anywhere else.
All network traffic here goes through httpx.MockTransport.
"""
from __future__ import annotations

import httpx
import pytest

from app.services.design_image import MAX_DESIGN_IMAGE_BYTES, ImageTooLarge
from app.services.pinterest_pin import (
    NotAPinUrl,
    PinNotFound,
    PinterestUnavailable,
    fetch_pin_image,
    resolve_pin_id,
)


class _Net:
    """A fake internet: routes requests by URL, records every one."""

    def __init__(self, routes: dict[str, httpx.Response] | None = None, handler=None):
        self.routes = routes or {}
        self.handler = handler
        self.seen: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.seen.append(request)
        if self.handler:
            return self.handler(request)
        key = str(request.url)
        if key not in self.routes:
            return httpx.Response(599, text=f"unexpected {key}")
        return self.routes[key]

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self), follow_redirects=False)


@pytest.mark.parametrize(
    ("url", "pin_id"),
    [
        ("https://www.pinterest.com/pin/516647388484185204/", "516647388484185204"),
        ("https://mx.pinterest.com/pin/1128573987869737314/", "1128573987869737314"),
        ("https://www.pinterest.com/pin/30-scandinavian-living-room--816207132442097239/", "816207132442097239"),
        ("https://pinterest.co.uk/pin/123456789/", "123456789"),
        ("  https://www.pinterest.com/pin/123456789/?mt=login&utm_source=x#c  ", "123456789"),  # Review Focus 1
        ("https://WWW.Pinterest.COM./pin/123456789/", "123456789"),  # Review Focus 2
    ],
)
async def test_pin_links_resolve_to_their_id_without_any_request(url, pin_id):
    net = _Net()
    async with net.client() as client:
        assert await resolve_pin_id(url, client) == pin_id
    assert net.seen == []


@pytest.mark.parametrize(
    "url",
    [
        "http://www.pinterest.com/pin/123456789/",
        "https://www.pinterest.com:8443/pin/123456789/",
        "https://user@www.pinterest.com/pin/123456789/",
        "https://example.com/pin/123456789/",
        "https://pinterest.com.evil.com/pin/123456789/",
        "https://evilpinterest.com/pin/123456789/",
        "https://www.pinterest.com/someone/boards/",
        "https://www.pinterest.com/pin/abc/",
        "https://www.pinterest.com/pin/123/",
        "not a url",
        "",
        "https://pin.it/abc\u0000",   # final review: reached httpx and gave a 500
        "https://pin.it/abc\u007f",
        "https://pin.it/ab\tcd",
    ],
)
async def test_anything_else_is_not_a_pin_url(url):
    net = _Net()
    async with net.client() as client:
        with pytest.raises(NotAPinUrl):
            await resolve_pin_id(url, client)
    assert net.seen == []


def _redirect(location: str, status: int = 301) -> httpx.Response:
    return httpx.Response(status, headers={"Location": location})


async def test_a_pin_it_link_follows_its_redirects_to_the_pin():
    net = _Net({
        "https://pin.it/abc": _redirect("https://api.pinterest.com/url_shortener/abc/redirect/"),
        "https://api.pinterest.com/url_shortener/abc/redirect/": _redirect("https://www.pinterest.com/pin/987654321/", 302),
    })
    async with net.client() as client:
        assert await resolve_pin_id("https://pin.it/abc", client) == "987654321"
    assert [str(r.url) for r in net.seen] == [
        "https://pin.it/abc", "https://api.pinterest.com/url_shortener/abc/redirect/",
    ]


async def test_a_pin_it_link_that_redirects_elsewhere_is_refused():
    net = _Net({"https://pin.it/abc": _redirect("https://evil.com/pin/1234567/")})
    async with net.client() as client:
        with pytest.raises(NotAPinUrl):
            await resolve_pin_id("https://pin.it/abc", client)
    assert all(r.url.host != "evil.com" for r in net.seen)


async def test_more_than_3_redirects_is_refused():
    net = _Net({
        "https://pin.it/a": _redirect("https://pin.it/b"),
        "https://pin.it/b": _redirect("https://pin.it/c"),
        "https://pin.it/c": _redirect("https://pin.it/d"),
        "https://pin.it/d": _redirect("https://www.pinterest.com/pin/987654321/"),
    })
    async with net.client() as client:
        with pytest.raises(NotAPinUrl):
            await resolve_pin_id("https://pin.it/a", client)


async def test_a_pin_it_host_that_answers_405_to_head_is_asked_with_get():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "HEAD":
            return httpx.Response(405)
        return _redirect("https://www.pinterest.com/pin/555555555/")

    net = _Net(handler=handler)
    async with net.client() as client:
        assert await resolve_pin_id("https://pin.it/xyz", client) == "555555555"
    assert [r.method for r in net.seen] == ["HEAD", "GET"]



# ── fetch_pin_image ──────────────────────────────────────────────────────────

PIN = "123456789"
OEMBED = "https://www.pinterest.com/oembed.json?url=https%3A%2F%2Fwww.pinterest.com%2Fpin%2F123456789%2F"
THUMB_236 = "https://i.pinimg.com/236x/03/8b/x.jpg"
THUMB_736 = "https://i.pinimg.com/736x/03/8b/x.jpg"
JPEG = b"\xff\xd8\xff" + b"JPG"


def _oembed(thumb: str = THUMB_236) -> httpx.Response:
    return httpx.Response(200, json={"type": "rich", "thumbnail_url": thumb})


def _jpeg(body: bytes = JPEG) -> httpx.Response:
    return httpx.Response(200, content=body, headers={"Content-Type": "image/jpeg"})


async def _fetch(net: _Net):
    async with net.client() as client:
        return await fetch_pin_image(PIN, client)


async def test_the_736_version_of_the_oembed_thumbnail_is_fetched():
    net = _Net({OEMBED: _oembed(), THUMB_736: _jpeg()})
    image = await _fetch(net)
    assert (image.url, image.content_type, image.data) == (THUMB_736, "image/jpeg", JPEG)
    assert str(net.seen[0].url) == OEMBED


async def test_without_a_736_version_the_original_thumbnail_is_used():
    net = _Net({OEMBED: _oembed(), THUMB_736: httpx.Response(404), THUMB_236: _jpeg()})
    assert (await _fetch(net)).url == THUMB_236


async def test_a_thumbnail_not_on_pinimg_is_never_requested():
    net = _Net({OEMBED: _oembed("https://evil.com/236x/x.jpg")})
    with pytest.raises(PinterestUnavailable):
        await _fetch(net)
    assert all(r.url.host != "evil.com" for r in net.seen)


@pytest.mark.parametrize("status", [400, 404])
async def test_an_unknown_or_private_pin_is_not_found(status):
    with pytest.raises(PinNotFound):
        await _fetch(_Net({OEMBED: httpx.Response(status)}))


@pytest.mark.parametrize("answer", ["500", "timeout", "not json"])
async def test_pinterest_failing_is_unavailable(answer):
    def handler(request):
        if answer == "timeout":
            raise httpx.ReadTimeout("slow", request=request)
        if answer == "500":
            return httpx.Response(500)
        return httpx.Response(200, text="<html>not json</html>")

    with pytest.raises(PinterestUnavailable):
        await _fetch(_Net(handler=handler))


async def test_an_image_response_that_is_not_an_image_is_unavailable():
    net = _Net({OEMBED: _oembed(), THUMB_736: httpx.Response(200, text="<html/>", headers={"Content-Type": "text/html"})})
    with pytest.raises(PinterestUnavailable):
        await _fetch(net)


async def test_an_image_over_10_mb_is_too_large():
    net = _Net({OEMBED: _oembed(), THUMB_736: _jpeg(JPEG + b"0" * MAX_DESIGN_IMAGE_BYTES)})
    with pytest.raises(ImageTooLarge):
        await _fetch(net)


async def test_no_request_follows_redirects():
    net = _Net({OEMBED: _oembed(), THUMB_736: _redirect("https://evil.com/x.jpg", 302)})
    with pytest.raises(PinterestUnavailable):
        await _fetch(net)
    assert all(r.url.host != "evil.com" for r in net.seen)


# Review Focus
async def test_a_thumbnail_that_is_not_236x_is_used_as_is():
    thumb = "https://i.pinimg.com/564x/03/8b/x.jpg"
    net = _Net({OEMBED: _oembed(thumb), thumb: _jpeg()})
    assert (await _fetch(net)).url == thumb
    assert [str(r.url) for r in net.seen] == [OEMBED, thumb]


async def test_a_chunked_image_without_content_length_still_stops_at_10_mb():
    async def chunks():  # no Content-Length: httpx sends it chunked
        yield JPEG
        for _ in range(11):
            yield b"0" * (1024 * 1024)

    def handler(request):
        if str(request.url) == OEMBED:
            return _oembed()
        return httpx.Response(200, content=chunks(), headers={"Content-Type": "image/jpeg"})

    with pytest.raises(ImageTooLarge):
        await _fetch(_Net(handler=handler))



@pytest.mark.parametrize("status", [403, 500, 302])
async def test_any_failure_of_the_736_variant_falls_back_to_the_original(status):
    # Final review: only a 404 fell back, so a blocked 736x gave a 502 while the
    # thumbnail Pinterest handed out was fine.
    failing = _redirect("https://i.pinimg.com/other.jpg", status) if status == 302 else httpx.Response(status)
    net = _Net({OEMBED: _oembed(), THUMB_736: failing, THUMB_236: _jpeg()})
    assert (await _fetch(net)).url == THUMB_236
