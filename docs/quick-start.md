# Quick Start (For use on your local machine)

This guide is for people who want to quickly get started using the application and aren't interested in hosting
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

**Caveats**

The quick start local config is designed for use on a local machine, not for access over the Internet or a network.
It uses the local disk for storage (not AWS), and Django's built-i
