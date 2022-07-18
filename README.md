# OpenContractServer

## What is it?

OpenContracts is an **Apache-2 Licensed** software application to label, share and search annotate documents. It's  designed specifically to label documents with complex layouts such as contracts, scientific papers, newspapers, etc.

At the moment, it only works with PDFs. In the future, it will be able to convert other document types to PDF for storage and labeling. PDF is an excellent format for this as it introduces a consistent, repeatable format which we can use to generate a text and x-y coordinate layer from scratch. Formats like .docx and .html are too complex and varied to provide an easy, consistent format. Likewise, the output quality of many converters and tools is sub-par and these tools can produce very different document structures for the same inputs.

The Open Contract stack is designed to provide a cutting edge frontend experience while providing access to the incredible machine learning and natural language processing capabilities of Python. For this reason, our frontend is based on React. We use a GraphQL API to connect it to a django-based backend. Django is a incredibly mature, battle-tested framework that is written in Python, so integrating all the amazing Python-based AI and NLP libraries out there is super easy.

We'd like to give credit to AllenAI's PAWLs project for our document annotating component. We heavily refactored parts of the code base and replaced their backend entirely, so it made sense to fork it, but we believe in giving credit where it's due! We are relying on their document parser, however, as it produces a really excellent text and x-y coordinate layer that we'd encourage others to use as well in similar applications that require you to interact with complex text layouts.

## Getting Started

### System Requirements

