"""Tests for the _get_type_description function in pydantic_ai_agents module."""

import json
from typing import Any, Optional, Union

from django.test import TestCase
from pydantic import BaseModel, Field

from opencontractserver.llms.agents.pydantic_ai_agents import _get_type_description


class SimpleModel(BaseModel):
    """A simple Pydantic model for testing."""

    name: str = Field(..., description="The name field")
    age: int = Field(..., description="The age field")
    active: bool = Field(default=True, description="Whether active")


class NestedModel(BaseModel):
    """A nested Pydantic model for testing."""

    user: SimpleModel
    tags: list[str]
    metadata: dict[str, Any]


class TestGetTypeDescription(TestCase):
    """Test suite for the _get_type_description function."""

    def test_primitive_types(self):
        """Test descriptions for primitive types."""
        # Test string
        result = _get_type_description(str)
        self.assertEqual(result, "a plain string value")

        # Test int
        result = _get_type_description(int)
        self.assertEqual(result, "an integer value")

        # Test float
        result = _get_type_description(float)
        self.assertEqual(result, "a numeric value")

        # Test bool
        result = _get_type_description(bool)
        self.assertEqual(result, "a boolean value (true or false)")

        # Test None type
        result = _get_type_description(type(None))
        self.assertEqual(result, "null")

    def test_list_types(self):
        """Test descriptions for List types with various inner types."""
        # List of strings
        result = _get_type_description(list[str])
        self.assertEqual(
            result, "a JSON array where each element is a plain string value"
        )

        # List of integers
        result = _get_type_description(list[int])
        self.assertEqual(result, "a JSON array where each element is an integer value")

        # List of lists (nested)
        result = _get_type_description(list[list[str]])
        self.assertEqual(
            result,
            "a JSON array where each element is a JSON array where each element is a plain string value",
        )

        # List without type parameter
        result = _get_type_description(list)
        self.assertEqual(result, "a JSON array")

        # List of Pydantic models
        result = _get_type_description(list[SimpleModel])
        self.assertIn(
            "a JSON array where each element is a JSON object matching the 'SimpleModel' model with this schema:",
            result,
        )
        self.assertIn('"properties"', result)
        self.assertIn('"name"', result)
        self.assertIn('"age"', result)

    def test_tuple_types(self):
        """Test descriptions for Tuple types."""
        # Fixed size tuple
        result = _get_type_description(tuple[str, int, bool])
        self.assertEqual(
            result,
            "a JSON array with exactly 3 elements: [a plain string value, an integer value, a boolean value (true or false)]",  # noqa: E501
        )

        # Variable length tuple (with ellipsis)
        result = _get_type_description(tuple[str, ...])
        self.assertEqual(
            result,
            "a JSON array of variable length where each element is a plain string value",
        )

        # Empty tuple annotation
        result = _get_type_description(tuple)
        self.assertEqual(result, "a JSON array (tuple)")

        # Single element tuple
        result = _get_type_description(tuple[int])
        self.assertEqual(
            result, "a JSON array with exactly 1 elements: [an integer value]"
        )

    def test_set_types(self):
        """Test descriptions for Set types."""
        # Set of strings
        result = _get_type_description(set[str])
        self.assertEqual(
            result,
            "a JSON array of unique values where each element is a plain string value",
        )

        # Set of integers
        result = _get_type_description(set[int])
        self.assertEqual(
            result,
            "a JSON array of unique values where each element is an integer value",
        )

        # Set without type parameter
        result = _get_type_description(set)
        self.assertEqual(result, "a JSON array of unique values")

    def test_dict_types(self):
        """Test descriptions for Dict types."""
        # Dict with type parameters
        result = _get_type_description(dict[str, int])
        self.assertIn("a JSON object matching this schema:", result)

        # Parse the JSON schema to verify it's valid
        schema_start = result.find(":\n") + 2
        schema_json = result[schema_start:]
        parsed_schema = json.loads(schema_json)

        # Verify it's a proper JSON schema for a dict
        self.assertIn("type", parsed_schema)
        self.assertEqual(parsed_schema["type"], "object")

        # Plain dict without type parameters
        result = _get_type_description(dict)
        self.assertIn("a JSON object matching this schema:", result)

        # Complex nested dict
        result = _get_type_description(dict[str, list[SimpleModel]])
        self.assertIn("a JSON object matching this schema:", result)
        self.assertIn("properties", result)

    def test_pydantic_models(self):
        """Test descriptions for Pydantic BaseModel types."""
        # Simple model
        result = _get_type_description(SimpleModel)
        self.assertIn(
            "a JSON object matching the 'SimpleModel' model with this schema:", result
        )

        # Verify the schema contains expected fields
        self.assertIn('"name"', result)
        self.assertIn('"age"', result)
        self.assertIn('"active"', result)
        self.assertIn('"properties"', result)

        # Parse and validate the JSON schema
        schema_start = result.find(":\n") + 2
        schema_json = result[schema_start:]
        parsed_schema = json.loads(schema_json)

        self.assertEqual(parsed_schema["type"], "object")
        self.assertIn("properties", parsed_schema)
        self.assertIn("name", parsed_schema["properties"])
        self.assertIn("age", parsed_schema["properties"])

        # Nested model
        result = _get_type_description(NestedModel)
        self.assertIn(
            "a JSON object matching the 'NestedModel' model with this schema:", result
        )
        self.assertIn('"user"', result)
        self.assertIn('"tags"', result)
        self.assertIn('"metadata"', result)

    def test_complex_nested_types(self):
        """Test descriptions for complex nested type combinations."""
        # List of tuples
        result = _get_type_description(list[tuple[str, int]])
        expected = "a JSON array where each element is a JSON array with exactly 2 elements: [a plain string value, an integer value]"  # noqa: E501
        self.assertEqual(result, expected)

        # Dict of lists of models
        result = _get_type_description(dict[str, list[SimpleModel]])
        self.assertIn("a JSON object matching this schema:", result)

        # Set of tuples
        result = _get_type_description(set[tuple[int, str]])
        expected = "a JSON array of unique values where each element is a JSON array with exactly 2 elements: [an integer value, a plain string value]"  # noqa: E501
        self.assertEqual(result, expected)

    def test_optional_and_union_types(self):
        """Test descriptions for Optional and Union types."""
        # Optional string (Union[str, None])
        result = _get_type_description(Optional[str])
        self.assertIn("a value matching this JSON schema:", result)
        # Should handle as a union type and use JSON schema

        # Union of primitives
        result = _get_type_description(Union[str, int])
        self.assertIn("a value matching this JSON schema:", result)

        # Union with models
        result = _get_type_description(Union[SimpleModel, str])
        self.assertIn("a value matching this JSON schema:", result)

    def test_any_type(self):
        """Test description for Any type."""
        result = _get_type_description(Any)
        # Should fall back to generic description or schema
        self.assertIn("JSON", result)

    def test_custom_types(self):
        """Test descriptions for custom/unknown types."""

        class CustomType:
            """A custom type that's not a BaseModel."""

            pass

        result = _get_type_description(CustomType)
        # Should either use JSON schema or fall back to type name
        self.assertIn("CustomType", result)

    def test_recursive_descriptions(self):
        """Test that descriptions are properly recursive for nested structures."""
        # Deeply nested structure
        complex_type = list[dict[str, list[tuple[int, str]]]]
        result = _get_type_description(complex_type)

        # Should contain recursive descriptions
        self.assertIn("a JSON array where each element is", result)
        self.assertIn("JSON object matching this schema", result)

        # The schema should be parseable
        schema_start = result.find(":\n") + 2
        if schema_start > 1:  # If there's a schema
            schema_json = result[schema_start:]
            # Should not raise an exception
            json.loads(schema_json)

    def test_edge_cases(self):
        """Test edge cases and potential error conditions."""
        # Empty type annotations
        result = _get_type_description(list)
        self.assertEqual(result, "a JSON array")

        result = _get_type_description(dict)
        self.assertIn("a JSON object matching this schema:", result)

        result = _get_type_description(tuple)
        self.assertEqual(result, "a JSON array (tuple)")

        result = _get_type_description(set)
        self.assertEqual(result, "a JSON array of unique values")

    def test_schema_validity(self):
        """Test that generated schemas are valid JSON."""
        # Types that should generate JSON schemas
        schema_types = [
            dict[str, int],
            dict[str, Any],
            SimpleModel,
            NestedModel,
            Union[str, int],
            Optional[SimpleModel],
        ]

        for type_to_test in schema_types:
            with self.subTest(type=type_to_test):
                result = _get_type_description(type_to_test)

                # If it contains a schema, it should be valid JSON
                if "schema:" in result:
                    schema_start = result.find(":\n") + 2
                    schema_json = result[schema_start:]

                    # This should not raise an exception
                    parsed = json.loads(schema_json)

                    # Basic schema validation
                    self.assertIsInstance(parsed, dict)
                    if "type" in parsed:
                        self.assertIn(
                            parsed["type"],
                            [
                                "object",
                                "array",
                                "string",
                                "number",
                                "integer",
                                "boolean",
                                "null",
                            ],
                        )
