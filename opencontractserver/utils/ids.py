"""Opaque API IDs and pagination cursors, independent of the schema framework.

Keep the existing Relay wire format: UTF-8 ``TypeName:id`` and
``arrayconnection:offset`` encoded as base64. Decoding intentionally retains
the permissive behavior used by existing filters and mutation error paths.
"""

from base64 import b64decode, b64encode
from binascii import Error as Base64Error
from typing import NamedTuple

from graphql import GraphQLID

CURSOR_PREFIX = "arrayconnection:"


class ResolvedGlobalId(NamedTuple):
    type: str
    id: str


def _decode(value: str) -> str:
    try:
        return b64decode(value).decode("utf-8")
    except (Base64Error, UnicodeError, ValueError):
        return ""


def to_global_id(type_: str, id_: str | int) -> str:
    """Encode an ID using GraphQL's ID scalar coercion rules."""
    value = f"{type_}:{GraphQLID.serialize(id_)}"
    return b64encode(value.encode("utf-8")).decode("ascii")


def from_global_id(global_id: str) -> ResolvedGlobalId:
    value = _decode(global_id)
    if ":" not in value:
        return ResolvedGlobalId("", value)
    type_name, identifier = value.split(":", 1)
    return ResolvedGlobalId(type_name, identifier)


def offset_to_cursor(offset: int) -> str:
    return b64encode(f"{CURSOR_PREFIX}{offset}".encode()).decode("ascii")


def cursor_to_offset(cursor: str) -> int | None:
    try:
        return int(_decode(cursor)[len(CURSOR_PREFIX) :])
    except ValueError:
        return None


def get_offset_with_default(cursor: str | None = None, default_offset: int = 0) -> int:
    if not isinstance(cursor, str):
        return default_offset
    offset = cursor_to_offset(cursor)
    return default_offset if offset is None else offset
