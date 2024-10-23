import { Table, Dimmer, Loader } from "semantic-ui-react";
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

  let export_rows = items
    ? items.map((item) => (
        <ExportItemRow key={item.id} onDelete={onDelete} item={item} />
      ))
    : [];

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        overflowY: "auto",
      }}
    >
      <Table
        celled
        padded
        style={{ minHeight: "20vh", ...(style ? style : {}) }}
      >
        <Dimmer active={loading}>
          <Loader content="Loading Exports..." />
        </Dimmer>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell textAlign="left">Description</Table.HeaderCell>
            <Table.HeaderCell textAlign="center">Requested</Table.HeaderCell>
            <Table.HeaderCell textAlign="center">Started</Table.HeaderCell>
            <Table.HeaderCell textAlign="center">Completed</Table.HeaderCell>
            <Table.HeaderCell textAlign="center">Actions</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>{export_rows}</Table.Body>
        <FetchMoreOnVisible fetchNextPage={handleUpdate} />
      </Table>
    </div>
  );
}
