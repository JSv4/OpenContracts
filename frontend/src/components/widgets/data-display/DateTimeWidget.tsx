import { Statistic } from "semantic-ui-react";

export function DateTimeWidget({
  timeString,
  dateString,
}: {
  timeString: string;
  dateString: string;
}) {
  return (
    <Statistic size="mini">
      <Statistic.Value>{timeString}</Statistic.Value>
      <Statistic.Label>{dateString}</Statistic.Label>
    </Statistic>
  );
}
