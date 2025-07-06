"""Unified tool factory that can create tools for different frameworks."""

import inspect
import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional

from opencontractserver.llms.types import AgentFramework

logger = logging.getLogger(__name__)


@dataclass
class ToolMetadata:
    """Metadata for a tool function."""

    name: str
    description: str
    parameter_descriptions: Optional[dict[str, str]] = None


@dataclass
class CoreTool:
    """Framework-agnostic tool representation.

    ``requires_approval`` marks tools that must be explicitly approved by a
    human before execution.  Framework adapters **must** honour this flag
    and implement a veto-gate when set to ``True``.
    
    ``requires_corpus`` marks tools that need a corpus_id to function.
    These tools will be filtered out when creating agents for documents
    that are not in any corpus.
    """

    function: Callable
    metadata: ToolMetadata
    requires_approval: bool = False
    requires_corpus: bool = False

    @classmethod
    def from_function(
        cls,
        func: Callable,
        name: Optional[str] = None,
        description: Optional[str] = None,
        parameter_descriptions: Optional[dict[str, str]] = None,
        *,
        requires_approval: bool = False,
        requires_corpus: bool = False,
    ) -> "CoreTool":
        """Create a CoreTool from a Python function.

        Args:
            func: The Python function to wrap
            name: Optional custom name (defaults to function name)
            description: Optional custom description (extracted from docstring if not provided)
            parameter_descriptions: Optional parameter descriptions
            requires_approval: Whether the tool requires explicit approval
            requires_corpus: Whether the tool requires a corpus_id to function

        Returns:
            CoreTool instance
        """
        tool_name = name or func.__name__
        tool_description = description or _extract_description_from_docstring(func)

        if not parameter_descriptions:
            parameter_descriptions = _extract_parameter_descriptions_from_docstring(
                func
            )

        metadata = ToolMetadata(
            name=tool_name,
            description=tool_description,
            parameter_descriptions=parameter_descriptions,
        )

        return cls(
            function=func, metadata=metadata, requires_approval=requires_approval, requires_corpus=requires_corpus
        )

    @property
    def name(self) -> str:
        """Get the tool name."""
        return self.metadata.name

    @property
    def description(self) -> str:
        """Get the tool description."""
        return self.metadata.description

    @property
    def parameters(self) -> dict[str, Any]:
        """Get the tool parameters schema."""
        sig = inspect.signature(self.function)
        properties = {}
        required = []

        for param_name, param in sig.parameters.items():
            param_info = {
                "type": "string",  # Default type
                "description": self.metadata.parameter_descriptions.get(param_name, ""),
            }

            # Try to infer type from annotation
            if param.annotation != inspect.Parameter.empty:
                if param.annotation == int:
                    param_info["type"] = "integer"
                elif param.annotation == float:
                    param_info["type"] = "number"
                elif param.annotation == bool:
                    param_info["type"] = "boolean"
                elif param.annotation == list:
                    param_info["type"] = "array"
                elif param.annotation == dict:
                    param_info["type"] = "object"

            properties[param_name] = param_info

            # Add to required if no default value
            if param.default == inspect.Parameter.empty:
                required.append(param_name)

        return {"type": "object", "properties": properties, "required": required}


