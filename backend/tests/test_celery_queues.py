"""Every queue a task is routed to has a worker in production.

A task routed to a queue nobody consumes is accepted by the broker and never runs.
This reads docker-compose.prod.yml at the repository root (present in CI; skipped
where only backend/ is mounted, as in the local api container).
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

import celery_app

PROD_COMPOSE = Path(__file__).resolve().parents[2] / "docker-compose.prod.yml"
# Routes with no task behind them (app/tasks/ai does not exist): nothing is sent there.
UNUSED_ROUTES = {"app.tasks.ai.*"}


def _consumed_queues(compose_text: str) -> set[str]:
    queues: set[str] = set()
    for match in re.finditer(r"celery -A celery_app worker[^\n]*?-Q\s+([\w,-]+)", compose_text):
        queues.update(match.group(1).split(","))
    return queues


@pytest.mark.skipif(not PROD_COMPOSE.exists(), reason="repository root not mounted")
def test_every_routed_queue_has_a_production_worker():
    consumed = _consumed_queues(PROD_COMPOSE.read_text())
    routes = celery_app.app.conf.task_routes
    missing = {
        pattern: route["queue"] for pattern, route in routes.items()
        if pattern not in UNUSED_ROUTES and route["queue"] not in consumed
    }
    assert not missing, f"queues with no worker in docker-compose.prod.yml: {missing}"


def test_the_ai_style_task_has_its_own_queue():
    name = "app.tasks.furniture_styles.classify_furniture_styles_task"
    assert celery_app.app.amqp.router.route({}, name)["queue"].name == "styles"
    # push notifications stay on default, away from a long AI backfill
    assert celery_app.app.amqp.router.route({}, "app.tasks.push.send_push")["queue"].name == "default"


def test_the_compose_parser_reads_worker_queues():
    text = "command: celery -A celery_app worker -l info -Q default,media -c 4\n" \
           "command: celery -A celery_app worker -l info -Q styles -c 2\n"
    assert _consumed_queues(text) == {"default", "media", "styles"}
