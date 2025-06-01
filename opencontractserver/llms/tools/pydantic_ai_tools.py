"""Pydantic AI-specific tool implementations following latest syntax patterns."""

import inspect
import logging
from typing import Any, Callable, Optional, get_type_hints

from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import RunContext

from opencontractserver.llms.tools.tool_factory import CoreTool
from opencontractserver.llms.vector_stores.core_vector_stores import (
    CoreAnnotationVectorStore,
)

logger = logging.getLogger(__name__)


class PydanticAIToolMetadata(BaseModel):
    """Pydantic model for tool metadata."""

    name: str = Field(..., description="The name of the tool")
    description: str = Field(..., description="Description of what the tool does")
    parameters: dict[str, Any] = Field(
        default_factory=dict, description="Tool parameter schema"
    )


class PydanticAIDependencies(BaseModel):
    """
    Default dependencies for PydanticAI tools and agents.
    This class is used as the `deps_type` for PydanticAI Agents
    and for typing the `RunContext` in tools.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    user_id: Optional[int] = Field(default=None, description="Current user ID")
    document_id: Optional[int] = Field(default=None, description="Current document ID")
    corpus_id: Optional[int] = Field(default=None, description="Current corpus ID")
    vector_store: CoreAnnotationVectorStore = Field(
        default=None, description="Vector store instance"
    )


class PydanticAIToolWrapper:
    """Modern Pydantic AI tool wrapper following latest patterns."""

    def __init__(self, core_tool: CoreTool):
        """Initialize the wrapper.

        Args:
            core_tool: The CoreTool instance to wrap
        """
        self.core_tool = core_tool
        self._metadata = PydanticAIToolMetadata(
            name=core_tool.name,
            description=core_tool.description,
            parameters=core_tool.parameters,
        )

        # Create a properly typed wrapper function for PydanticAI
        self._wrapped_function = self._create_pydantic_ai_compatible_function()

    @property
    def callable_function(self) -> Callable:
        """The PydanticAI-compatible callable tool function."""
        return self._wrapped_function

    def to_dict(self) -> dict:
        return {
            "function": {
                "name": self.name,
                "description": self.description,
            },
            "name": self.name,
            "description": self.description,
        }

    def _create_pydantic_ai_compatible_function(self) -> Callable:
        """Create a PydanticAI-compatible async function with RunContext as first parameter."""
        original_func = self.core_tool.function
        func_name = self.core_tool.name

        # Get original function signature
        sig = inspect.signature(original_func)

        # Create new parameters list with RunContext as first parameter
        new_params = [
            inspect.Parameter(
                "ctx",
                inspect.Parameter.POSITIONAL_OR_KEYWORD,
                annotation=RunContext[PydanticAIDependencies],
            )
        ]

        # Add original parameters (excluding 'self' if present)
        for param_name, param in sig.parameters.items():
            if param_name not in ["self", "cls"]:
                new_params.append(param)

        # Create new signature
        new_sig = sig.replace(parameters=new_params)

        if inspect.iscoroutinefunction(original_func):

            async def async_wrapper(
                ctx: RunContext[PydanticAIDependencies], *args, **kwargs
            ):
                """Async wrapper for PydanticAI tools."""
                try:
                    # Dependencies from ctx.deps can be accessed here if original_func needs them
                    # For now, CoreTool functions are generic and don't use ctx.
                    return await original_func(*args, **kwargs)
                except Exception as e:
                    logger.error(f"Error in tool {func_name}: {e}")
                    raise

            # Set proper metadata
            async_wrapper.__name__ = func_name
            async_wrapper.__doc__ = original_func.__doc__ or self._metadata.description
            async_wrapper.__signature__ = new_sig
            async_wrapper.__annotations__ = getattr(
                original_func, "__annotations__", {}
            )

            return async_wrapper
        else:
            # Convert sync function to async
            async def sync_to_async_wrapper(
                ctx: RunContext[PydanticAIDependencies], *args, **kwargs
            ):
                """Sync to async wrapper for PydanticAI tools."""
                try:
                    # Dependencies from ctx.deps can be accessed here if original_func needs them
                    return original_func(*args, **kwargs)
                except Exception as e:
                    logger.error(f"Error in tool {func_name}: {e}")
                    raise

            # Set proper metadata
            sync_to_async_wrapper.__name__ = func_name
            sync_to_async_wrapper.__doc__ = (
                original_func.__doc__ or self._metadata.description
            )
            sync_to_async_wrapper.__signature__ = new_sig
            sync_to_async_wrapper.__annotations__ = getattr(
                original_func, "__annotations__", {}
            )

            return sync_to_async_wrapper

    @property
    def name(self) -> str:
        """Get the tool name."""
        return self._metadata.name

    @property
    def description(self) -> str:
        """Get the tool description."""
        return self._metadata.description

    @property
    def metadata(self) -> PydanticAIToolMetadata:
        """Get the tool metadata."""
        return self._metadata

    def __call__(self, *args, **kwargs) -> Any:
        """Make the wrapper callable."""
        return self._wrapped_function(*args, **kwargs)

    def get_tool_definition(self) -> dict[str, Any]:
        """Get the tool definition for PydanticAI agent registration.

        Returns:
            Dictionary containing tool function and metadata
        """
        return {
            "function": self._wrapped_function,
            "name": self.name,
            "description": self.description,
        }

    def __repr__(self) -> str:
        """String representation."""
        return f"PydanticAIToolWrapper(name='{self.name}', description='{self.description[:50]}...')"


class PydanticAIToolFactory:
    """Modern factory for creating Pydantic AI compatible tools."""

    @staticmethod
    def create_tools(core_tools: list[CoreTool]) -> list[Callable]:
        """Convert a list of CoreTools to modern Pydantic AI callable tools.

        Args:
            core_tools: List of CoreTool instances

        Returns:
            List of PydanticAI-compatible callable functions
        """
        return [PydanticAIToolFactory.create_tool(tool) for tool in core_tools]

    @staticmethod
    def create_tool(core_tool: CoreTool) -> Callable:
        """Convert a single CoreTool to a modern Pydantic AI callable tool.

        Args:
            core_tool: CoreTool instance

        Returns:
            PydanticAI-compatible callable function
        """
        return PydanticAIToolWrapper(core_tool).callable_function

    @staticmethod
    def from_function(
        func: Callable,
        name: Optional[str] = None,
        description: Optional[str] = None,
        parameter_descriptions: Optional[dict[str, str]] = None,
    ) -> Callable:
        """Create a PydanticAI-compatible callable tool directly from a Python function.

        Args:
            func: Python function to wrap
            name: Optional custom name
            description: Optional custom description
            parameter_descriptions: Optional parameter descriptions

        Returns:
            PydanticAI-compatible callable function
        """
        core_tool = CoreTool.from_function(
            func=func,
            name=name,
            description=description,
            parameter_descriptions=parameter_descriptions,
        )
        return PydanticAIToolWrapper(core_tool).callable_function

    @staticmethod
    def create_tool_registry(core_tools: list[CoreTool]) -> dict[str, Callable]:
        """Create a registry of PydanticAI-compatible callable tools by name.

        Args:
            core_tools: List of CoreTool instances

        Returns:
            Dictionary mapping tool names to PydanticAI-compatible callable functions
        """
        return {
            tool.name: PydanticAIToolFactory.create_tool(tool) for tool in core_tools
        }

    @staticmethod
    def create_typed_tool_from_function(
        func: Callable,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Callable:
        """Create a fully typed Pydantic AI callable tool using function annotations.

        This method leverages Python type hints to create better tool schemas.

        Args:
            func: Python function with proper type hints
            name: Optional custom name
            description: Optional custom description

        Returns:
            PydanticAI-compatible callable function with enhanced type information
        """
        # Extract type hints
        type_hints = get_type_hints(func)
        sig = inspect.signature(func)

        # Build parameter descriptions from type hints
        parameter_descriptions = {}
        for param_name, param in sig.parameters.items():
            if param_name in type_hints:
                type_hint = type_hints[param_name]
                parameter_descriptions[param_name] = f"Parameter of type {type_hint}"

        return PydanticAIToolFactory.from_function(
            func=func,
            name=name,
            description=description,
            parameter_descriptions=parameter_descriptions,
        )


def pydantic_ai_tool(
    name: Optional[str] = None,
    description: Optional[str] = None,
    parameter_descriptions: Optional[dict[str, str]] = None,
) -> Callable[[Callable], Callable]:
    """Decorator to create Pydantic AI compatible callable tools.

    Args:
        name: Optional custom name for the tool
        description: Optional description of the tool
        parameter_descriptions: Optional parameter descriptions

    Returns:
        Decorator function that transforms a function into a PydanticAI-compatible callable tool

    Example:
        @pydantic_ai_tool(description="Extract dates from text")
        async def extract_dates(text: str) -> List[str]: # Note: ctx is added by the wrapper
            '''Extract all dates from the given text.'''
            # Implementation here
            return ["2024-01-01", "2024-12-31"]
    """

    def decorator(func: Callable) -> Callable:
        """Inner decorator that wraps the function."""
        return PydanticAIToolFactory.from_function(
            func=func,
            name=name,
            description=description,
            parameter_descriptions=parameter_descriptions,
        )

    return decorator


def create_pydantic_ai_tool_from_func(
    func: Callable,
    name: Optional[str] = None,
    description: Optional[str] = None,
    parameter_descriptions: Optional[dict[str, str]] = None,
) -> Callable:
    """Create a PydanticAI-compatible callable tool from a function.

    Args:
        func: Python function to wrap
        name: Optional custom name
        description: Optional custom description
        parameter_descriptions: Optional parameter descriptions

    Returns:
        PydanticAI-compatible callable function
    """
    return PydanticAIToolFactory.from_function(
        func=func,
        name=name,
        description=description,
        parameter_descriptions=parameter_descriptions,
    )


def create_typed_pydantic_ai_tool(func: Callable) -> Callable:
    """Create a fully typed Pydantic AI callable tool using function type hints.

    Args:
        func: Python function with proper type annotations

    Returns:
        PydanticAI-compatible callable function with enhanced type information
    """
    return PydanticAIToolFactory.create_typed_tool_from_function(func)
