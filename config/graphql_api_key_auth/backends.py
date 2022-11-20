#  Copyright (C) 2022  John Scrudato / Gordium Knot Inc. d/b/a OpenSource.Legal
#
#  This program is free software: you can redistribute it and/or modify
#  it under the terms of the GNU Affero General Public License as
#  published by the Free Software Foundation, either version 3 of the
#  License, or (at your option) any later version.
from django.conf import settings

#  You should have received a copy of the GNU Affero General Public License
#  along with this program.  If not, see <https://www.gnu.org/licenses/>.
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions

from config.graphql_api_key_auth.utils import get_authorization_header

#  This program is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU Affero General Public License for more details.


UserModel = get_user_model()


class Auth0ApiKeyBackend:

    model = None

    def get_model(self):

        if self.model is not None:
            return self.model

        from rest_framework.authtoken.models import Token

        return Token

    """
    A custom token model may be used, but must have the following properties.
    * key -- The string identifying the token
    * user -- The user to which the token belongs
    """

    def authenticate(self, request=None, **kwargs):

        if request is None:
            return None

        auth = get_authorization_header(request).split()

        if not auth or auth[0].lower() != settings.API_TOKEN_PREFIX.lower().encode():
            return None

        if len(auth) == 1:
            msg = _("Invalid token header. No credentials provided.")
            raise exceptions.AuthenticationFailed(msg)
        elif len(auth) > 2:
            msg = _("Invalid token header. Token string should not contain spaces.")
            raise exceptions.AuthenticationFailed(msg)

        try:
            token = auth[1].decode()
        except UnicodeError:
            msg = _(
                "Invalid token header. Token string should not contain invalid characters."
            )
            raise exceptions.AuthenticationFailed(msg)

        return self.authenticate_credentials(token)

    def authenticate_credentials(self, key):
        model = self.get_model()
        try:
            token = model.objects.select_related("user").get(key=key)
        except model.DoesNotExist:
            raise exceptions.AuthenticationFailed(_("Invalid token."))

        if not token.user.is_active:
            raise exceptions.AuthenticationFailed(_("User inactive or deleted."))

        return token.user

    def authenticate_header(self, request):
        return self.keyword
