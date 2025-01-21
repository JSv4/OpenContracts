import { Dimmer, Loader } from "semantic-ui-react";
import { ExportObject } from "../../types/graphql-api";
import { PageInfo } from "../../types/graphql-api";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import { ExportItemRow } from "./ExportItemRow";

interface ExportListProps {
  items: ExportObject[] | undefined;
  pageInfo: PageInfo | undefined;
  loading: boolean;
  style?: Record<string, any>;
  fetchMore: (args?: any) => void | any;
  onDelete: (args?: any) => void | any;
}

const styles = {
  container: {
    flex: 1,
    width: "100%",
    overflowY: "auto" as const,
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow:
      "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    minHeight: "20vh",
  },
  header: {
    backgroundColor: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
  },
  headerCell: {
    padding: "1rem",
    fontWeight: 600,
    color: "#1a202c",
    textAlign: "left" as const,
  },
  body: {
    backgroundColor: "#ffffff",
  },
};

export function ExportList({
  items,
  pageInfo,
  loading,
  style,
  fetchMore,
  onDelete,
}: ExportListProps) {
  const handleUpdate = () => {
    if (!loading && pageInfo?.hasNextPage) {
      fetchMore({
        variables: {
          limit: 20,
          cursor: pageInfo.endCursor,
        },
      });
    }
  };

  const export_rows = items
    ? items.map((item) => (
        <ExportItemRow key={item.id} onDelete={onDelete} item={item} />
      ))
    : [];

  return (
    <div style={{ ...styles.container, ...(style || {}) }}>
      <Dimmer active={loading}>
        <Loader content="Loading Exports..." />
      </Dimmer>

      <table style={styles.table}>
        <thead style={styles.header}>
          <tr>
            <th style={styles.headerCell}>Description</th>
            <th style={{ ...styles.headerCell, textAlign: "center" }}>
              Requested
            </th>
            <th style={{ ...styles.headerCell, textAlign: "center" }}>
              Started
            </th>
            <th style={{ ...styles.headerCell, textAlign: "center" }}>
              Completed
            </th>
            <th style={{ ...styles.headerCell, textAlign: "center" }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody style={styles.body}>{export_rows}</tbody>
      </table>

      <FetchMoreOnVisible fetchNextPage={handleUpdate} />
    </div>
  );
}
