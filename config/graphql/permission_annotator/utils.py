from __future__ import annotations

import logging

from django.contrib.auth import get_user_model

from config.graphql.permission_annotator.middleware import (
    get_permissions_for_user_on_model_in_app,
)
from opencontractserver.shared.Models import BaseOCModel

User = get_user_model()

logger = logging.getLogger(__name__)


def generate_permission_annotations_dict(
    model_django_type: type[BaseOCModel], user: type[User]
):

    model_name = model_django_type._meta.model_name
    app_name = model_django_type._meta.app_label

    return get_permissions_for_user_on_model_in_app(app_name, model_name, user)
