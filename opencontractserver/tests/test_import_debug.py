"""Debug script to isolate import issues."""

import os
import sys
import traceback

# Set up Django before any imports
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
import django  # noqa: E402

django.setup()


def debug_imports():
    """Script that helps debug import issues in CI."""
    print("=== Starting import debug test ===", flush=True)
    print(f"Python version: {sys.version}", flush=True)
    print(f"Python path: {sys.path}", flush=True)

    # Test basic imports
    print("\n1. Testing basic imports...", flush=True)
    try:
        import django

        print(f"✓ Django imported: {django.__version__}", flush=True)
    except Exception as e:
        print(f"✗ Django import failed: {e}", flush=True)
        traceback.print_exc()

    # Test async/nest_asyncio
    print("\n2. Testing nest_asyncio...", flush=True)
    try:
        import nest_asyncio

        print("✓ nest_asyncio imported", flush=True)
        nest_asyncio.apply()
        print("✓ nest_asyncio.apply() called", flush=True)
    except Exception as e:
        print(f"✗ nest_asyncio failed: {e}", flush=True)
        traceback.print_exc()

    # Test llama_index imports
    print("\n3. Testing llama_index imports...", flush=True)
    try:
        print("  - Importing llama_index.core...", flush=True)
        import llama_index.core

        print("  ✓ llama_index.core imported", flush=True)

        print("  - Importing llama_index.llms.openai...", flush=True)
        import llama_index.llms.openai

        print("  ✓ llama_index.llms.openai imported", flush=True)

        print("  - Importing llama_index.agent.openai...", flush=True)
        import llama_index.agent.openai  # noqa: F401

        print("  ✓ llama_index.agent.openai imported", flush=True)
    except Exception as e:
        print(f"✗ llama_index import failed: {e}", flush=True)
        traceback.print_exc()

    # Test the actual problematic import
    print("\n4. Testing agent factory imports...", flush=True)
    try:
        print("  - Importing UnifiedAgentFactory...", flush=True)
        from opencontractserver.llms.agents.agent_factory import (  # noqa: F401
            UnifiedAgentFactory,
        )

        print("  ✓ UnifiedAgentFactory imported", flush=True)
    except Exception as e:
        print(f"✗ UnifiedAgentFactory import failed: {e}", flush=True)
        traceback.print_exc()

    # Test the mock paths
    print("\n5. Testing mock paths...", flush=True)
    paths = [
        "opencontractserver.llms.agents.llama_index_agents.LlamaIndexDocumentAgent",
        "opencontractserver.llms.agents.pydantic_ai_agents.PydanticAIDocumentAgent",
    ]

    for path in paths:
        try:
            parts = path.split(".")
            module_path = ".".join(parts[:-1])
            class_name = parts[-1]
            print(f"  - Importing {module_path}...", flush=True)
            module = __import__(module_path, fromlist=[class_name])
            print(f"  ✓ {module_path} imported", flush=True)
            if hasattr(module, class_name):
                print(f"  ✓ {class_name} found in module", flush=True)
            else:
                print(f"  ✗ {class_name} NOT found in module", flush=True)
        except Exception as e:
            print(f"  ✗ Failed to import {path}: {e}", flush=True)
            traceback.print_exc()

    print("\n=== Import debug test completed ===", flush=True)


if __name__ == "__main__":
    debug_imports()
