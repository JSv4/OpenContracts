import { Table, Icon, Button } from "semantic-ui-react";
import { CorpusQueryType, ExportObject } from "../../graphql/types";
import { DateTimeWidget } from "../widgets/data-display/DateTimeWidget";
import { openedQueryObj } from "../../graphql/cache";

interface CorpusQueryListItemProps {
  style?: Record<string, any>;
  item: CorpusQueryType;
  key: string;
  onDelete: (args?: any) => void | any;
}

export function CorpusQueryListItem({
  onDelete,
  item,
  key,
}: CorpusQueryListItemProps) {
  let requestedTime = "";
  let requestedDate = "N/A";

  let startedTime = "";
  let startedDate = "N/A";
  if (item.started) {
    var dStart = new Date(item.started);
    startedTime = dStart.toLocaleTimeString();
    startedDate = dStart.toLocaleDateString();
  }

  let completedTime = "";
  let completedDate = "N/A";
  if (item.completed) {
    var dCompleted = new Date(item.completed);
    completedTime = dCompleted.toLocaleTimeString();
    completedDate = dCompleted.toLocaleDateString();
  }

  return (
    <Table.Row key={key} style={{ maxHeight: "10vh" }}>
      <Table.Cell>{item.query}</Table.Cell>
      <Table.Cell>{item.response}</Table.Cell>
      <Table.Cell textAlign="center">
        {!item.started ? (
          <Icon size="large" loading name="cog" />
        ) : (
          <DateTimeWidget timeString={startedTime} dateString={startedDate} />
        )}
      </Table.Cell>
      <Table.Cell textAlign="center">
        {!item.completed || !item.started ? (
          <Icon size="large" loading name="cog" />
        ) : (
          <DateTimeWidget
            timeString={completedTime}
            dateString={completedDate}
          />
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
          <Button
            circular
            size="mini"
            icon="eye"
            color="blue"
            onClick={() => openedQueryObj(item)}
          />
          {item.completed ? (
            <Button
              circular
              size="mini"
              icon="download"
              color="blue"
              onClick={() => {
                console.log("Do stuff");
              }}
            />
          ) : (
            <></>
          )}
        </div>
      </Table.Cell>
    </Table.Row>
  );
}
