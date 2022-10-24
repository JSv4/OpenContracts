## Select Authentication System via Env Variables

For authentication and authorization, you have two choices.
1. You can configure an [Auth0](https://auth0.com/) account and use Auth0 to authenticate users, in which case anyone
   who is permitted to authenticate via your auth0 setup can login and automatically get an account,
2. or, you can require a username and password for each user and our OpenContracts backend can provide user
   authentication and authorization. Using the latter option, there is no currently-supported sign-up method, you'll
   need to use the admin dashboard (See "Adding Users" section).

## Auth0 Auth Setup

You need to configure three, separate applications on Auth0's platform:

1. Configure the SPA as an application. You'll need the App Client ID.
2. Configure the API. You'll need API Audience.
3. Configure a M2M application to access the Auth0 Management API. This is used to fetch user details.
   You'll need the API_ID for the M2M application and the Client Secret for the M2M app.

You'll also need your Auth0 tenant ID (assuming it's the same for all three applications,
though you could, in theory, host them in different tenants).  These directions are not comprehensive, so, if you're
not familiar with Auth0, we recommend you disable Auth0 for the time being and use username and password.

**To enable and configure Auth0 Authentication, you'll need to set the following env variables in your .env file (the
.django file in `.envs/.production` or `.envs/.local`, depending on your target environment). Our sample .envs only
show these fields in the .production sample, but you could use them in the .local env file too:**

1. `USE_AUTH0` - set to `true` to enable Auth0
2. `AUTH0_CLIENT_ID` - should be the client ID configured on Auth0
3. `AUTH0_API_AUDIENCE` - Configured API audience
4. `AUTH0_DOMAIN` - domain of your configured Auth0 application
5. `AUTH0_M2M_MANAGEMENT_API_SECRET` - secret for the auth0 Machine to Machine (M2M) API
6. `AUTH0_M2M_MANAGEMENT_API_ID` - ID for Auth0 Machine to Machine (M2M) API
7. `AUTH0_M2M_MANAGEMENT_GRANT_TYPE` - set to `client_credentials`

#### Detailed Explanation of Auth0 Implementation

To get Auth0 to work nicely with Graphene, we modified the [graphql_jwt](https://github.com/flavors/django-graphql-jwt)
backend to support syncing  remote user metadata with a local user similar to the default, django
`RemoteUserMiddleware`.  We're keeping the graphql_jwt graphene middleware in its entirety as it fetches the  token
and then passes it along to **django** authentication *backend. That django backend  is what we're modifying to decode
the jwt token against Auth0 settings and then check to see if local user exists, and, if not, create it.

Here's the order of operations in the *original* Graphene backend provided by graphql_jwt:

1. Backend's ``authenticate`` method is called from the graphene middleware via django (*from django.contrib.auth
   import authenticate*)
2. token is retrieved via .utils get_credentials
3. if token is not None, get_user_by_token in shortcuts module is called
    1. "Payload" is retrieved via utils.get_payload
    2. User is requested via utils.get_user_by_payload
       1. username is retrieved from payload via `auth0_settings.JWT_PAYLOAD_GET_USERNAME_HANDLER`
       2. user object is retrieved via `auth0_settings.JWT_GET_USER_BY_NATURAL_KEY_HANDLER`

*We modified a couple things:*

1. The decode method called in 3(a) needs to be modified to decode with Auth0 secrets and settings.
2. get_user_by_payload needs to be modified in several ways:
       1. user object must use `RemoteUserMiddleware` logic and, if everything from auth0 decodes properly,
          check to see if user with e-mail exists and, if not, create it. Upon completion of this,
          try to sync user data with auth0.
    2) return created or retrieved user object as original method did

## Django-Based Authentication Setup

The only thing you need to do for this is toggle the two auth0-related environment variables:
1. For the backend environment, set `USE_AUTH0=False` in your environment (either via an environment variable file or
   directly in your environment via the console).
2. For the frontend environment, set `REACT_APP_USE_AUTH0=false` in your environment (either via an environment variable file or
   directly in your environment via the console).

!!! note

    As noted elsewhere, **users cannot sign up on their own**. You need to log into the admin dashboard - e.g.
    `http://localhost:8000/admin` - and add users manually.
