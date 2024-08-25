from typing import Callable, Optional

from config import celery_app


def get_task_by_name(task_name) -> Optional[Callable]:
    """
    Try to get celery task function Callable by name
    """
    try:
        return celery_app.tasks.get(task_name)
    except Exception:
        return None
