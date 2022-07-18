from __future__ import annotations

import logging
from typing import NoReturn

from django.contrib.auth import get_user_model
from guardian.shortcuts import assign_perm

User = get_user_model()

logger = logging.getLogger(__name__)


# Helper method to give all perms for a given model instance to a given user
def grant_all_permissions_for_obj_to_user(
    user_val: int | str | User, instance
) -> NoReturn:

    logger.debug(
        f"grant_all_permissions_for_obj_to_user - user ({user_val}) / obj ({instance})"
    )

    # Provides some flexibility to use ids where passing object is not practical
    if isinstance(user_val, str) or isinstance(user_val, int):
        user = User.objects.get(id=user_val)
    else:
        user = user_val

    model_name = instance._meta.model_name
    logger.debug(f"Model name: {model_name}")

    app_name = instance._meta.app_label
    logger.debug(f"App name: {app_name}")

    assign_perm(f"{app_name}.create_{model_name}", user, instance)
    assign_perm(f"{app_name}.read_{model_name}", user, instance)
    assign_perm(f"{app_name}.update_{model_name}", user, instance)
    assign_perm(f"{app_name}.remove_{model_name}", user, instance)
    assign_perm(f"{app_name}.permission_{model_name}", user, instance)
