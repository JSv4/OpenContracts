"""LlamaIndex-specific tool implementations."""

import logging
from typing import Callable, Optional

from llama_index.core.tools import FunctionTool

from opencontractserver.llms.tools.tool_factory import CoreTool

logger = logging.getLogger(__name__)


class LlamaIndexToolFactory:
    """Factory for creating LlamaIndex compatible tools from CoreTools."""

    @staticmethod
    def create_tools(core_tools: list[CoreTool]) -> list[FunctionTool]:
        """Convert a list of CoreTools to LlamaIndex FunctionTools.

        Args:
            core_tools: List of CoreTool instances

        Returns:
            List of LlamaIndex FunctionTool instances
        """
        return [LlamaIndexToolFactory.create_tool(tool) for tool in core_tools]

    @staticmethod
    def create_tool(core_tool: CoreTool) -> FunctionTool:
        """Convert a single CoreTool to LlamaIndex FunctionTool.

        Args:
            core_tool: CoreTool instance

        Returns:
            LlamaIndex FunctionTool instance
        """
        try:
            return FunctionTool.from_defaults(
                fn=core_tool.function,
                name=core_tool.name,
                description=core_tool.description,
            )
        except ImportError:
            raise ImportError("LlamaIndex is required to create LlamaIndex tools")

    @staticmethod
    def from_function(
        func: Callable,
        name: Optional[str] = None,
        description: Optional[str] = None,
        parameter_descriptions: Optional[dict[str, str]] = None,
    ) -> FunctionTool:
        """Create a LlamaIndex tool directly from a function.

        Args:
            func: Python function to wrap
            name: Optional custom name
            description: Optional custom description
            parameter_descriptions: Optional parameter descriptions

        Returns:
            LlamaIndex FunctionTool instance
        """
        core_tool = CoreTool.from_function(
            func=func,
            name=name,
            description=description,
            parameter_descriptions=parameter_descriptions,
        )
        return LlamaIndexToolFactory.create_tool(core_tool)

    @staticmethod
    def create_tool_registry(core_tools: list[CoreTool]) -> dict[str, FunctionTool]:
        """Create a registry of tools by name.

        Args:
            core_tools: List of CoreTool instances

        Returns:
            Dictionary mapping tool names to LlamaIndex FunctionTool instances
        """
        return {
            tool.name: LlamaIndexToolFactory.create_tool(tool) for tool in core_tools
        }


def convert_core_tools_to_llama_index(core_tools: list[CoreTool]) -> list[FunctionTool]:
    """Convenience function to convert CoreTools to LlamaIndex format.

    Args:
        core_tools: List of CoreTool instances

    Returns:
        List of LlamaIndex FunctionTool instances
    """
    return LlamaIndexToolFactory.create_tools(core_tools)


def create_llama_index_tool_from_function(
    func: Callable,
    name: Optional[str] = None,
    description: Optional[str] = None,
    parameter_descriptions: Optional[dict[str, str]] = None,
) -> FunctionTool:
    """Convenience function to create a LlamaIndex tool from a function.

    Args:
        func: Python function to wrap
        name: Optional custom name
        description: Optional custom description
        parameter_descriptions: Optional parameter descriptions

    Returns:
        LlamaIndex FunctionTool instance
    """
    return LlamaIndexToolFactory.from_function(
        func=func,
        name=name,
        description=description,
        parameter_descriptions=parameter_descriptions,
    )


def get_llama_index_document_tools() -> list[FunctionTool]:
    """Get all document tools as LlamaIndex FunctionTools."""
    from opencontractserver.llms.tools.tool_factory import create_document_tools

    core_tools = create_document_tools()
    return LlamaIndexToolFactory.create_tools(core_tools)


# Individual tool instances for backward compatibility
def _create_individual_tools():
    """Create individual tool instances for backward compatibility."""
    from opencontractserver.llms.tools.core_tools import (
        get_md_summary_token_length,
        get_note_content_token_length,
        get_notes_for_document_corpus,
        get_partial_note_content,
        load_document_md_summary,
    )

    return {
        "load_document_md_summary_tool": FunctionTool.from_defaults(
            load_document_md_summary
        ),
        "get_md_summary_token_length_tool": FunctionTool.from_defaults(
            get_md_summary_token_length
        ),
        "get_notes_for_document_corpus_tool": FunctionTool.from_defaults(
            get_notes_for_document_corpus
        ),
        "get_note_content_token_length_tool": FunctionTool.from_defaults(
            get_note_content_token_length
        ),
        "get_partial_note_content_tool": FunctionTool.from_defaults(
            get_partial_note_content
        ),
    }


# Create individual tools for backward compatibility
_individual_tools = _create_individual_tools()
load_document_md_summary_tool = _individual_tools["load_document_md_summary_tool"]
get_md_summary_token_length_tool = _individual_tools["get_md_summary_token_length_tool"]
get_notes_for_document_corpus_tool = _individual_tools[
    "get_notes_for_document_corpus_tool"
]
get_note_content_token_length_tool = _individual_tools[
    "get_note_content_token_length_tool"
]
get_partial_note_content_tool = _individual_tools["get_partial_note_content_tool"]
