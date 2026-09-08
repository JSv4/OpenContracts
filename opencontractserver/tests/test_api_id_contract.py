"""Pin opaque identifiers and pagination values already held by API clients."""

from base64 import b64encode

import pytest
from graphql import GraphQLError

from config.graphql.core.relay import resolve_connection_from_iterable
from opencontractserver.utils.ids import (
    cursor_to_offset,
    from_global_id,
    get_offset_with_default,
    offset_to_cursor,
    to_global_id,
)


@pytest.mark.parametrize(
    "type_name,pk,encoded",
    [
        ("DocumentType", 42, "RG9jdW1lbnRUeXBlOjQy"),
        ("CorpusType", "a:b", "Q29ycHVzVHlwZTphOmI="),
        ("UserType", "ü", "VXNlclR5cGU6w7w="),
        ("", "", "Og=="),
    ],
)
def test_global_ids_are_wire_compatible(type_name, pk, encoded):
    assert to_global_id(type_name, pk) == encoded
    decoded = from_global_id(encoded)
    assert (decoded.type, decoded.id) == decoded
    assert decoded == (type_name, str(pk))


@pytest.mark.parametrize("value", [True, None, 1.5, [], {}])
def test_id_encoder_retains_graphql_scalar_validation(value):
    with pytest.raises(GraphQLError):
        to_global_id("DocumentType", value)


@pytest.mark.parametrize("value", ["?", "not padded", "ü", "/w==", ""])
def test_invalid_ids_keep_empty_decode_contract(value):
    assert from_global_id(value) == ("", "")


def test_id_without_type_keeps_decoded_value():
    assert from_global_id("MTIz") == ("", "123")


def test_persisted_cursor_and_invalid_cursor_fallback():
    assert offset_to_cursor(2) == "YXJyYXljb25uZWN0aW9uOjI="
    assert cursor_to_offset("YXJyYXljb25uZWN0aW9uOjI=") == 2
    assert get_offset_with_default("invalid", -1) == -1
    assert get_offset_with_default(None, -1) == -1
    # Existing clients get permissive decoding even for a nonstandard prefix.
    assert cursor_to_offset(b64encode(b"otherconnection:2").decode()) == 2


@pytest.mark.parametrize(
    "args,expected,previous,following",
    [
        ({}, list(range(6)), False, False),
        ({"first": 2}, [0, 1], False, True),
        ({"last": 2}, [4, 5], True, False),
        ({"first": 0}, [], False, True),
        ({"last": 0}, [], True, False),
        ({"first": 4, "last": 2}, [2, 3], True, True),
        ({"after": offset_to_cursor(1), "first": 2}, [2, 3], False, True),
        ({"before": offset_to_cursor(4), "last": 2}, [2, 3], True, False),
        ({"after": offset_to_cursor(20)}, [], False, False),
        ({"before": offset_to_cursor(20)}, list(range(6)), False, True),
        ({"after": "bad", "first": 2}, [0, 1], False, True),
        ({"offset": 2, "first": 2}, [2, 3], False, True),
        ({"offset": 2, "after": offset_to_cursor(1)}, [4, 5], False, False),
    ],
)
def test_connection_windows_and_page_flags(args, expected, previous, following):
    connection = resolve_connection_from_iterable(list(range(6)), args)
    assert [edge.node for edge in connection.edges] == expected
    assert [edge.cursor for edge in connection.edges] == [
        offset_to_cursor(i) for i in expected
    ]
    assert connection.length == 6
    assert connection.page_info.has_previous_page is previous
    assert connection.page_info.has_next_page is following
    assert connection.page_info.start_cursor == (
        offset_to_cursor(expected[0]) if expected else None
    )
    assert connection.page_info.end_cursor == (
        offset_to_cursor(expected[-1]) if expected else None
    )


def test_default_limit_and_empty_connection():
    connection = resolve_connection_from_iterable(list(range(120)), {})
    assert len(connection.edges) == 100
    assert connection.page_info.has_next_page
    empty = resolve_connection_from_iterable([], {"first": 10})
    assert empty.edges == []
    assert empty.page_info.start_cursor is None
    assert empty.page_info.end_cursor is None
    assert not empty.page_info.has_next_page


@pytest.mark.parametrize("argument", ["first", "last"])
def test_negative_page_size_keeps_error(argument):
    with pytest.raises(
        ValueError, match=f"Argument '{argument}' must be a non-negative integer."
    ):
        resolve_connection_from_iterable([1, 2], {argument: -1})
