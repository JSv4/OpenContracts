# OpenContracts Metadata System - Overview

## Introduction

OpenContracts provides a powerful and flexible metadata system that allows users to define custom metadata schemas at the corpus level. This system is built on a unified data model that handles both manual metadata entry and automated data extraction, providing consistency and eliminating code duplication.

## Architecture

The metadata system uses three core models:

- **Fieldsets**: Container for metadata schemas, automatically created for each corpus
- **Columns**: Define individual metadata fields with data types and validation rules
- **Datacells**: Store actual metadata values for documents

### Key Design Principles

1. **Unified Model**: Same infrastructure handles both metadata and extracted data
2. **Corpus-Scoped**: Metadata schemas are defined at the corpus level
3. **Type-Safe**: Strong typing with comprehensive validation
4. **Flexible**: Support for 12 different data types including complex types

## Documentation Structure

### Core Documentation

- **[Metadata Fields](./metadata-fields.md)** - Technical reference for the metadata system architecture, models, and validation
- **[Metadata API Examples](./metadata-api-examples.md)** - Comprehensive GraphQL API examples and integration patterns
- **[Frontend Requirements](./metadata-frontend-requirements.md)** - Frontend implementation guide with component specifications

### Related Documentation

- **[Data Extract Models](../walkthrough/advanced/data-extract-models.md)** - Understanding the extraction system that shares the same infrastructure
- **[Corpus Management](../walkthrough/step-3-create-a-corpus.md)** - How to create and manage corpuses with metadata

## Quick Start

### 1. Define Your Schema

Create metadata columns for your corpus using the GraphQL API:

```graphql
mutation CreateMetadataColumn {
  createMetadataColumn(
    corpusId: "your-corpus-id",
    name: "Contract Type",
    dataType: "CHOICE",
    validationConfig: {
      required: true,
      choices: ["Service", "Purchase", "NDA"]
    }
  ) {
    ok
    obj { id }
  }
}
```

### 2. Set Metadata Values

Add metadata to documents:

```graphql
mutation SetMetadataValue {
  setMetadataValue(
    documentId: "doc-id",
    corpusId: "corpus-id",
    columnId: "column-id",
    value: "Service"
  ) {
    ok
  }
}
```

### 3. Query Metadata

Retrieve metadata for analysis:

```graphql
query GetDocumentMetadata {
  documentMetadataDatacells(documentId: "doc-id", corpusId: "corpus-id") {
    column { name }
    data
  }
}
```

## Supported Data Types

| Type | Use Case | Example |
|------|----------|---------|
| STRING | Short text (names, IDs) | "CONT-2024-001" |
| TEXT | Long descriptions | "This agreement..." |
| BOOLEAN | Yes/No fields | true/false |
| INTEGER | Whole numbers | 42 |
| FLOAT | Decimal values | 1234.56 |
| DATE | Calendar dates | "2024-01-15" |
| DATETIME | Timestamps | "2024-01-15T10:30:00Z" |
| URL | Web links | "https://example.com" |
| EMAIL | Email addresses | "user@example.com" |
| CHOICE | Single selection | "Active" |
| MULTI_CHOICE | Multiple selections | ["Legal", "Finance"] |
| JSON | Complex data | {"key": "value"} |

## Key Features

### Comprehensive Validation
- Type checking
- Range constraints
- Pattern matching
- Required field enforcement
- Custom validation rules

### Flexible Schema Management
- Add/modify columns at any time
- Set default values
- Provide help text
- Control display order

### User Interface
- Excel-like grid editing
- Inline validation
- Bulk operations
- Keyboard navigation

### Integration
- Full GraphQL API
- TypeScript support
- React components
- Apollo Client integration

## Common Use Cases

### Contract Management
Define metadata for contract lifecycle:
- Contract type, status, dates
- Vendor information
- Financial values
- Department assignments

### Document Classification
Organize documents with:
- Document types
- Categories and tags
- Processing status
- Review states

### Compliance Tracking
Track regulatory requirements:
- Compliance status
- Review dates
- Approval workflows
- Audit trails

## Best Practices

1. **Plan Your Schema**: Design metadata fields before adding documents
2. **Use Appropriate Types**: Choose the most specific data type
3. **Set Sensible Defaults**: Provide default values for common cases
4. **Add Help Text**: Guide users with clear descriptions
5. **Validate Early**: Use validation rules to catch errors at entry

## Migration Notes

If migrating from the legacy annotation-based system:
1. Export existing metadata annotations
2. Create corresponding columns in the new system
3. Import values as datacells
4. Update any integrations to use the new API

## Next Steps

- Review the [technical documentation](./metadata-fields.md) for detailed architecture information
- Explore [API examples](./metadata-api-examples.md) for integration patterns
- Check [frontend requirements](./metadata-frontend-requirements.md) for UI implementation details
