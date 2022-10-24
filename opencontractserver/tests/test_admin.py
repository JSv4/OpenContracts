import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import Client, TestCase
from django.urls import reverse

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

        User.objects.create_superuser(
            username="superuser", password="secret", email="admin@example.com"
        )

        self.admin_client = Client()
        self.admin_client.login(username="superuser", password="secret")

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

    # def test_view_gremlin(self, admin_client):
    #     user = User.objects.get(username="admin")
    #     url = reverse("admin:analyzer_gremlinengine_change", kwargs={"object_id": user.pk})
    #     response = admin_client.get(url)
    #     assert response.status_code == 200
