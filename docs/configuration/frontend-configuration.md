# Tutorial: Configuring Your Frontend Container

This tutorial will guide you through the different ways to provide configuration variables to your frontend container
using the environment configuration script we've developed. We'll use the following example `.env` file as our
reference:

```
REACT_APP_USE_AUTH0=false
REACT_APP_USE_ANALYZERS=true
REACT_APP_ALLOW_IMPORTS=true
REACT_APP_ROOT_URL=http://localhost:3000
```

## Understanding the Configuration Variables

Before we dive into the methods of providing these variables, let's briefly discuss variables and their purpose:

1. `REACT_APP_USE_AUTH0`: Use Auth0 for authentication if True (in which case you need Auth0 config vars)
2. `REACT_APP_USE_ANALYZERS`: Turn off frontend controls for analyzers.
3. `REACT_APP_ALLOW_IMPORTS`: Allow import of corpus exports.
4. `REACT_APP_ROOT_URL`: Specifies the base URL for the application, useful for API calls or routing.

## Methods of Providing Configuration Variables

### 1. Using a .env File

This is the most straightforward method and is great for local development.

**Steps:**

1. Create a `.env` file in the same directory as your Dockerfile.
2. Add your configuration variables to this file.
3. Make sure your Dockerfile copies this `.env` file into the container.
4. The script will read this file and generate the `env-config.js`.

**Pros:**

- Easy to manage and version control
- Great for development environments

**Cons:**

- Less secure for production (as sensitive data might be in version control)
- Requires rebuilding the container to change values

### 2. Using Environment Variables

This method is more flexible and secure, especially for production deployments.

**Steps:**

1. Remove or rename the `.env` file.
2. Set environment variables when running your container:

   ```bash
   docker run -e REACT_APP_USE_AUTH0=false -e REACT_APP_USE_ANALYZERS=true ...
   ```

3. The script will use these environment variables to generate `env-config.js`.

**Pros:**

- More secure for production
- Can change values without rebuilding the container
- Follows the "12-factor app" methodology

**Cons:**

- Can be cumbersome to set many variables on the command line

### 3. Using Docker Compose

This method combines the ease of a file-based approach with the flexibility of environment variables.

**Steps:**

1. Create a `docker-compose.yml` file.
2. Define your environment variables in the file:

   ```yaml
   version: '3'
   services:
     frontend:
       build: .
       environment:
         - REACT_APP_USE_AUTH0=false
         - REACT_APP_USE_ANALYZERS=true
         - REACT_APP_ALLOW_IMPORTS=true
         - REACT_APP_ROOT_URL=http://localhost:3000
   ```

3. Run your container using `docker-compose up`.

**Pros:**

- Easy to manage multiple environment variables
- Can have different configurations for different environments
- Variables not stored in the image

**Cons:**

- Requires Docker Compose

## Conclusion

Each method has its own advantages and use cases. For local development, a `.env` file is often the simplest. For
production deployments, using environment variables, or Docker Compose provides more flexibility and security.
