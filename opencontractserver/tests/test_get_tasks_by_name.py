import unittest
from unittest.mock import patch

from celery import shared_task

from config import celery_app
from opencontractserver.shared.decorators import doc_analyzer_task
from opencontractserver.utils.celery_tasks import (
    get_doc_analyzer_task_by_name,
    get_task_by_name,
)


# Sample tasks for testing
@shared_task
def regular_task():
    pass


@doc_analyzer_task()
def doc_analyzer_decorated_task():
    pass


class GetTaskByNameTestCase(unittest.TestCase):
    def setUp(self):
        # Register the sample tasks with Celery
        celery_app.tasks["regular_task"] = regular_task
        celery_app.tasks["doc_analyzer_decorated_task"] = doc_analyzer_decorated_task

    def test_get_task_by_name(self):

        # Test with existing tasks
        self.assertIsNotNone(get_task_by_name("regular_task"))
        self.assertIsNotNone(get_task_by_name("doc_analyzer_decorated_task"))

        # Test with non-existent task
        self.assertIsNone(get_task_by_name("non_existent_task"))

    def test_get_doc_analyzer_task_by_name(self):

        # Test with regular task (should return None)
        self.assertIsNone(get_doc_analyzer_task_by_name("regular_task"))

        # Test with doc_analyzer_task decorated task (should return the task)
        self.assertIsNotNone(
            get_doc_analyzer_task_by_name("doc_analyzer_decorated_task")
        )

        # Test with non-existent task
        self.assertIsNone(get_doc_analyzer_task_by_name("non_existent_task"))

    @patch("config.celery_app.tasks")
    def test_new_get_task_by_name_exception(self, mock_tasks):
        # Set up the mock to raise an exception
        mock_tasks.get.side_effect = Exception("Celery task lookup failed")

        # Test that the function returns None when an exception is raised
        self.assertIsNone(get_doc_analyzer_task_by_name("any_task"))


if __name__ == "__main__":
    unittest.main()
