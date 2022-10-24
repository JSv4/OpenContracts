## Generating GraphQL Schema Files

Open Contracts uses Graphene to provide a rich GraphQL endpoint, complete with the GraphiQL query application. For some
applications, you may want to generate a GraphQL schema file in SDL or json. On example use case is if you're developing
a frontend you want to connect to OpenContracts, and you'd like to autogenerate Typescript types from a GraphQL Schena.

To generate a GraphQL schema file, run your choice of the following commands.

For an SDL file:

```
$ docker-compose -f local.yml run django python manage.py graphql_schema --schema config.graphql.schema.schema --out schema.graphql
```

For a JSON file:

```
$ docker-compose -f local.yml run django python manage.py graphql_schema --schema config.graphql.schema.schema --out schema.json
```

You can convert these to TypeScript for use in a frontend (though you'll find this has already been done for the React-
based OpenContracts frontend) using a tool like [this](https://www.graphql-code-generator.com/).
