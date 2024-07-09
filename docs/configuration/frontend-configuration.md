# Frontend Configuration

## Why?

The frontend configuration variables should not be secrets as there is no way to keep them secure on the frontend. That
said, being able to specify certain configurations via environment variables makes configuration and deployment much
easier.

## What Can be Configured?

Our frontend config file should look like this (The `OPEN_CONTRACTS_` prefixes are necessary to get the env variables
injected into the frontend container. The env variable that shows up on `window._env_` in the React frontend will omit
the prefix, however - e.g. `OPEN_CONTRACTS_REACT_APP_APPLICATION_DOMAIN` will show up as `REACT_APP_APPLICATION_DOMAIN`):

```
OPEN_CONTRACTS_REACT_APP_APPLICATION_DOMAIN=
OPEN_CONTRACTS_REACT_APP_APPLICATION_CLIENT_ID=
OPEN_CONTRACTS_REACT_APP_AUDIENCE=http://localhost:3000
OPEN_CONTRACTS_REACT_APP_API_ROOT_URL=https://opencontracts.opensource.legal

# Uncomment to use Auth0 (you must then set the DOMAIN and CLIENT_ID envs above
# OPEN_CONTRACTS_REACT_APP_USE_AUTH0=true

# Uncomment to enable access to analyzers via the frontend
# OPEN_CONTRACTS_REACT_APP_USE_ANALYZERS=true

# Uncomment to enable access to import functionality via the frontend
# OPEN_CONTRACTS_REACT_APP_ALLOW_IMPORTS=true
```

ATM, there are three key configurations:
1. **OPEN_CONTRACTS_REACT_APP_USE_AUTH0** - uncomment this / set it to true to switch the frontend login components and
   auth flow from django password auth to Auth0 oauth2. IF this is true, you also need to provide valid configurations
   for `OPEN_CONTRACTS_REACT_APP_APPLICATION_DOMAIN`, `OPEN_CONTRACTS_REACT_APP_APPLICATION_CLIENT_ID`, and
   `OPEN_CONTRACTS_REACT_APP_AUDIENCE`. These are configured
   on the Auth0 platform. We don't have a walkthrough for that ATM.
2. **OPEN_CONTRACTS_REACT_APP_USE_ANALYZERS** - allow users to see and use analyzers. False on the demo deployment.
3. **OPEN_CONTRACTS_REACT_APP_ALLOW_IMPORTS** - do not let people upload zip files and attempt to import them. Not
   recommended on truly public installations as security will be challenging. Internal to an org should be OK, but
   still use caution.

## How to Configure

### Method 1: Using an `.env` File

This method involves using a `.env` file that Docker Compose automatically picks up.

#### Steps:
1. Create a file named `.env` in the same directory as your `docker-compose.yml` file.
2. Copy the contents of your environment variable file into this `.env` file.
3. In your `docker-compose.yml`, you don't need to explicitly specify the env file.

#### Example `docker-compose.yml`:
```yaml
version: '3'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    # No need to specify env_file here
```

#### Pros:
- Simple setup
- Docker Compose automatically uses the `.env` file
- Easy to version control (if desired)

#### Cons:
- All services defined in the Docker Compose file will have access to these variables
- May not be suitable if you need different env files for different services

### Method 2: Using `env_file` in Docker Compose

This method allows you to specify a custom named env file for each service.

#### Steps:
1. Keep your existing `.env` file (or rename it if desired).
2. In your `docker-compose.yml`, specify the env file using the `env_file` key.

#### Example `docker-compose.yml`:
```yaml
version: '3'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    env_file:
      - ./.env  # or your custom named file
```

#### Pros:
- Allows using different env files for different services
- More explicit than relying on the default `.env` file

#### Cons:
- Requires specifying the env file in the Docker Compose file

### Method 3: Defining Environment Variables Directly in Docker Compose

This method involves defining the environment variables directly in the `docker-compose.yml` file.

#### Steps:
1. In your `docker-compose.yml`, use the `environment` key to define variables.

#### Example `docker-compose.yml`:
```yaml
version: '3'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - OPEN_CONTRACTS_REACT_APP_APPLICATION_DOMAIN=yourdomain.com
      - OPEN_CONTRACTS_REACT_APP_APPLICATION_CLIENT_ID=your_client_id
      - OPEN_CONTRACTS_REACT_APP_AUDIENCE=http://localhost:3000
      - OPEN_CONTRACTS_REACT_APP_API_ROOT_URL=https://opencontracts.opensource.legal
      - OPEN_CONTRACTS_REACT_APP_USE_AUTH0=true
      - OPEN_CONTRACTS_REACT_APP_USE_ANALYZERS=true
      - OPEN_CONTRACTS_REACT_APP_ALLOW_IMPORTS=true
```

#### Pros:
- All configuration is in one file
- Easy to see all environment variables at a glance

#### Cons:
- Can make the `docker-compose.yml` file long and harder to manage
- Sensitive information in the Docker Compose file may be a security risk

### Method 4: Combining `env_file` and `environment`

This method allows you to use an env file for most variables and override or add specific ones in the Docker Compose file.

#### Steps:
1. Keep your `.env` file with most variables.
2. In `docker-compose.yml`, use both `env_file` and `environment`.

#### Example `docker-compose.yml`:
```yaml
version: '3'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    env_file:
      - ./.env
    environment:
      - REACT_APP_USE_AUTH0=true
      - REACT_APP_USE_ANALYZERS=true
      - REACT_APP_ALLOW_IMPORTS=true
```

#### Pros:
- Flexibility to use env files and override when needed
- Can keep sensitive info in env file and non-sensitive in Docker Compose

#### Cons:
- Need to be careful about precedence (Docker Compose values override env file)