You will need Docker and Docker Compose installed to run Open Contracts. We've developed and run the application a Linux x86_64 environment. We haven't tested on Windows, and it's known that celery is
[not supported](https://stackoverflow.com/questions/37255548/how-to-run-celery-on-windows) on Windows. For this reason, we do not recommend deployment on Windows. If you must run on a Windows machine, consider using a virtual machine or using the Windows Linux Subsystem.

If you need help setting up Docker, we recommend [Digital Ocean's setup guide](https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-on-ubuntu-20-04).
Likewise, if you need assistance setting up Docker Compose, Digital Ocean's
[guide](https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-compose-on-ubuntu-20-04) is excellent.

### Quick Start (For use on your local machine)

This guide is for people who want to quickly get started using the appliction and aren't interested in hosting
it online for others to use. You'll get a default, local user with admin access. We recommend you change
the user password after completing this tutorial. We assume you're using Linux or Max OS, but you could
do this on Windows too, assuming you have docker compose and docker installed. The commands to create
directories will be different on Windows, but the git, docker and docker-compose commands should all be the
same.

**Step 1**: Clone this Repo

Clone the repository into a local directory of your choice. Here, we assume you are using a folder
called source in your user's home directory:

```
    $ cd ~
    $ mkdir source
    $ cd source
    $ git clone https://github.com/JSv4/OpenContracts.git
```

**Step 2**: Build the Stack

Change into the directory of the repository you just cloned, e.g.:

```
    cd OpenContracts
```

Now, you need to build the docker compose stack. IF you are okay with the default username and password, and, most
importantly, you are NOT PLANNING TO HOST THE APPLICATION online, the default, local settings are sufficient
and no configuration is required. If you want to change the

```
    $ docker-compose -f local.yml build
```

Bring up the stack:

```
$ docker-compose -f local.yml up
```

Congrats! You have OpenContracts running. If you go to `http://localhost:3000` in your browser,
you'll see the login page. You can login with the default username and password. These are set in the
environment variable file you can find in the `./.envs/.local/' directory. In that directory, you'll see
a file called `.django`.

#### Modify Default Username / Password

##### Prior to First Deployment

If the variable `DJANGO_SUPERUSER_USERNAME` is set, that will be the default admin user created on startup (the first
time your run `docker-compose -f local.yml up`). The repo ships with a default superuser username of `admin`.
The default password is set using the `DJANGO_SUPERUSER_PASSWORD` variable. The environment files for local deployments
(**but not production**) include a default password of `Openc0ntracts_def@ult`. **You should change this in the
environment file *before* the first start OR, follow the instructions below to change it *after* the first start.**

If you modify these environment variables in the environment file BEFORE running the docker-compose `up` command
for the first time, your initial superuser will have the username, email and/or password you specify. If you don't
modify the defaults, you can change them after you have created them via the admin dashboard (see below).

##### After First Deployment

Once the default superuser has been created, you'll need to use the admin dashboard to modify it.

To manage users, including changing the password, you'll need to access the backend admin dashboard. OpenContracts
is built on Django, which ships with [Django Admin](https://docs.djangoproject.com/en/4.0/ref/contrib/admin/), a tool
to manage low-level object data and users. It doesn't provide the rich, document focused UI/UX our frontend does, but
it does let you edit and delete objects created on the frontend if, for any reason, you are unable to fix something
done by a frontend user (e.g. a corrupt file is uploaded and cannot be parsed or rendered properly on the frontend).

To update your users, first login to the admin panel:

[](/documentation/images/screenshots/Admin_Login_Screen.png)

Then, in the lefthand navbar, find the entry for "Users" and click on it

[](/documentation/images/screenshots/Main_Admin_Page.png)

Then, you'll see a list of all users for this instance. You should see your admin user
and an "Anonymous" user. The Anonymous user is required for public browsing of objcets with their `is_public` field set
to True. The Anonymous user cannot see other objects.

[](/documentation/images/screenshots/User_List_on_First_Login.png)

Click on the admin user to bring up the detailed user view:

[](/documentation/images/screenshots/Admin_User_Details_Page.png)

Now you can click the "WHAT AM I CALLED" button to bring up a dialog to change the user password.

#### Adding More Users

You can use the same User admin page described above to create new users. Alternatively, go back to the main admin page
`http://localhost:8000/admin` and, under the User section, click the "+Add" button:

[](/documentation/images/screenshots/New_User_Button_Highlight.png)

Then, follow the on-screen instructions:

[](/documentation/images/screenshots/New_User_Dialog.png)

When you're done, the username and password you provided can be used to login.

OpenContracts is currently not built to allow users to self-register unless you use the Auth0 authentication. When managing
users yourself, you'll need to add, remove and modify users via the admin panels.

### Development Environment

We use Black and Flake8 for Python Code Styling. These are run via pre-commit before all commits. If you want to develop extensions or code based on OpenContracts, you'll need to setup pre-commit. First, make sure the requirements in `./requirements/local.txt` are installed in your local environment.

Then, install pre-commit into your local git repo. From the root of the repo, run:

```
 $ pre-commit install```
```
If you want to run pre-commit manually on all of the code in the repo, use this command:

```
 $ pre-commit run --all-files
```

When you commit changes to your repo or our repo as a PR, pre-commit will run and ensure your code
follows our style guide and passes linting.

## Deployment Options

OpenContracts is designed to be deployed using docker-compose. You can run it locally or in a production environment. Follow the instructions below for a local environment if you just want to test it or you want to use it for yourself and don't intend to make the application available to other users via the Internet.

### Local Deployment

#### Quick Start with Default Settings
A "local" deployment is deployed on your personal computer and is not meant to be accessed over the Internet. If you
don't need to configure anything, just follow the quick start guide above to get up and running with a local deployment
without needing any further configuration.

#### Customize SEttings

After cloning this repo to a machine of your choice, create a folder for your environment
files in the repo root. You'll need `./.envs/.local/.django` and `./.envs/.local/.postgres` Use the samples in `./documentation/sample_env_files/local` as guidance. NOTE, you'll need to replace the placeholder passwords and users where noted, but, otherwise, minimal config should be required.

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

If you're using Auth0, see the [Auth0 configuration section](#### Auth0 Configuration).

If you're using AWS S3 for file storage, see the [AWS configuration](#### AWS Configuration) section. NOTE, the underlying django library that provides cloud storage, django-storages, can also work with other cloud providers such as Azure and GCP. See the django storages library docs for more info.

` $ docker-compose -f production.yml build`

Then, run migrations (to setup the database):

` $ docker-compose -f production.yml run django python manage.py migrate`

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

OpenContracts is configured via .env files. For a local deployment, these should go in `.envs/.local`. For production, use `.envs/.production`. Sample .envs for each deployment environment are provided in `documentation/sample_env_files`.

The local configuration should let you deploy the application on your PC without requiring any specific configuration. The production configuration is meant to provide a web application and requires quite a bit more configuration and knowledge of web apps.

## Select and Setup Storage Backend

You can use Amazon S3 as a file storage backend (if you set the env flag `USE_AWS=True`, more on that below), or you can use the local storage of the host machine via a Docker volume.

If you want to use AWS S3 to store files (primarily pdfs, but also exports, tokens and txt files), you will need an Amazon AWS account to setup S3. This README does not cover the AWS side of configuration, but there  are a number of [tutorials](https://simpleisbetterthancomplex.com/tutorial/2017/08/01/how-to-setup-amazon-s3-in-a-django-project.html) and [guides](https://testdriven.io/blog/storing-django-static-and-media-files-on-amazon-s3/) to getting AWS configured to be used with a django project.

Once you have an S3 bucket configured, you'll need to set the following env variables in your .env file (the `.django` file in `.envs/.production` or `.envs/.local`, depending on your target environment). Our sample .envs only show these fields in the .production samples, but you could use them in the .local env file too.

**Here the variables you need to set to enable AWS S3 storage:**
1. `USE_AWS` - set to `true` since you're using AWS, otherwise the backend will use a docker volume for storage.
2. `DJANGO_AWS_ACCESS_KEY_ID` - the access key ID created by AWS when you set up your IAM user (see tutorials above).
3. `DJANGO_AWS_SECRET_ACCESS_KEY` - the secret access key created by AWS when you set up up your IAM user (see tutorials above)
4. `DJANGO_AWS_STORAGE_BUCKET_NAME` - the name of the AWS bucket you created to hold the files.
5. `DJANGO_AWS_S3_REGION_NAME` - the region of the AWS bucket you configured.

## Select and Setup Authentication System

For authentication and authorization, we have two choices. You can configure an [Auth0](https://auth0.com/) account and use Auth0 to authenticate users, in which case anyone who is permitted to authenticate via a Google account in your Auth0 instance can login and automatically get an account, or, you can require a username and password for each user. Using the latter option, there is no currently-supported sign-up method.

#### Auth0 Auth Setup

You need to configure three, separate applications on Auth0's platform:

1) Configure the SPA as an application. You'll need the App Client ID.
2) Configure the API. You'll need API Audience.
3) Configure a M2M application to access the Auth0 Management API. This is used to fetch user details.
   You'll need the API_ID for the M2M application and the Client Secret for the M2M app.

You'll also need your Auth0 tenant ID (assuming it's the same for all three applications,
though you could, in theory, host them in different tenants).  These directions are not comprehensive, so, if you're not familiar with Auth0, we recommend you disable Auth0 for the time being and use username and password.

**To enable and configure Auth0 Authentication, you'll need to set the following env variables in your .env file (the .django file in `.envs/.production` or `.envs/.local`, depending on your target environment). Our sample .envs only show these fields in the .production sample, but you could use them in the .local env file too:**

1. `USE_AUTH0` - set to `true` to enable Auth0
2. `AUTH0_CLIENT_ID` - should be the client ID configured on Auth0
3. `AUTH0_API_AUDIENCE` - Configured API audience
4. `AUTH0_DOMAIN` - domain of your configured Auth0 application
5. `AUTH0_M2M_MANAGEMENT_API_SECRET` - secret for the auth0 Machine to Machine (M2M) API
6. `AUTH0_M2M_MANAGEMENT_API_ID` - ID for Auth0 Machine to Machine (M2M) API
7. `AUTH0_M2M_MANAGEMENT_GRANT_TYPE` - set to `client_credentials`

#### Detailed Explanation of Auth0 Implementation

To get Auth0 to work nicely with Graphene, we modified the [graphql_jwt](https://github.com/flavors/django-graphql-jwt) backend to support syncing  remote user metadata with a local user similar to the default, django `RemoteUserMiddleware`.  We're keeping the graphql_jwt graphene middleware in its entirety as it fetches the  token and then passes it along to **django** authentication *backend. That django backend  is what we're modifying to decode the jwt token against Auth0 settings and then check to see if local user exists, and, if not, create it.

Here's the order of operations in the *original* Graphene backend provided by graphql_jwt:

1. Backend's ``authenticate`` method is called from the graphene middleware via django (*from django.contrib.auth import authenticate*)
2. token is retrieved via .utils get_credentials
3. if token is not None, get_user_by_token in shortcuts module is called
    1. "Payload" is retrieved via utils.get_payload
    2. User is requested via utils.get_user_by_payload
       1. username is retrieved from payload via `auth0_settings.JWT_PAYLOAD_GET_USERNAME_HANDLER`
       2. user object is retrieved via `auth0_settings.JWT_GET_USER_BY_NATURAL_KEY_HANDLER`

*We modified a couple things:*

1) The decode method called in 3(a) needs to be modified to decode with Auth0 secrets and settings.
2) get_user_by_payload needs to be modified in several ways:
    1) user object must use `RemoteUserMiddleware` logic and, if everything from auth0 decodes properly,
       check to see if user with e-mail exists and, if not, create it. Upon completion of this,
       try to sync user data with auth0.
    2) return created or retrieved user object as original method did

## Generating GraphQL Schema Files

Open Contracts uses Graphene to provide a rich GraphQL endpoint, complete with the GraphiQL query application. For some
applications, you may want to generate a GraphQL schema file in SDL or json. To do this, run your choice of the
following commands.

For an SDL file:

```
$ docker-compose -f local.yml run django python manage.py graphql_schema --schema config.graphql.schema.schema --out schema.graphql
```

For a JSON file:

```
$ docker-compose -f local.yml run django python manage.py graphql_schema --schema tutorial.quickstart.schema --out schema.json
```

## Testing

Our test suite is a bit sparse, but we're working to improve coverage on the backend. Frontend tests will likely take longer to implement. Our existing tests do test imports and a number of the utility functions for manipulating annotations. These tests are integrated in our GitHub actions.

To run the tests, check your test coverage, and generate an HTML coverage report:

```
 $ docker-compose -f local.yml run django coverage run -m pytest
 $ docker-compose -f local.yml run django coverage html
 $ open htmlcov/index.html
 ```
