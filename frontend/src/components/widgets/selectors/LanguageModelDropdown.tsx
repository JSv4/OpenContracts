import React, { SyntheticEvent, useCallback, useEffect, useState } from "react";
import { useQuery, useReactiveVar } from "@apollo/client";
import { Dropdown, DropdownProps } from "semantic-ui-react";
import {
  GET_LANGUAGEMODELS,
  GetLanguageModelsOutputs,
} from "../../../graphql/queries";
import _ from "lodash";
import { FieldsetType, LanguageModelType } from "../../../graphql/types";

interface FieldsetOption {
  key: string;
  text: string;
  value: string;
}

interface LanguageModelDropdownProps {
  selectedLanguageModel: (lang: LanguageModelType | null) => void;
  selected_languagemodel: LanguageModelType | undefined;
}

export const LanguageModelDropdown = ({
  selectedLanguageModel,
  selected_languagemodel,
}: LanguageModelDropdownProps) => {
  const [searchQuery, setSearchQuery] = useState<string>();

  const { loading, error, data, refetch } = useQuery<GetLanguageModelsOutputs>(
    GET_LANGUAGEMODELS,
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

  const fieldsets = data?.languageModels.edges
    ? data.languageModels.edges.map((lang) => lang.node)
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
      selectedLanguageModel(selected as LanguageModelType);
    } else {
      selectedLanguageModel(null);
    }
  };

  const getDropdownOptions = (): FieldsetOption[] => {
    if (data && data.languageModels.edges) {
      return data.languageModels.edges
        .filter(({ node }) => node !== undefined)
        .map(({ node }) => ({
          key: node ? node.id : "",
          text: node?.model ? node.model : "",
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
      options={getDropdownOptions()}
      value={selected_languagemodel ? selected_languagemodel.id : undefined}
      placeholder="Select Language Model"
      onChange={handleSelectionChange}
      onSearchChange={handleSearchChange}
      loading={loading}
      style={{ minWidth: "50vw important!" }}
    />
  );
};
