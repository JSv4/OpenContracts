# Quick Start (For use on your local machine)

This guide is for people who want to quickly get started using the application and aren't interested in hosting
it online for others to use. You'll get a default, local user with admin access. We recommend you change
the user password after completing this tutorial. We assume you're using Linux or Max OS, but you could
do this on Windows too, assuming you have docker compose and docker installed. The commands to create
directories will be different on Windows, but the git, docker and docker-compose commands should all be the
same. 

Read the [System Requirements](./requirements.md) for addtional information.  

## **Step 1**: Clone this Repo

Clone the repository into a local directory of your choice. Here, we assume you are using a folder
called source in your user's home directory:

```
    $ cd ~
    $ mkdir source
    $ cd source
    $ git clone https://github.com/JSv4/OpenContracts.git
```

## **Step 2**: Copy sample .env files to appropriate folders

Again, we're assuming a local deployment here with basic options. To just get up
and running, you'll want to copy our sample .env file from the `./docs/sample_env_files` directory to the
appropriate `.local` subfolder in the `.envs` directory in the repo root.

### Backend .Env File

For the most basic deployment, copy [./sample_env_files/backend/local/.django](https://github.com/JSv4/OpenContracts/blob/main/docs/sample_env_files/backend/local/.django)
to `./.envs/.local/.django` and copy [./sample_env_files/backend/local/.postgres](https://github.com/JSv4/OpenContracts/blob/main/docs/sample_env_files/backend/local/.postgres)
to `./.envs/.local/.postgres`. You can use the default configurations, but we recommend you set you own admin account
password in `.django` and your own postgres credentials in `.postgres`.

### Frontend .Env File

You also need to copy the appropriate .frontend env file as `./envs/.local/.frontend`. We're assuming you're
not using something like auth0 and are going to rely on Django auth to provision and authenticate users. Grab
[./sample_env_files/frontend/local/django.auth.env](./sample_env_files/frontend/local/django.auth.env) and copy it to
`./envs/.local/.frontend`.

## **Step 3**: Build the Stack

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

## **Step 4** Choose Frontend Deployment Method

__Option 1__ Use "Fullstack" Profile in Docker Compose

If you're **not** planning to do any frontend development, the easiest way to get started with OpenContracts is to
just type:

```commandline
    docker-compose -f local.yml --profile fullstack up
```

This will start docker compose and add a container for the frontend to the stack.

__Option 2__ Use Node to Deploy Frontend

If you plan to actively develop the frontend in the
[/frontend](https://github.com/JSv4/OpenContracts/tree/main/frontend) folder, you can just point your favorite
typescript ID to that directory and then run:

```commandline
yarn install
```

and

```commandline
yarn start
```

to bring up the frontend. Then you can edit the frontend code as desired and have it hot reload as you'd expect for a
React app.

Congrats! You have OpenContracts running.

## **Step 5**: Login and Start Annotating

If you go to `http://localhost:3000` in your browser, you'll see the login page. You can login with the default username
and password. These are set in the environment variable file you can find in the `./.envs/.local/` directory. In that
directory, you'll see a file called `.django`. Backend specific configuration variables go in there. See our
[guide](./configuration/add-users.md) for how to create new users.

**NOTE: The frontend is at port 3000, not 8000, so don't forget to use http://localhost:3000 for frontend access. We
have an open issue to add a redirect from the backend root page - http://localhost:8000/ - to http://localhost:3000**.

**Caveats**

The quick start local config is designed for use on a local machine, not for access over the Internet or a network.
It uses the local disk for storage (not AWS), and Django's built-i
