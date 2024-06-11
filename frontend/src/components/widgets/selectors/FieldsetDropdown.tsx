import React, { SyntheticEvent, useCallback, useEffect, useState } from "react";
import { useQuery, useReactiveVar } from "@apollo/client";
import { Dropdown, DropdownProps } from "semantic-ui-react";
import {
  REQUEST_GET_FIELDSETS,
  GetFieldsetsOutputs,
} from "../../../graphql/queries";
import { selectedFieldset } from "../../../graphql/cache";
import _ from "lodash";
import { FieldsetType } from "../../../graphql/types";

interface FieldsetOption {
  key: string;
  text: string;
  value: string;
}

export const FieldsetDropdown: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>();
  const selected_fieldset = useReactiveVar(selectedFieldset);

  const { loading, error, data, refetch } = useQuery<GetFieldsetsOutputs>(
    REQUEST_GET_FIELDSETS,
    {
      variables: searchQuery
        ? {
            searchText: searchQuery,
          }
        : {},
      fetchPolicy: "network-only",
      notifyOnNetworkStatusChange: true,
    }
  );

  // If the searchQuery changes... refetch fieldsets.
  useEffect(() => {
    refetch();
  }, [searchQuery]);

  const fieldsets = data?.fieldsets.edges
    ? data.fieldsets.edges.map((edge) => edge.node)
    : [];

  const debouncedSetSearchQuery = useCallback(
    _.debounce((query: string) => {
      setSearchQuery(query);
    }, 500),
    []
  );

  const handleSearchChange = (
    event: React.SyntheticEvent<HTMLElement>,
    { searchQuery }: { searchQuery: string }
  ) => {
    debouncedSetSearchQuery(searchQuery);
  };

  const handleSelectionChange = (
    event: SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => {
    const selected = _.find(fieldsets, { id: data.value });
    if (selected) {
      selectedFieldset(selected as FieldsetType);
    } else {
      selectedFieldset(null);
    }
  };

  const getDropdownOptions = (): FieldsetOption[] => {
    if (data && data.fieldsets.edges) {
      return data.fieldsets.edges
        .filter(({ node }) => node !== undefined)
        .map(({ node }) => ({
          key: node ? node.id : "",
          text: node?.name ? node.name : "",
          value: node ? node.id : "",
        }));
    }
    return [];
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <Dropdown
      fluid
      selection
      search
      clearable
      options={getDropdownOptions()}
      value={selected_fieldset ? selected_fieldset.id : undefined}
      placeholder="Select Fieldset"
      onChange={handleSelectionChange}
      onSearchChange={handleSearchChange}
      loading={loading}
      style={{ minWidth: "50vw important!" }}
    />
  );
};
