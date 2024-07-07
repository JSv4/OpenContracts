# => Build Container
FROM node:16-alpine as builder

WORKDIR /app
COPY package.json .
COPY yarn.lock .
RUN yarn install
COPY . .
RUN yarn build

# => Run container
FROM nginx:1.21.4-alpine

LABEL version="1.0"
LABEL description="Base docker image for Open Contracts GUI"
LABEL maintainer = ["JSIV"]

# Nginx config
RUN rm -rf /etc/nginx/conf.d
COPY conf /etc/nginx

# Static build
COPY --from=builder /app/build /usr/share/nginx/html/

# Default Port for HTTP
EXPOSE 3000

# COPY .env file and shell script to container
WORKDIR /usr/share/nginx/html
COPY ./env.sh env.sh

# Make shell script executable
RUN chmod +x env.sh

# Start Nginx server
CMD ["/bin/sh", "-c", "nginx -g \"daemon off;\""]
