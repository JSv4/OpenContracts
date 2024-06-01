from django.contrib.auth import get_user_model
from drf_extra_fields.fields import Base64ImageField
from rest_framework import serializers

from opencontractserver.annotations.models import Annotation, AnnotationLabel, LabelSet
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import Column, Extract
from opencontractserver.shared.fields import PDFBase64File

User = get_user_model()


class DocumentSerializer(serializers.ModelSerializer):
    pdf_file = PDFBase64File(required=False)

    class Meta:
        model = Document
        fields = ["id", "title", "description", "custom_meta", "pdf_file"]
        read_only_fields = ["id"]


class CorpusSerializer(serializers.ModelSerializer):
    icon = Base64ImageField(required=False)

    class Meta:
        model = Corpus
        fields = [
            "id",
            "title",
            "description",
            "icon",
            "label_set",
            "creator",
            "creator_id",
        ]
        read_only_fields = ["id"]


class ExtractSerializer(serializers.ModelSerializer):
    class Meta:
        model = Extract
        fields = [
            "id",
            "corpus",
            "name",
            "fieldset",
            "owner",
            "owner_id",
            "creator",
            "creator_id",
            "created",
            "started",
            "finished",
        ]
        read_only_fields = ["id", "created"]


class ColumnSerializer(serializers.ModelSerializer):
    class Meta:
        model = Column
        fields = [
            "id",
            "fieldset",
            "fieldset_id",
            "language_model",
            "language_model_id",
            "query",
            "match_text",
            "output_type",
            "limit_to_label",
            "instructions",
            "language_model_id",
            "agentic",
        ]
        read_only_fields = ["id", "created"]


class LabelsetSerializer(serializers.ModelSerializer):
    icon = Base64ImageField(required=False)

    class Meta:
        model = LabelSet
        fields = ["id", "title", "description", "icon", "creator", "creator_id"]
        read_only_fields = ["id"]


class AnnotationLabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnnotationLabel
        fields = [
            "id",
            "creator",
            "label_type",
            "color",
            "description",
            "icon",
            "text",
            "creator_id",
        ]
        read_only_fields = ["id"]


class AnnotationSerializer(serializers.ModelSerializer):
    """
    Due to pydantic being a pain about having a 'json' field, this should ONLY
    be used to deserialize data into a django obj (where we can have a json field).
    The various export formats rename json to "annotation_json"
    """

    annotation_label = serializers.PrimaryKeyRelatedField(
        many=False, queryset=AnnotationLabel.objects.all()
    )

    class Meta:
        model = Annotation
        fields = [
            "id",
            "page",
            "raw_text",
            "tokens_json",
            "bounding_box",
            "json",
            "annotation_label",
            "is_public",
            "creator",
            "creator_id",
        ]
        read_only_fields = ["id"]
