# Structured Data Extraction Guide

## Overview

The OpenContracts structured extraction system has been enhanced with a rigorous multi-phase verification process that ensures all extracted data is directly traceable to document content. The system now explicitly leverages all available tools and implements backward reasoning to verify results.

## Key Features

### 1. No Prior Knowledge Policy
The extraction agent operates with **ZERO** prior knowledge about documents. All information must come from tool calls:
- `similarity_search` - Semantic vector search
- `load_document_md_summary` - Document markdown summary
- `load_document_txt_extract` - Plain text content
- `get_document_notes` - Human-created notes
- `search_document_notes` - Keyword search in notes
- `get_document_summary` - Human-prepared summaries

### 2. Four-Phase Extraction Process

#### Phase 1: Comprehensive Search
- Analyzes the extraction request
- Plans multiple search strategies
- Executes systematic searches with query variations
- Collects all potentially relevant information

#### Phase 2: Initial Extraction
- Reviews gathered information
- Extracts only directly supported data
- Notes the source for each data point
- Handles conflicts by preferring authoritative sources

#### Phase 3: Backward Verification
- Works backwards from proposed answer
- Verifies each data point can be traced to exact tool results
- Removes any unverifiable data
- Triggers re-search if gaps are found

#### Phase 4: Iteration (if needed)
- Identifies missing or incorrect information
- Formulates targeted search queries
- Repeats process until verified or exhausted

## Usage Examples

### Basic Extraction

```python
from pydantic import BaseModel, Field
from opencontractserver.llms import agents

class ContractParties(BaseModel):
    buyer: str = Field(description="Name of the buyer")
    seller: str = Field(description="Name of the seller")

agent = await agents.for_document(document=123, corpus=456)

# Simple extraction
parties = await agent.structured_response(
    "Extract the buyer and seller names from this contract",
    ContractParties
)

if parties:
    print(f"Buyer: {parties.buyer}")
    print(f"Seller: {parties.seller}")
else:
    print("Could not find party information in document")
```

### With Extra Context

```python
class PaymentTerms(BaseModel):
    amount: float = Field(description="Payment amount")
    currency: str = Field(description="Currency code")
    due_date: str = Field(description="Payment due date")

# Provide additional context to guide extraction
result = await agent.structured_response(
    "Extract payment terms from Section 4",
    PaymentTerms,
    extra_context="""
    This is a software licensing agreement.
    Payment terms are typically found in Section 4 or Exhibit A.
    The company uses standard NET 30 terms.
    """
)
```

### Complex Nested Extraction

```python
from typing import List, Optional

class Milestone(BaseModel):
    name: str = Field(description="Milestone name")
    date: str = Field(description="Target completion date")
    deliverables: List[str] = Field(description="List of deliverables")
    payment: Optional[float] = Field(None, description="Payment amount if specified")

class ProjectSchedule(BaseModel):
    project_name: str = Field(description="Name of the project")
    start_date: str = Field(description="Project start date")
    end_date: str = Field(description="Project end date")
    milestones: List[Milestone] = Field(description="Project milestones")

schedule = await agent.structured_response(
    "Extract the complete project schedule including all milestones",
    ProjectSchedule,
    extra_context="Focus on the Statement of Work section and any attached schedules"
)
```

## Verification Rules

The system enforces strict verification:

1. **Dates**: Must be explicitly stated, not inferred
2. **Numbers**: Exact matches only, no calculations
3. **Names**: Verbatim from source, no corrections
4. **Booleans**: Require explicit supporting statements
5. **Lists**: Must be complete based on source
6. **Relationships**: Both entities and relationship must be explicit

## Best Practices

### 1. Be Specific in Prompts
```python
# Good - specific location and detail
result = await agent.structured_response(
    "Extract the termination clause details from Section 12.3",
    TerminationClause
)

# Less effective - too vague
result = await agent.structured_response(
    "Get termination info",
    TerminationClause
)
```

### 2. Use Extra Context Wisely
```python
# Helpful context about document structure
extra_context = """
This is a standard ISDA agreement where:
- Part 1 contains party information
- Part 2 contains general terms
- Schedule contains elections and variables
"""

result = await agent.structured_response(
    "Extract the credit support provisions",
    CreditSupport,
    extra_context=extra_context
)
```

### 3. Handle Null Results Gracefully
```python
result = await agent.structured_response(
    "Extract arbitration clause details",
    ArbitrationClause
)

if result is None:
    # The document may not contain arbitration provisions
    print("No arbitration clause found in this document")
else:
    process_arbitration_details(result)
```

### 4. Use Appropriate Types
```python
# For optional fields
class ContractValue(BaseModel):
    amount: float
    currency: str
    payment_schedule: Optional[str] = None  # May not be specified

# For lists that might be empty
class Warranties(BaseModel):
    express_warranties: List[str] = Field(default_factory=list)
    implied_warranties: List[str] = Field(default_factory=list)
```

## Error Handling

The system returns `None` when:
- Required information cannot be found after exhaustive search
- The extraction request doesn't apply to the document type
- Tool searches fail to return relevant results
- Backward verification cannot trace data to sources

```python
try:
    result = await agent.structured_response(
        "Extract insurance requirements",
        InsuranceRequirements
    )

    if result is None:
        # Information not found - this is normal
        log.info("No insurance requirements in document")
    else:
        process_insurance_data(result)

except Exception as e:
    # Actual error in extraction process
    log.error(f"Extraction failed: {e}")
```

## Performance Considerations

The multi-phase approach may result in multiple tool calls:
1. Initial broad searches (2-4 calls)
2. Verification searches (1-3 calls)
3. Gap-filling iterations (0-2 calls per gap)

To optimize:
- Be specific in extraction prompts
- Provide helpful extra context
- Use simpler schemas when possible
- Consider breaking complex extractions into steps

## Using the Convenience API

The framework provides convenience methods that support `extra_context`:

```python
from opencontractserver.llms import agents

# Using the convenience API with extra context
result = await agents.get_structured_response_from_document(
    document=123,
    corpus=456,
    prompt="Extract all warranty provisions",
    target_type=WarrantyInfo,
    extra_context="""
    This is a purchase agreement for manufacturing equipment.
    Warranties are typically in Section 8 or in an appendix.
    Look for both express and implied warranties.
    The vendor is ABC Manufacturing Corp.
    """
)

# The extra_context flows through to the extraction prompt
# and helps guide the agent's search strategy
```

## Summary

The enhanced structured extraction system provides:
- **Reliability**: All data traceable to document sources
- **Accuracy**: Multi-phase verification prevents hallucination
- **Transparency**: Clear search and verification process
- **Flexibility**: Supports simple to complex data schemas
- **Safety**: Returns None rather than guessing
- **Context Support**: Extra guidance via `extra_context` parameter
