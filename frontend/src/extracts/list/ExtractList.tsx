import { Table, Dimmer, Loader } from "semantic-ui-react";
import { ExtractItemRow } from "./ExtractListItem";
import { FetchMoreOnVisible } from "../../components/widgets/infinite_scroll/FetchMoreOnVisible";
import { ExtractType, PageInfo } from "../../graphql/types";

interface ExtractListProps {
  items: ExtractType[] | undefined;
  pageInfo: PageInfo | undefined;
  loading: boolean;
  style?: Record<string, any>;
  fetchMore: (args?: any) => void | any;
  onDelete: (args?: any) => void | any;
}

export function ExtractList({
  items,
  pageInfo,
  loading,
  style,
  fetchMore,
  onDelete,
}: ExtractListProps) {
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

  let extract_rows = items
    ? items.map((item) => (
        <ExtractItemRow
          key={item.id}
          onDelete={() => onDelete(item.id)}
          item={item}
        />
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
          <Loader content="Loading Extracts..." />
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
        <Table.Body>{extract_rows}</Table.Body>
        <FetchMoreOnVisible fetchNextPage={handleUpdate} />
      </Table>
    </div>
  );
}
