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


def get_doc_analyzer_task_by_name(task_name) -> Optional[Callable]:
    """
    Get celery task function Callable by name, only for tasks decorated with doc_analyzer_task
    """
    try:
        task = celery_app.tasks.get(task_name)
        if task and getattr(task, 'is_doc_analyzer_task', False):
            return task
        return None
    except Exception:
        return None
