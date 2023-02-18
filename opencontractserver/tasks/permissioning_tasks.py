#  Copyright (C) 2022  John Scrudato

from config import celery_app
from opencontractserver.utils.permissioning import (
    MakePublicReturnType,
    make_analysis_public,
    make_corpus_public,
)


@celery_app.task()
def make_corpus_public_task(corpus_id: str | int) -> MakePublicReturnType:
    """
    Async celery wrapper for the logic to make a corpus public... This
    is necessary because we can't guarantee the size of a corpus and it's very possible
    it'll be so large that it will cause an http timeout or take a long, long time.
    """
    return make_corpus_public(corpus_id)


@celery_app.task()
def make_analysis_public_task(analysis_id: str | int) -> MakePublicReturnType:
    """
    Async celery wrapper for logic to make an analysis and its annotations public.
    This is necessary for same reason we have make_corpus_public_task... there can be a lot
    of annotations and we don't want http connections to timeout waiting in these circumstances.
    """

    return make_analysis_public(analysis_id=analysis_id)
