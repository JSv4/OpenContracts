import { Table, Icon, Button } from "semantic-ui-react";
import { ExtractType } from "../../graphql/types";
import { DateTimeWidget } from "../../components/widgets/data-display/DateTimeWidget";

interface ExtractItemRowProps {
  style?: Record<string, any>;
  item: ExtractType;
  key: string;
  onDelete: (args?: any) => void | any;
}

export function ExtractItemRow({ onDelete, item, key }: ExtractItemRowProps) {
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
    <Table.Row key={key}>
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
            icon="trash"
            color="red"
            onClick={onDelete}
          />
          <Button circular size="mini" icon="pencil" color="blue" />
        </div>
      </Table.Cell>
    </Table.Row>
  );
}
