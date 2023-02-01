from django.contrib.auth import get_user_model

from opencontractserver.annotations.models import Annotation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.tasks import fork_corpus
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


def build_fork_corpus_task(corpus_pk_to_fork: str, user: User):

    annotation_ids = list(
        Annotation.objects.filter(corpus_id=corpus_pk_to_fork).values_list(
            "id", flat=True
        )
    )

    # Get corpus obj
    corpus_copy = Corpus.objects.get(pk=corpus_pk_to_fork)

    # Get ids to related objects that need copyin'
    doc_ids = list(corpus_copy.documents.all().values_list("id", flat=True))
    label_set_id = corpus_copy.label_set.pk if corpus_copy.label_set else None

    # Clone the corpus: https://docs.djangoproject.com/en/3.1/topics/db/queries/copying-model-instances
    corpus_copy.pk = None

    # Adjust the title to indicate it's a fork
    corpus_copy.title = f"{corpus_copy.title}"
    corpus_copy.backend_lock = True  # lock corpus to tell frontend to show this as loading and disable selection
    corpus_copy.creator = user  # switch the creator to the current user
    corpus_copy.parent_id = corpus_pk_to_fork
    corpus_copy.save()

    set_permissions_for_obj_to_user(user, corpus_copy, [PermissionTypes.ALL])

    # Now remove references to related objects on our new object, as these point to original docs and labels
    corpus_copy.documents.clear()
    corpus_copy.label_set = None

    # Copy docs and annotations using async task to avoid massive lag if we have large dataset or lots of
    # users requesting copies.
    return fork_corpus.si(
        corpus_copy.id, doc_ids, label_set_id, annotation_ids, user.id
    )
