# Quick Start (For use on your local machine)

This guide is for people who want to quickly get started using the application and aren't interested in hosting
it online for others to use. You'll get a default, local user with admin access. We recommend you change
the user password after completing this tutorial. We assume you're using Linux or Max OS, but you could
do this on Windows too, assuming you have docker compose and docker installed. The commands to create
directories will be different on Windows, but the git, docker and docker-compose commands should all be the
same.

## **Step 1**: Clone this Repo

Clone the repository into a local directory of your choice. Here, we assume you are using a folder
called source in your user's home directory:

```
    $ cd ~
    $ mkdir source
    $ cd source
    $ git clone https://github.com/JSv4/OpenContracts.git
```

## **Step 2**: Build the Stack

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

## **Step 3** Choose Frontend Deployment Method

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

## **Step 4**: Login and Start Annotating

If you go to `http://localhost:3000` in your browser, you'll see the login page. You can login with the default username
and password. These are set in the environment variable file you can find in the `./.envs/.local/' directory. In that
directory, you'll see a file called `.django`. Backend specific configuration variables go in there.

**NOTE: The frontend is at port 3000, not 8000, so don't forget to use http://localhost:3000 for frontend access. We
have an open issue to add a redirect from the backend root page - http://localhost:8000/ - to http://localhost:3000**.

**Caveats**

The quick start local config is designed for use on a local machine, not for access over the Internet or a network.
It uses the local disk for storage (not AWS), and Django's built-i
