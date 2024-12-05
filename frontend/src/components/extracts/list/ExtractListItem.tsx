import { Table, Icon, Button } from "semantic-ui-react";
import { ExtractType } from "../../../types/graphql-api";
import { DateTimeWidget } from "../../widgets/data-display/DateTimeWidget";

interface ExtractItemRowProps {
  style?: Record<string, any>;
  item: ExtractType;
  onDelete: (args?: any) => void | any;
  onSelect?: (item: ExtractType) => void;
}

export function ExtractItemRow({
  onSelect,
  onDelete,
  item,
}: ExtractItemRowProps) {
  let createdTime = "";
  let createdDate = "N/A";
  if (item.created) {
    var dCreate = new Date(item.created);
    createdTime = dCreate.toLocaleTimeString();
    createdDate = dCreate.toLocaleDateString();
  }

  let startedTime = "";
  let startedDate = "N/A";
  if (item.started) {
    var dStart = new Date(item.started);
    startedTime = dStart.toLocaleTimeString();
    startedDate = dStart.toLocaleDateString();
  }

  let finishedTime = "";
  let finishedDate = "N/A";
  if (item.finished) {
    var dCompleted = new Date(item.finished);
    finishedTime = dCompleted.toLocaleTimeString();
    finishedDate = dCompleted.toLocaleDateString();
  }

  return (
    <Table.Row key={item.id}>
      <Table.Cell>{item.name}</Table.Cell>
      <Table.Cell>
        <DateTimeWidget timeString={createdTime} dateString={createdDate} />
      </Table.Cell>
      <Table.Cell textAlign="center">
        {!item.started ? (
          <Icon size="large" loading name="cog" />
        ) : (
          <DateTimeWidget timeString={startedTime} dateString={startedDate} />
        )}
      </Table.Cell>
      <Table.Cell textAlign="center">
        {!item.finished || !item.started ? (
          <Icon size="large" loading name="cog" />
        ) : (
          <DateTimeWidget timeString={finishedTime} dateString={finishedDate} />
        )}
      </Table.Cell>
      <Table.Cell textAlign="center">
        <div>
          <Button
            circular
            size="mini"
            icon="eye"
            color="grey"
            {...(onSelect ? { onClick: () => onSelect(item) } : {})}
          />
          <Button
            circular
            size="mini"
            icon="trash"
            color="red"
            onClick={onDelete}
          />
        </div>
      </Table.Cell>
    </Table.Row>
  );
}
