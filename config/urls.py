import logging

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path
from django.views import defaults as default_views
from django.views.decorators.csrf import csrf_exempt
from graphene_django.views import GraphQLView

from opencontractserver.analyzer.views import AnalysisCallbackView

logger = logging.getLogger(__name__)

urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),
    path("graphql/", csrf_exempt(GraphQLView.as_view(graphiql=True))),
    *(
        []
        if not settings.USE_ANALYZER
        else [
            path("analysis/<int:analysis_id>/complete", AnalysisCallbackView.as_view())
        ]
    ),
    *(
        []
        if not settings.DEBUG
        else [
            path(
                "400/",
                default_views.bad_request,
                kwargs={"exception": Exception("Bad Request!")},
            ),
            path(
                "403/",
                default_views.permission_denied,
                kwargs={"exception": Exception("Permission Denied")},
            ),
            path(
                "404/",
                default_views.page_not_found,
                kwargs={"exception": Exception("Page not Found")},
            ),
            path("500/", default_views.server_error),
        ]
    ),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