class UnifiedToolFactory:
    """Factory that creates tools using different frameworks with a common interface."""

    @staticmethod
    def create_tool(tool: CoreTool, framework: AgentFramework) -> Any:
        """Create a framework-specific tool from a CoreTool.

        Args:
            tool: CoreTool instance
            framework: Target framework

        Returns:
            Framework-specific tool instance
        """
        if framework == AgentFramework.LLAMA_INDEX:
            from opencontractserver.llms.tools.llama_index_tools import (
                LlamaIndexToolFactory,
            )

            return LlamaIndexToolFactory.create_tool(tool)
        elif framework == AgentFramework.PYDANTIC_AI:
            from opencontractserver.llms.tools.pydantic_ai_tools import (
                PydanticAIToolFactory,
            )

            return PydanticAIToolFactory.create_tool(tool)
        else:
            raise ValueError(f"Unsupported framework: {framework}")

    @staticmethod
    def create_tools(tools: list[CoreTool], framework: AgentFramework) -> list[Any]:
        """Create framework-specific tools from a list of CoreTools.

        Args:
            tools: List of CoreTool instances
            framework: Target framework

        Returns:
            List of framework-specific tool instances
        """
        if framework == AgentFramework.LLAMA_INDEX:
            from opencontractserver.llms.tools.llama_index_tools import (
                LlamaIndexToolFactory,
            )

            return LlamaIndexToolFactory.create_tools(tools)
        elif framework == AgentFramework.PYDANTIC_AI:
            from opencontractserver.llms.tools.pydantic_ai_tools import (
                PydanticAIToolFactory,
            )

            return PydanticAIToolFactory.create_tools(tools)
        else:
            raise ValueError(f"Unsupported framework: {framework}")

    @staticmethod
    def from_function(
        func: Callable,
        framework: AgentFramework,
        name: Optional[str] = None,
        description: Optional[str] = None,
        parameter_descriptions: Optional[dict[str, str]] = None,
        *,
        requires_approval: bool = False,
        requires_corpus: bool = False,
    ) -> Any:
        """Create a framework-specific tool directly from a function.

        Args:
            func: Python function to wrap
            framework: Target framework
            name: Optional custom name
            description: Optional custom description
            parameter_descriptions: Optional parameter descriptions
            requires_approval: Whether the tool requires explicit approval
            requires_corpus: Whether the tool requires a corpus_id to function

        Returns:
            Framework-specific tool instance
        """
        if framework == AgentFramework.LLAMA_INDEX:
            from opencontractserver.llms.tools.llama_index_tools import (
                LlamaIndexToolFactory,
            )

            return LlamaIndexToolFactory.from_function(
                func=func,
                name=name,
                description=description,
                parameter_descriptions=parameter_descriptions,
                requires_approval=requires_approval,
                requires_corpus=requires_corpus,
            )
        elif framework == AgentFramework.PYDANTIC_AI:
            from opencontractserver.llms.tools.pydantic_ai_tools import (
                PydanticAIToolFactory,
            )

            return PydanticAIToolFactory.from_function(
                func=func,
                name=name,
                description=description,
                parameter_descriptions=parameter_descriptions,
                requires_approval=requires_approval,
                requires_corpus=requires_corpus,
            )
        else:
            raise ValueError(f"Unsupported framework: {framework}")


def _extract_description_from_docstring(func: Callable) -> str:
    """Extract the main description from a function's docstring."""
    if not func.__doc__:
        return f"Function {func.__name__}"

    # Get the first line or paragraph of the docstring
    lines = func.__doc__.strip().split("\n")
    description = lines[0].strip()

    # If the first line is empty, try the next non-empty line
    if not description and len(lines) > 1:
        for line in lines[1:]:
            if line.strip():
                description = line.strip()
                break

    return description or f"Function {func.__name__}"


def _extract_parameter_descriptions_from_docstring(func: Callable) -> dict[str, str]:
    """Extract parameter descriptions from a function's docstring."""
    if not func.__doc__:
        return {}

    parameter_descriptions = {}
    lines = func.__doc__.strip().split("\n")
    in_args_section = False

    for line in lines:
        line = line.strip()
        if line.startswith("Args:") or line.startswith("Arguments:"):
            in_args_section = True
            continue
        elif line.startswith("Returns:") or line.startswith("Raises:"):
            in_args_section = False
            continue

        if in_args_section and ":" in line:
            # Parse lines like "document_id: The primary key (ID) of the Document"
            parts = line.split(":", 1)
            if len(parts) == 2:
                param_name = parts[0].strip()
                description = parts[1].strip()
                parameter_descriptions[param_name] = description

    return parameter_descriptions


# Convenience functions for creating common tools
def create_document_tools() -> list[CoreTool]:
    """Create standard document-related tools."""
    from opencontractserver.llms.tools.core_tools import (
        get_md_summary_token_length,
        get_note_content_token_length,
        get_notes_for_document_corpus,
        get_partial_note_content,
        load_document_md_summary,
    )

    return [
        CoreTool.from_function(
            load_document_md_summary,
            description="Load markdown summary of a document, optionally truncated.",
        ),
        CoreTool.from_function(
            get_md_summary_token_length,
            description="Get the token length of a document's markdown summary.",
        ),
        CoreTool.from_function(
            get_notes_for_document_corpus,
            description="Get notes associated with a document and optional corpus.",
        ),
        CoreTool.from_function(
            get_note_content_token_length,
            description="Get the token length of a note's content.",
        ),
        CoreTool.from_function(
            get_partial_note_content,
            description="Get a substring of a note's content by start/end indices.",
        ),
    ]
