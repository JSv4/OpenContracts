import React from "react";
import { List } from "semantic-ui-react";
import { useQuery } from "@apollo/client";

import { FieldsetDetails } from "./FieldsetDetails";
import { FieldsetType } from "../graphql/types";
import { REQUEST_GET_FIELDSETS } from "../graphql/queries";

export const FieldsetsList: React.FC = () => {
  const { data, refetch } = useQuery<{ fieldsets: FieldsetType[] }>(
    REQUEST_GET_FIELDSETS
  );

  return (
    <List divided relaxed>
      {data?.fieldsets.map((fieldset) => (
        <List.Item key={fieldset.id}>
          <FieldsetDetails fieldset={fieldset} onSave={refetch} />
        </List.Item>
      ))}
    </List>
  );
};
