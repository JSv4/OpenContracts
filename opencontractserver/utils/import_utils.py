import logging

from django.contrib.auth import get_user_model

from config.graphql.permission_annotator.utils import (
    grant_all_permissions_for_obj_to_user,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.tasks import import_corpus

logger = logging.getLogger(__name__)

User = get_user_model()


def build_import_corpus_task(seed_corpus_id: str, base_64_file_string: str, user: User):

    corpus = Corpus.objects.get(id=seed_corpus_id)

    grant_all_permissions_for_obj_to_user(user_val=user, instance=corpus)
    logger.info("UploadCorpusImportZip.mutate() - permissions assigned...")

    return import_corpus.s(base_64_file_string, user.id, seed_corpus_id)
