"""The paid background jobs must never be re-run by Celery.

The app-wide default is acks_late + reject_on_worker_lost, which re-delivers a job
whose worker died. For a job that spends money at a provider that means a deploy
that kills a worker mid-run gets the job run a second time later, and charged a
second time. These four are opted out; this pins it.
"""
import pytest

from app.tasks import media

PAID = [
    media.render_room_image,
    media.relight_render,
    media.upscale_render,
    media.generate_model_from_photo,
]


@pytest.mark.parametrize("task", PAID, ids=lambda t: t.name.rsplit(".", 1)[-1])
def test_a_paid_job_is_not_redelivered_when_its_worker_dies(task):
    assert task.acks_late is False
    assert task.reject_on_worker_lost is False


@pytest.mark.parametrize("task", PAID, ids=lambda t: t.name.rsplit(".", 1)[-1])
def test_a_paid_job_is_not_retried_either(task):
    # max_retries unset on these tasks: nothing calls self.retry, and the docstrings promise it.
    import inspect

    assert "self.retry" not in inspect.getsource(task.run)
