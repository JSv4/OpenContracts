import graphene

from config.graphql.mutations import Mutation
from config.graphql.queries import Query

schema = graphene.Schema(
    mutation=Mutation,
    query=Query,
)
