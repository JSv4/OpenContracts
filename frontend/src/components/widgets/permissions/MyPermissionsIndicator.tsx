import { Statistic, Icon } from "semantic-ui-react";
import { getPermissions } from "../../../utils/transform";
import { PermissionTypes } from "../../types";

export const MyPermissionsIndicator = ({
  myPermissions,
  isPublic,
}: {
  myPermissions: string[] | undefined;
  isPublic: boolean | undefined;
}) => {
  const perms = getPermissions(myPermissions);
  let stats: React.ReactNode[] = [];

  if (isPublic) {
    stats.push(
      <Statistic key={`stat_${stats.length}`}>
        <Statistic.Value>
          <Icon name="external share" color="green" />
        </Statistic.Value>
        <Statistic.Label>Public</Statistic.Label>
      </Statistic>
    );
  } else {
    stats.push(
      <Statistic key={`stat_${stats.length}`}>
        <Statistic.Value>
          <Icon name="privacy" color="brown" />
        </Statistic.Value>
        <Statistic.Label>Private</Statistic.Label>
      </Statistic>
    );
  }

  if (perms.includes(PermissionTypes.CAN_UPDATE)) {
    stats.push(
      <Statistic key={`stat_${stats.length}`}>
        <Statistic.Value>
          <Icon name="write" color="green" />
        </Statistic.Value>
        <Statistic.Label>Can Edit</Statistic.Label>
      </Statistic>
    );
  } else {
    stats.push(
      <Statistic key={`stat_${stats.length}`}>
        <Statistic.Value>
          <Icon name="lock" color="red" />
        </Statistic.Value>
        <Statistic.Label>Read Only</Statistic.Label>
      </Statistic>
    );
  }

  return <>{stats}</>;
};
