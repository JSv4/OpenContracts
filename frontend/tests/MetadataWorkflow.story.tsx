import React from "react";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { Provider as JotaiProvider } from "jotai";
import { InMemoryCache } from "@apollo/client";
import { relayStylePagination } from "@apollo/client/utilities";
import { authStatusVar } from "../src/graphql/cache";

// Create test cache
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          corpuses: relayStylePagination(),
          columns: relayStylePagination(),
          documents: relayStylePagination(),
        },
      },
      CorpusType: { keyFields: ["id"] },
      ColumnType: { keyFields: ["id"] },
      DatacellType: { keyFields: ["id"] },
      DocumentType: { keyFields: ["id"] },
    },
  });

// Export the wrapper as a story component
export const FullAppWrapper: React.FC<{
  children: React.ReactNode;
  mocks: any[];
  initialPath?: string;
}> = ({ children, mocks, initialPath = "/corpuses" }) => {
  React.useEffect(() => {
    authStatusVar("ANONYMOUS");
  }, []);

  return (
    <JotaiProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <MockedProvider mocks={mocks} cache={createTestCache()} addTypename>
          {children}
        </MockedProvider>
      </MemoryRouter>
    </JotaiProvider>
  );
};

// Simple test component for metadata filtering
export const FilterTestComponent = () => {
  const [filter, setFilter] = React.useState("");
  const documentsWithMetadata = [
    { id: "doc1", title: "Active Project A", status: "Active" },
    { id: "doc2", title: "Completed Project B", status: "Completed" },
    { id: "doc3", title: "Active Project C", status: "Active" },
  ];

  const filteredDocs = filter
    ? documentsWithMetadata.filter((doc) => doc.status === filter)
    : documentsWithMetadata;

  return (
    <div data-testid="corpus-documents">
      <button data-testid="filter-button">Filter</button>
      <select
        data-testid="status-filter"
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="">All</option>
        <option value="Active">Active</option>
        <option value="Completed">Completed</option>
      </select>
      <div data-testid="document-list">
        {filteredDocs.map((doc) => (
          <div key={doc.id} data-testid="document-card">
            {doc.title}
          </div>
        ))}
      </div>
    </div>
  );
};

// Simple test component for bulk editing
export const BulkEditTestComponent = () => {
  const [selectedDocs, setSelectedDocs] = React.useState<Set<string>>(
    new Set()
  );
  const [cellValues, setCellValues] = React.useState<{ [key: string]: string }>(
    {
      doc1: "—",
      doc2: "—",
      doc3: "—",
    }
  );
  const [showModal, setShowModal] = React.useState(false);
  const [bulkValue, setBulkValue] = React.useState("");

  const documents = [
    { id: "doc1", title: "Document 1" },
    { id: "doc2", title: "Document 2" },
    { id: "doc3", title: "Document 3" },
  ];

  const handleBulkApply = () => {
    const newValues = { ...cellValues };
    selectedDocs.forEach((docId) => {
      newValues[docId] = bulkValue;
    });
    setCellValues(newValues);
    setShowModal(false);
  };

  return (
    <div data-testid="metadata-grid">
      <table>
        <thead>
          <tr>
            <th>
              <input type="checkbox" data-testid="select-all" />
            </th>
            <th>Document</th>
            <th>Department</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                <input
                  type="checkbox"
                  data-testid={`select-${doc.id}`}
                  onChange={(e) => {
                    const newSelected = new Set(selectedDocs);
                    if (e.target.checked) {
                      newSelected.add(doc.id);
                    } else {
                      newSelected.delete(doc.id);
                    }
                    setSelectedDocs(newSelected);
                  }}
                />
              </td>
              <td>{doc.title}</td>
              <td data-testid={`cell-${doc.id}`}>{cellValues[doc.id]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button data-testid="bulk-edit" onClick={() => setShowModal(true)}>
        Bulk Edit
      </button>
      {showModal && (
        <div data-testid="bulk-edit-modal">
          <input
            data-testid="bulk-value"
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
          />
          <button data-testid="apply-bulk" onClick={handleBulkApply}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
};
