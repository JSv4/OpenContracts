import logging
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import Client, TestCase
from django.urls import reverse

from opencontractserver.corpuses.admin import CorpusAdmin
from opencontractserver.corpuses.models import Corpus

User = get_user_model()

logger = logging.getLogger(__name__)


def get_admin_change_view_url(obj: object) -> str:
    return reverse(
        f"admin:{obj._meta.app_label}_{type(obj).__name__.lower()}_change",
        args=(obj.pk,),
    )


def get_admin_changelist_view_url(obj: object) -> str:
    return reverse(
        "admin:{}_{}_changelist".format(
            obj._meta.app_label, type(obj).__name__.lower()
        ),
        args=(obj.pk,),
    )


class TestUserAdmin(TestCase):
    def setUp(self) -> None:

        User.objects.create_superuser(
            username="superuser", password="secret", email="admin@example.com"
        )

        self.admin_client = Client()
        self.admin_client.login(username="superuser", password="secret")

    def test_user_change_view(self):

        # create test data
        my_group = Group.objects.create(name="Test Group")

        # run test
        response = self.admin_client.get(get_admin_change_view_url(my_group))
        self.assertEqual(response.status_code, 200)

    def test_changelist(self):
        url = reverse("admin:users_user_changelist")
        response = self.admin_client.get(url)
        assert response.status_code == 200

    def test_search(self):
        url = reverse("admin:users_user_changelist")
        response = self.admin_client.get(url, data={"q": "test"})
        assert response.status_code == 200

    def test_add(self):
        url = reverse("admin:users_user_add")
        response = self.admin_client.get(url)
        assert response.status_code == 200

        response = self.admin_client.post(
            url,
            data={
                "username": "test",
                "password1": "My_R@ndom-P@ssw0rd",
                "password2": "My_R@ndom-P@ssw0rd",
            },
        )
        assert response.status_code == 302
        assert User.objects.filter(username="test").exists()

    def test_view_user(self):
        user = User.objects.get(username="admin")
        url = reverse("admin:users_user_change", kwargs={"object_id": user.pk})
        response = self.admin_client.get(url)
        assert response.status_code == 200


class TestAnalyzerAdmin(TestCase):
    def setUp(self) -> None:

        self.user = User.objects.create_superuser(
            username="superuser", password="secret", email="admin@example.com"
        )

        self.admin_client = Client()
        self.admin_client.login(username="superuser", password="secret")
        self.corpus_admin = CorpusAdmin(Corpus, None)

    def test_gremlin_changelist(self):
        url = reverse("admin:analyzer_gremlinengine_changelist")
        response = self.admin_client.get(url)
        assert response.status_code == 200

    def test_gremlin_add(self):

        user = User.objects.get(username="admin")
        url = reverse("admin:analyzer_gremlinengine_add")
        response = self.admin_client.get(url)
        assert response.status_code == 200

        response = self.admin_client.post(
            url,
            data={
                "creator_id": user.id,
                "url": "www.myrandomurl.com",
            },
        )

        logger.info(f"test_add - response: {response}")

    def test_display_icon_with_icon(self):
        obj = Mock(icon=Mock(url="http://example.com/icon.png"))
        result = self.corpus_admin.display_icon(obj)
        self.assertIn('src="http://example.com/icon.png"', result)
        self.assertIn('width="50"', result)
        self.assertIn('height="50"', result)

    def test_display_icon_without_icon(self):
        obj = Mock(icon=None)
        result = self.corpus_admin.display_icon(obj)
        self.assertEqual(result, "No icon")

    @patch("opencontractserver.tasks.make_corpus_public_task.si")
    def test_make_public(self, mock_task):
        mock_task.return_value.apply_async.return_value = None

        corpus1 = Corpus(
            title="Test", description="Some important stuff!", creator=self.user
        )
        corpus1.save()

        corpus2 = Corpus(
            title="Test2", description="Some important stuff!", creator=self.user
        )
        corpus2.save()

        request = Mock()
        self.corpus_admin.message_user = Mock()

        self.corpus_admin.make_public(request, Corpus.objects.all())

        # Verify make_corpus_public_task was called for each corpus
        mock_task.assert_any_call(corpus_id=1)
        mock_task.assert_any_call(corpus_id=2)
        self.assertEqual(mock_task.call_count, 2)

        # Verify the correct message was sent to the user
        self.corpus_admin.message_user.assert_called_once_with(
            request, "Started making 2 corpus(es) public."
        )
