"""
    Gremlin - The open source legal engineering platform
    Copyright (C) 2020-2021 John Scrudato IV ("JSIV")

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/
 """
import django_filters
from django.contrib.auth import get_user_model
from django.db.models import Q
from django_filters import rest_framework as filters
from graphql_relay import from_global_id

from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.users.models import Assignment, UserExport

User = get_user_model()


class CorpusFilter(django_filters.FilterSet):

    text_search = filters.CharFilter(method="text_search_method")

    def text_search_method(self, queryset, name, value):
        return queryset.filter(
            Q(description__contains=value) | Q(title__contains=value)
        )

    uses_labelset_id = filters.CharFilter(method="uses_labelset_id_method")

    def uses_labelset_id_method(self, queryset, name, value):
        django_pk = from_global_id(value)[1]
        return queryset.filter(label_set_id=django_pk)

    class Meta:
        model = Corpus
        fields = {
            "description": ["exact", "contains"],
            "id": ["exact"],
            "title": ["contains"],
        }


class AnnotationFilter(django_filters.FilterSet):

    uses_label_from_labelset_id = django_filters.CharFilter(
        method="filter_by_label_from_labelset_id"
    )

    def filter_by_label_from_labelset_id(self, queryset, name, value):
        django_pk = from_global_id(value)[1]
        return queryset.filter(annotation_label__included_in_labelset=django_pk)

    class Meta:
        model = Annotation
        fields = {
            "raw_text": ["contains"],
            "annotation_label_id": ["exact"],
            "annotation_label__text": ["exact", "contains"],
            "annotation_label__description": ["contains"],
            "annotation_label__label_type": ["exact"],
            "document_id": ["exact"],
            "corpus_id": ["exact"],
        }


class LabelFilter(django_filters.FilterSet):

    used_in_labelset_id = django_filters.CharFilter(method="filter_by_labelset_id")
    used_in_labelset_for_corpus_id = django_filters.CharFilter(
        method="filter_by_used_in_labelset_for_corpus_id"
    )

    def filter_by_labelset_id(self, queryset, name, value):
        django_pk = from_global_id(value)[1]
        return queryset.filter(included_in_labelset__pk=django_pk)

    def filter_by_used_in_labelset_for_corpus_id(self, queryset, name, value):
        django_pk = from_global_id(value)[1]
        print("Lookup labels for pk", django_pk)
        print(
            "Filtered to values",
            queryset.filter(included_in_labelset__used_by_corpus_id=django_pk),
        )
        return queryset.filter(included_in_labelset__used_by_corpus_id=django_pk)

    class Meta:
        model = AnnotationLabel
        fields = {
            "description": ["contains"],
            "text": ["exact", "contains"],
            "label_type": ["exact"],
        }


class LabelsetFilter(django_filters.FilterSet):

    text_search = filters.CharFilter(method="text_search_method")

    def text_search_method(self, queryset, name, value):
        return queryset.filter(
            Q(description__contains=value) | Q(title__contains=value)
        )

    labelset_id = filters.CharFilter(method="labelset_id_method")

    def labelset_id_method(self, queryset, name, value):
        django_pk = from_global_id(value)[1]
        return queryset.filter(id=django_pk)

    class Meta:
        model = LabelSet
        fields = {
            "id": ["exact"],
            "description": ["contains"],
            "title": ["exact", "contains"],
        }


class RelationshipFilter(django_filters.FilterSet):

    # Old-style filter when relationships let you cross documents. Think this creates too taxing a query on the
    # Database. If we need document-level relationships, we can create a new model for that.
    # document_id = django_filters.CharFilter(method='filter_document_id')
    # def filter_document_id(self, queryset, name, value):
    #     document_pk = from_global_id(value)[1]
    #     return queryset.filter((Q(creator=self.request.user) | Q(is_public=True)) &
    #                            (Q(source_annotations__source_node_in_relationship__document_id=document_pk) |
    #                             Q(target_annotations__source_node_in_relationship__document_id=document_pk)))

    class Meta:
        model = Relationship
        fields = {
            "relationship_label": ["exact"],
            "corpus_id": ["exact"],
            "document_id": ["exact"],
        }


class AssignmentFilter(django_filters.FilterSet):

    document_id = django_filters.CharFilter(method="filter_document_id")

    def filter_document_id(self, queryset, name, value):
        django_pk = from_global_id(value)[1]
        return queryset.filter(document_id=django_pk)

    class Meta:
        model = Assignment
        fields = {"assignor__email": ["exact"], "assignee__email": ["exact"]}


class ExportFilter(django_filters.FilterSet):

    # This uses the django-filters ordering capabilities. Following filters available:
    #   1) created (earliest to latest)
    #   2) -created (latest to earliest)
    #   3) started (earliest to latest)
    #   4) -started (latest to earliest)
    #   5) finished (earliest to latest)
    #   6) -finished (latest to earliest)

    order_by_created = django_filters.OrderingFilter(
        # tuple-mapping retains order
        fields=(("created", "created"),)
    )

    order_by_started = django_filters.OrderingFilter(
        # tuple-mapping retains order
        fields=(("started", "started"),)
    )

    order_by_finished = django_filters.OrderingFilter(
        # tuple-mapping retains order
        fields=(("finished", "finished"),)
    )

    class Meta:
        model = UserExport
        fields = {
            "name": ["contains"],
            "id": ["exact"],
            "created": ["lte"],
            "started": ["lte"],
            "finished": ["lte"],
        }


class DocumentFilter(django_filters.FilterSet):

    company_search = filters.CharFilter(method="company_name_search")
    has_pdf = filters.BooleanFilter(method="has_pdf_search")
    in_corpus_with_id = filters.CharFilter(method="in_corpus")
    has_label_with_title = filters.CharFilter(method="has_label_title")
    has_label_with_id = filters.CharFilter(method="has_label_id")
    text_search = filters.CharFilter(method="naive_text_search")

    def filter_queryset(self, queryset):
        return super().filter_queryset(queryset).distinct()

    def naive_text_search(self, queryset, name, value):
        return queryset.filter(Q(description__contains=value)).distinct()

    def has_pdf_search(self, queryset, name, value):
        # Filter to analyzed docs only (has meta_data value)
        if value:
            return queryset.exclude(Q(pdf_file="") | Q(pdf_file__exact=None))
        # Filter to un-analyzed docs only (has no meta_data value)
        else:
            return queryset.filter(Q(pdf_file="") | Q(pdf_file__exact=None))

    def in_corpus(self, queryset, name, value):
        return queryset.filter(corpus=from_global_id(value)[1]).distinct()

    def has_label_title(self, queryset, name, value):
        return queryset.filter(annotation__annotation_label__title__contains=value)

    def has_label_id(self, queryset, name, value):
        return queryset.filter(
            doc_annotation__annotation_label_id=from_global_id(value)[1]
        )

    class Meta:
        model = Document
        fields = {
            "description": ["exact", "contains"],
            "id": ["exact"],
        }
