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

from app.services.pinterest_pin import NotAPinUrl, resolve_pin_id


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
