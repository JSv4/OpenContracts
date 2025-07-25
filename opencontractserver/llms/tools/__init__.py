"""
OpenContracts LLM Tools Package

This package provides framework-agnostic tools and framework-specific adapters.
"""

from opencontractserver.llms.tools.core_tools import (
    aload_document_md_summary,
    aload_document_txt_extract,
    get_md_summary_token_length,
    get_note_content_token_length,
    get_notes_for_document_corpus,
    get_partial_note_content,
    load_document_md_summary,
    load_document_txt_extract,
)
from opencontractserver.llms.tools.tool_factory import (
    CoreTool,
    ToolMetadata,
    UnifiedToolFactory,
    create_document_tools,
)

__all__ = [
    # Core tools
    "load_document_md_summary",
    "get_md_summary_token_length",
    "get_notes_for_document_corpus",
    "get_note_content_token_length",
    "get_partial_note_content",
    "load_document_txt_extract",
    "aload_document_txt_extract",
    "aload_document_md_summary",
    # Factory and metadata
    "CoreTool",
    "ToolMetadata",
    "UnifiedToolFactory",
    "create_document_tools",
]
