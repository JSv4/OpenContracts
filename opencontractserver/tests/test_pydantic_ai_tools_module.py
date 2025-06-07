import inspect
from typing import Optional
from unittest.mock import MagicMock

import pytest
from django.test import TestCase

from opencontractserver.llms.tools.pydantic_ai_tools import (
    PydanticAIToolFactory,
    PydanticAIToolWrapper,
    create_pydantic_ai_tool_from_func,
    create_typed_pydantic_ai_tool,
    pydantic_ai_tool,
)
from opencontractserver.llms.tools.tool_factory import CoreTool

# ---------------------------------------------------------------------------
# Helper functions for the tests
# ---------------------------------------------------------------------------


def sync_multiply(a: int, b: int) -> int:
    """Multiply two integers and return the product (sync)."""
    return a * b


async def async_add(a: int, b: int) -> int:
    """Add two integers and return the sum (async)."""
    return a + b


def subtract(x: int, y: int) -> int:
    """Subtract y from x."""
    return x - y


# ---------------------------------------------------------------------------
# Test suite
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPydanticAITools(TestCase):
    """Test suite for PydanticAI tool wrappers and factories."""

    def test_pydantic_ai_tool_wrapper_basic_properties(self):
        """Test basic wrapper properties and metadata."""
        core_tool = CoreTool.from_function(sync_multiply)
        wrapper = PydanticAIToolWrapper(core_tool)

        # Basic metadata checks
        self.assertEqual(wrapper.name, "sync_multiply")
        self.assertIn("multiply", wrapper.description.lower())

        # The callable_function should accept `ctx` as first parameter
        callable_tool = wrapper.callable_function
        sig = inspect.signature(callable_tool)
        first_param = next(iter(sig.parameters.keys()))
        self.assertEqual(first_param, "ctx")

        # to_dict should expose minimal metadata
        tool_dict = wrapper.to_dict()
        expected_keys = {"function", "name", "description"}
        self.assertEqual(set(tool_dict.keys()), expected_keys)

    def test_pydantic_ai_tool_factory_collections(self):
        """Test factory helpers for building tool collections."""
        tools = [
            CoreTool.from_function(sync_multiply),
            CoreTool.from_function(async_add),
        ]

        # create_tools returns list[Callable]
        callable_tools = PydanticAIToolFactory.create_tools(tools)
        self.assertEqual(len(callable_tools), 2)
        for tool in callable_tools:
            self.assertTrue(callable(tool))

        # create_tool_registry maps names → callable
        registry = PydanticAIToolFactory.create_tool_registry(tools)
        expected_names = {"sync_multiply", "async_add"}
        self.assertEqual(set(registry.keys()), expected_names)
        for name, fn in registry.items():
            self.assertTrue(callable(fn))

    def test_decorator_function_properties(self):
        """Test decorator creates proper function signatures."""

        @pydantic_ai_tool(description="Square a number")
        def square(x: int) -> int:  # type: ignore[valid-type]
            """Return x squared."""
            return x * x

        # Check that decorator preserves callable nature
        self.assertTrue(callable(square))

        # Check signature includes ctx parameter
        sig = inspect.signature(square)
        first_param = next(iter(sig.parameters.keys()))
        self.assertEqual(first_param, "ctx")

    def test_typed_tool_creation(self):
        """Test creation of typed tools from annotated functions."""
        typed_tool = create_typed_pydantic_ai_tool(subtract)

        # Should be callable
        self.assertTrue(callable(typed_tool))

        # Should have ctx as first parameter
        sig = inspect.signature(typed_tool)
        first_param = next(iter(sig.parameters.keys()))
        self.assertEqual(first_param, "ctx")

    def test_custom_tool_creation(self):
        """Test custom tool creation with metadata."""

        def divide(x: int, y: int) -> Optional[float]:  # noqa: D401 – simple example
            """Divide x by y, returning None on ZeroDivisionError."""
            try:
                return x / y
            except ZeroDivisionError:
                return None

        callable_tool = create_pydantic_ai_tool_from_func(
            divide,
            name="divide_numbers",
            description="Divide two numbers and handle division by zero.",
        )

        # Should be callable
        self.assertTrue(callable(callable_tool))

        # Should have proper signature
        sig = inspect.signature(callable_tool)
        params = list(sig.parameters.keys())
        self.assertEqual(params[0], "ctx")
        self.assertIn("x", params)
        self.assertIn("y", params)


@pytest.mark.django_db
@pytest.mark.asyncio
class TestPydanticAIToolsAsync(TestCase):
    """Async test cases for PydanticAI tools execution."""

    async def test_sync_function_wrapper_execution(self):
        """Test that sync functions are properly wrapped and executed."""
        core_tool = CoreTool.from_function(sync_multiply)
        wrapper = PydanticAIToolWrapper(core_tool)
        callable_tool = wrapper.callable_function

        ctx = MagicMock()  # RunContext is not used inside the wrapper
        result = await callable_tool(ctx, 3, 4)
        self.assertEqual(result, 12)

    async def test_async_function_wrapper_execution(self):
        """Test that async functions retain async behaviour when wrapped."""
        core_tool = CoreTool.from_function(async_add)
        callable_tool = PydanticAIToolWrapper(core_tool).callable_function

        ctx = MagicMock()
        result = await callable_tool(ctx, 5, 6)
        self.assertEqual(result, 11)

    async def test_factory_from_function_execution(self):
        """Test from_function returns executable callable tool."""
        callable_tool = PydanticAIToolFactory.from_function(sync_multiply)
        ctx = MagicMock()
        result = await callable_tool(ctx, 7, 8)
        self.assertEqual(result, 56)

    async def test_decorator_tool_execution(self):
        """Test decorator creates executable async tool."""

        @pydantic_ai_tool(description="Square a number")
        def square(x: int) -> int:  # type: ignore[valid-type]
            """Return x squared."""
            return x * x

        ctx = MagicMock()
        result = await square(ctx, 9)  # type: ignore[arg-type]
        self.assertEqual(result, 81)

    async def test_typed_tool_execution(self):
        """Test typed tool executes correctly."""
        typed_tool = create_typed_pydantic_ai_tool(subtract)
        ctx = MagicMock()
        result = await typed_tool(ctx, 10, 4)
        self.assertEqual(result, 6)

    async def test_custom_tool_execution_with_error_handling(self):
        """Test custom tool with error handling executes correctly."""

        def divide(x: int, y: int) -> Optional[float]:  # noqa: D401 – simple example
            """Divide x by y, returning None on ZeroDivisionError."""
            try:
                return x / y
            except ZeroDivisionError:
                return None

        callable_tool = create_pydantic_ai_tool_from_func(
            divide,
            name="divide_numbers",
            description="Divide two numbers and handle division by zero.",
        )

        ctx = MagicMock()
        result_ok = await callable_tool(ctx, 8, 2)
        result_fail = await callable_tool(ctx, 8, 0)

        self.assertEqual(result_ok, 4.0)
        self.assertIsNone(result_fail)
