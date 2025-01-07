import logging

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views import defaults as default_views
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponseRedirect
from graphene_django.views import GraphQLView

from opencontractserver.analyzer.views import AnalysisCallbackView

logger = logging.getLogger(__name__)

def home_redirect(request):
    scheme = "https" if request.is_secure() else "http"
    host = request.get_host().split(":")[0]
    new_url = f"{scheme}://{host}:3000"
    return HttpResponseRedirect(new_url)

urlpatterns = [
    path("", home_redirect, name="home_redirect"),  # Root URL redirect to port 3000
    path(settings.ADMIN_URL, admin.site.urls),
    path("graphql/", csrf_exempt(GraphQLView.as_view(graphiql=settings.DEBUG))),
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
            *(
                []
                if not settings.USE_SILK
                else [path("silk/", include("silk.urls", namespace="silk"))]
            ),
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
