# Generate Schema File

To generate a fresh GraphQL schema file, try this command (assumes docker is up and you've built the stack):

```
docker compose -f local.yml run django python manage.py graphql_schema --schema config.graphql.schema.schema --out schema.graphql 
```
