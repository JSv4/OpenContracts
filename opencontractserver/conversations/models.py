from typing import Literal

import django
from django.contrib.auth import get_user_model
from django.db import models
from django.forms import ValidationError
from guardian.models import GroupObjectPermissionBase, UserObjectPermissionBase

from opencontractserver.annotations.models import Annotation
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.shared.defaults import jsonfield_default_value
from opencontractserver.shared.fields import NullableJSONField
from opencontractserver.shared.Models import BaseOCModel

User = get_user_model()


MessageType = Literal["ASYNC_START", "ASYNC_CONTENT", "ASYNC_FINISH", "SYNC_CONTENT"]


class ConversationUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Conversation", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions.
class ConversationGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Conversation", on_delete=django.db.models.CASCADE
    )
    # enabled = False


class Conversation(BaseOCModel):
    """
    Stores high-level information about an agent-based conversation.
    Each conversation can have multiple messages associated with it.
    Only one of chat_with_corpus or chat_with_document can be set.
    """

    title = models.CharField(
        max_length=255,
        blank=True,
        help_text="Optional title for the conversation",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the conversation was created",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Timestamp when the conversation was last updated",
    )
    chat_with_corpus = models.ForeignKey(
        Corpus,
        on_delete=models.SET_NULL,
        related_name="conversations",
        help_text="The corpus to which this conversation belongs",
        blank=True,
        null=True,
    )
    chat_with_document = models.ForeignKey(
        Document,
        on_delete=models.SET_NULL,
        related_name="conversations",
        help_text="The document to which this conversation belongs",
        blank=True,
        null=True,
    )

    class Meta:
        constraints = [
            django.db.models.CheckConstraint(
                check=django.db.models.Q(chat_with_corpus__isnull=True)
                | django.db.models.Q(chat_with_document__isnull=True),
                name="one_chat_field_null_constraint",
            ),
        ]
        permissions = (
            ("permission_conversation", "permission conversation"),
            ("publish_conversation", "publish conversation"),
            ("create_conversation", "create conversation"),
            ("read_conversation", "read conversation"),
            ("update_conversation", "update conversation"),
            ("remove_conversation", "delete conversation"),
        )

    def clean(self):
        """
        Ensure that only one of chat_with_corpus or chat_with_document is set.
        """
        if self.chat_with_corpus and self.chat_with_document:
            raise ValidationError(
                "Only one of chat_with_corpus or chat_with_document can be set."
            )

    def __str__(self) -> str:
        return f"Conversation {self.pk} - {self.title if self.title else 'Untitled'}"


class Message(BaseOCModel):
    """
    Represents a single message within an agent conversation.
    Messages follow a standardized format to indicate their type,
    content, and any additional data.
    """

    class Meta:
        permissions = (
            ("permission_message", "permission message"),
            ("publish_message", "publish message"),
            ("create_message", "create message"),
            ("read_message", "read message"),
            ("update_message", "update message"),
            ("remove_message", "delete message"),
        )

    TYPE_CHOICES = (
        ("SYSTEM", "SYSTEM"),
        ("HUMAN", "HUMAN"),
        ("LLM", "LLM"),
    )

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
        help_text="The conversation to which this message belongs",
    )
    msg_type = models.CharField(
        max_length=32,
        choices=TYPE_CHOICES,
        help_text="The type of message (SYSTEM, HUMAN, or LLM)",
    )
    content = models.TextField(
        help_text="The textual content of the message",
    )
    data = NullableJSONField(
        default=jsonfield_default_value,
        null=True,
        blank=True,
        help_text="Additional data associated with the message (stored as JSON)",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Timestamp when the message was created",
    )

    source_document = models.ForeignKey(
        Document,
        on_delete=models.SET_NULL,
        related_name="messages",
        help_text="The document that this message is based on",
        blank=True,
        null=True,
    )
    source_annotations = models.ManyToManyField(
        Annotation,
        related_name="messages",
        help_text="The annotations that this message is based on",
        blank=True,
    )
    created_annotations = models.ManyToManyField(
        Annotation,
        related_name="created_by_message",
        help_text="The annotations that this message created",
        blank=True,
    )

    def __str__(self) -> str:
        return (
            f"Message {self.pk} - {self.msg_type} "
            f"in conversation {self.conversation.pk}"
        )


class MessageUserObjectPermission(UserObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Message", on_delete=django.db.models.CASCADE
    )
    # enabled = False


# Model for Django Guardian permissions.
class MessageGroupObjectPermission(GroupObjectPermissionBase):
    content_object = django.db.models.ForeignKey(
        "Message", on_delete=django.db.models.CASCADE
    )
