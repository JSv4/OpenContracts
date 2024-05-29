import React, { SyntheticEvent, useCallback, useEffect, useState } from "react";
import { useQuery, useReactiveVar } from "@apollo/client";
import { Dropdown, DropdownProps } from "semantic-ui-react";
import {
  GET_CORPUSES,
  GetCorpusesInputs,
  GetCorpusesOutputs,
} from "../../../graphql/queries";
import { selectedCorpus } from "../../../graphql/cache";
import _ from "lodash";
import { CorpusType } from "../../../graphql/types";

interface CorpusOption {
  key: string;
  text: string;
  value: string;
}

export const CorpusDropdown: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>();
  const selected_corpus = useReactiveVar(selectedCorpus);

  const { loading, error, data, refetch } = useQuery<
    GetCorpusesOutputs,
    GetCorpusesInputs
  >(GET_CORPUSES, {
    variables: searchQuery
      ? {
          textSearch: searchQuery,
        }
      : {},
  });

  // If the searchQuery changes... refetch corpuses.
  useEffect(() => {
    refetch({ textSearch: searchQuery });
  }, [searchQuery]);

  const corpuses = data?.corpuses.edges
    ? data.corpuses.edges.map((edge) => edge.node)
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
    const selected = _.find(corpuses, { id: data.value });
    if (selected) {
      selectedCorpus(selected as CorpusType);
    } else {
      selectedCorpus(null);
    }
  };

  const getDropdownOptions = (): CorpusOption[] => {
    if (data && data.corpuses.edges) {
      return data.corpuses.edges
        .filter(({ node }) => node !== undefined)
        .map(({ node }) => ({
          key: node ? node.id : "",
          text: node?.title ? node.title : "",
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
      value={selected_corpus ? selected_corpus.id : undefined}
      placeholder="Select Corpus"
      onChange={handleSelectionChange}
      onSearchChange={handleSearchChange}
      loading={loading}
    />
  );
};
