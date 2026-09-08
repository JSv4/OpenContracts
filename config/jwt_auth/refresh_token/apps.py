from django.apps import AppConfig


class RefreshTokenConfig(AppConfig):
    name = "config.jwt_auth.refresh_token"
    # Preserve the migration recorder entries, content types, and table name
    # for deployments that enabled django-graphql-jwt's optional model.
    label = "refresh_token"
    verbose_name = "Refresh token"
