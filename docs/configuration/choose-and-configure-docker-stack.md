## Deployment Options

OpenContracts is designed to be deployed using docker-compose. You can run it locally or in a production environment. Follow the instructions below for a local environment if you just want to test it or you want to use it for yourself and don't intend to make the application available to other users via the Internet.

### Local Deployment

#### Quick Start with Default Settings
A "local" deployment is deployed on your personal computer and is not meant to be accessed over the Internet. If you
don't need to configure anything, just follow the quick start guide above to get up and running with a local deployment
without needing any further configuration.

#### Setup .env Files

##### Backend

After cloning this repo to a machine of your choice, create a folder for your environment
files in the repo root. You'll need `./.envs/.local/.django` and `./.envs/.local/.postgres`
Use the samples in `./documentation/sample_env_files/local` as guidance.
NOTE, you'll need to replace the placeholder passwords and users where noted, but, otherwise, minimal config should be
required.

##### Frontend

In the `./frontend` folder, you also need to create a single .env file which holds your configurations for your login
method as well as certain feature switches (e.g. turn off imports). We've included a sample using auth0 and
another sample using django's auth backend. Local vs production deployments are essentially the same, but the root
url of the backend will change from localhost to whereever you're hosting the application in production.

#### Build the Stack

Once your .env files are setup, build the stack using docker-compose:

` $ docker-compose -f local.yml build`

Then, run migrations (to setup the database):

` $ docker-compose -f local.yml run django python manage.py migrate`

Then, create a superuser account that can log in to the admin dashboard (in a local deployment this is available at `http://localhost:8000/admin`) by typing this command and following the prompts:

```
$ docker-compose -f local.yml run django python manage.py createsuperuser
```

Finally, bring up the stack:

```
$ docker-compose -f local.yml up
```

You should now be able to access the OpenContracts frontend by visiting `http://localhost:3000`.

### Production Environment

The production environment is designed to be public-facing and exposed to the Internet, so there are quite a number more configurations required than a local deployment, particularly if you use an AWS S3 storage backend or the Auth0 authentication system.

After cloning this repo to a machine of your choice, configure the production .env files as described above.

You'll also need to configure your website url. This needs to be done in a few places.

First, in `opencontractserver/contrib/migrations`, you'll fine a file called `0003_set_site_domain_and_name.py`. BEFORE  running any of your migrations, you should modify the `domain` and `name` defaults you'll fine in `update_site_forward`:

```
def update_site_forward(apps, schema_editor):
 """Set site domain and name.""" Site = apps.get_model("sites", "Site") Site.objects.update_or_create( id=settings.SITE_ID, defaults={ "domain": "opencontracts.opensource.legal", "name": "OpenContractServer", }, )
```

and `update_site_backward`:

```
def update_site_backward(apps, schema_editor):
 """Revert site domain and name to default.""" Site = apps.get_model("sites", "Site") Site.objects.update_or_create( id=settings.SITE_ID, defaults={"domain": "example.com", "name": "example.com"} )
```

Finally, don't forget to configure Treafik, the router in the docker-compose stack that exposes different containers to
end-users depending on the route (url) received you need to update the Treafik file [here](/compose/production/traefik/traefik.yml).

If you're using Auth0, see the [Auth0 configuration section](#### Auth0 Configuration).

If you're using AWS S3 for file storage, see the [AWS configuration](#### AWS Configuration) section. NOTE, the underlying django library that provides cloud storage, django-storages, can also work with other cloud providers such as Azure and GCP. See the django storages library docs for more info.

```commandline
$ docker-compose -f production.yml build
```

Then, run migrations (to setup the database):

```commandline
$ docker-compose -f production.yml run django python manage.py migrate`
```

Then, create a superuser account that can log in to the admin dashboard (in a production deployment this is available at the url set in your env file as the `DJANGO_ADMIN_URL`) by typing this command and following the prompts:

```
$ docker-compose -f production.yml run django python manage.py createsuperuser
```

Finally, bring up the stack:

```
$ docker-compose -f production.yml up
```

You should now be able to access the OpenContracts frontend by visiting `http://localhost:3000`.

## ENV File Configurations

OpenContracts is configured via .env files. For a local deployment, these should go in `.envs/.local`. For production,
use `.envs/.production`. Sample .envs for each deployment environment are provided in `documentation/sample_env_files`.

The local configuration should let you deploy the application on your PC without requiring any specific configuration.
The production configuration is meant to provide a web application and requires quite a bit more configuration and
knowledge of web apps.

## Include Gremlin
If you want to include a Gremlin analyzer, use `local_deploy_with_gremlin.yml` or `production_deploy_with_gremlin.yml`
instead of `local.yml` or `production.yml`, respectively. All other parts of the tutorial are the same.
