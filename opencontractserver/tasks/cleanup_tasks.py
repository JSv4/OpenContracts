#  Copyright (C) 2022  John Scrudato

import logging

from django.contrib.auth import get_user_model

from config import celery_app
from opencontractserver.utils.cleanup import delete_analysis_and_annotations

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

User = get_user_model()


@celery_app.task()
def delete_analysis_and_annotations_task(analysis_pk: int | str = -1) -> bool:

    return delete_analysis_and_annotations(
        analysis_pk=analysis_pk,
    )
