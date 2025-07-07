"""Test nest_asyncio in isolation to see if it's causing the hang."""

import signal
import sys


# Timeout handler
def timeout_handler(signum, frame):
    print("TIMEOUT: Script hung for more than 30 seconds!", flush=True)
    sys.exit(1)


# Set a 30-second timeout
signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(30)

print("=== Testing nest_asyncio ===", flush=True)
print(f"Python: {sys.version}", flush=True)

# Test 1: Basic import
print("\n1. Importing nest_asyncio...", flush=True)
try:
    import nest_asyncio

    print("✓ nest_asyncio imported successfully", flush=True)
except Exception as e:
    print(f"✗ Failed to import nest_asyncio: {e}", flush=True)
    sys.exit(1)

# Test 2: Apply patch
print("\n2. Applying nest_asyncio patch...", flush=True)
try:
    nest_asyncio.apply()
    print("✓ nest_asyncio.apply() completed", flush=True)
except Exception as e:
    print(f"✗ nest_asyncio.apply() failed: {e}", flush=True)
    sys.exit(1)

# Test 3: Check event loop
print("\n3. Testing asyncio after patch...", flush=True)
try:
    import asyncio

    loop = asyncio.get_event_loop()
    print(f"✓ Event loop: {loop}", flush=True)

    # Try running a simple async function
    async def test_func():
        return "test completed"

    result = loop.run_until_complete(test_func())
    print(f"✓ Async test result: {result}", flush=True)
except Exception as e:
    print(f"✗ Asyncio test failed: {e}", flush=True)
    import traceback

    traceback.print_exc()

# Test 4: Import llama_index with nest_asyncio applied
print("\n4. Importing llama_index modules...", flush=True)
try:
    import llama_index.core  # noqa: F401

    print("✓ llama_index.core imported", flush=True)

    import llama_index.agent.openai  # noqa: F401

    print("✓ llama_index.agent.openai imported", flush=True)
except Exception as e:
    print(f"✗ llama_index import failed: {e}", flush=True)
    import traceback

    traceback.print_exc()

print("\n=== All tests completed successfully ===", flush=True)
signal.alarm(0)  # Cancel the timeout
