import {
  MetadataColumn,
  MetadataDataType,
  MetadataDatacell,
  MetadataFieldset,
} from "../../src/types/metadata";

// Factory for creating mock metadata columns
export const createMockColumn = (
  overrides?: Partial<MetadataColumn>
): MetadataColumn => ({
  id: `col-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name: "Test Column",
  dataType: MetadataDataType.STRING,
  extractIsList: false,
  isManualEntry: true,
  validationRules: {},
  orderIndex: 0,
  __typename: "ColumnType",
  ...overrides,
});

// Factory for creating mock datacells
export const createMockDatacell = (
  columnId: string,
  documentId: string,
  value: any,
  overrides?: Partial<MetadataDatacell>
): MetadataDatacell => ({
  id: `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  column: {
    id: columnId,
    __typename: "ColumnType",
  },
  document: {
    id: documentId,
    __typename: "DocumentType",
  },
  data: { value },
  correctedData: null,
  failed: false,
  __typename: "DatacellType",
  ...overrides,
});

// Factory for creating mock fieldsets
export const createMockFieldset = (
  columns: MetadataColumn[],
  overrides?: Partial<MetadataFieldset>
): MetadataFieldset => ({
  id: `fieldset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name: "Test Fieldset",
  columns: {
    edges: columns.map((col) => ({
      node: col,
      __typename: "ColumnTypeEdge",
    })),
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
      __typename: "PageInfo",
    },
    __typename: "ColumnTypeConnection",
  },
  __typename: "FieldsetType",
  ...overrides,
});

// Factory for creating page info
export const createMockPageInfo = () => ({
  hasNextPage: false,
  hasPreviousPage: false,
  startCursor: null,
  endCursor: null,
  __typename: "PageInfo",
});

// Factory for creating validation rules
export const createValidationRules = {
  string: (maxLength?: number, choices?: string[]) => ({
    max_length: maxLength,
    choices: choices,
  }),
  number: (min?: number, max?: number) => ({
    min: min,
    max: max,
  }),
  date: (minDate?: string, maxDate?: string) => ({
    min_date: minDate,
    max_date: maxDate,
  }),
};

// Factory for creating complete test scenarios
export const createMetadataTestScenario = () => {
  const columns = [
    createMockColumn({
      id: "col1",
      name: "Contract Date",
      dataType: MetadataDataType.DATE,
      orderIndex: 0,
    }),
    createMockColumn({
      id: "col2",
      name: "Contract Value",
      dataType: MetadataDataType.NUMBER,
      validationRules: createValidationRules.number(0, 1000000),
      orderIndex: 1,
    }),
    createMockColumn({
      id: "col3",
      name: "Status",
      dataType: MetadataDataType.STRING,
      validationRules: createValidationRules.string(50, [
        "Active",
        "Pending",
        "Completed",
      ]),
      orderIndex: 2,
    }),
    createMockColumn({
      id: "col4",
      name: "Is Confidential",
      dataType: MetadataDataType.BOOLEAN,
      orderIndex: 3,
    }),
  ];

  const documents = [
    {
      id: "doc1",
      title: "Contract A",
      metadata: {
        edges: [
          { node: createMockDatacell("col1", "doc1", "2024-01-01") },
          { node: createMockDatacell("col2", "doc1", 50000) },
          { node: createMockDatacell("col3", "doc1", "Active") },
          { node: createMockDatacell("col4", "doc1", false) },
        ],
      },
    },
    {
      id: "doc2",
      title: "Contract B",
      metadata: {
        edges: [
          { node: createMockDatacell("col1", "doc2", "2024-02-15") },
          { node: createMockDatacell("col2", "doc2", 75000) },
          { node: createMockDatacell("col3", "doc2", "Pending") },
          { node: createMockDatacell("col4", "doc2", true) },
        ],
      },
    },
  ];

  return { columns, documents };
};

// Factory for generating large datasets for performance testing
export const generateLargeDataset = (
  documentCount: number,
  columnCount: number
) => {
  const columns = Array.from({ length: columnCount }, (_, i) =>
    createMockColumn({
      id: `col${i}`,
      name: `Field ${i}`,
      dataType: i % 2 === 0 ? MetadataDataType.STRING : MetadataDataType.NUMBER,
      orderIndex: i,
    })
  );

  const documents = Array.from({ length: documentCount }, (_, docIndex) => ({
    id: `doc${docIndex}`,
    title: `Document ${docIndex}`,
    metadata: {
      edges: columns.map((col, colIndex) => ({
        node: createMockDatacell(
          col.id,
          `doc${docIndex}`,
          col.dataType === MetadataDataType.STRING
            ? `Value ${docIndex}-${colIndex}`
            : docIndex * 100 + colIndex
        ),
      })),
    },
  }));

  return { columns, documents };
};
