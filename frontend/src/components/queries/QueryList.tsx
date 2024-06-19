import { Table, Dimmer, Loader } from "semantic-ui-react";
import { FetchMoreOnVisible } from "../../components/widgets/infinite_scroll/FetchMoreOnVisible";
import { CorpusQueryType, ExtractType, PageInfo } from "../../graphql/types";
import { CorpusQueryListItem } from "./CorpusQueryListItem";

interface QueryListProps {
  items: CorpusQueryType[] | undefined;
  pageInfo: PageInfo | undefined;
  loading: boolean;
  style?: Record<string, any>;
  fetchMore: (args?: any) => void | any;
  onDelete: (args?: any) => void | any;
  onSelectRow?: (item: CorpusQueryType) => void;
}

export function QueryList({
  items,
  pageInfo,
  loading,
  style,
  fetchMore,
  onDelete,
  onSelectRow,
}: QueryListProps) {
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
        <CorpusQueryListItem
          key={item.id}
          onDelete={() => onDelete(item.id)}
          {...(onSelectRow ? { onSelect: () => onSelectRow(item) } : {})}
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
          <Loader content="Loading Queries..." />
        </Dimmer>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell textAlign="left">Query</Table.HeaderCell>
            <Table.HeaderCell textAlign="center">Response</Table.HeaderCell>
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
