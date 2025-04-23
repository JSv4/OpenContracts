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
import { CorpusType } from "../../../types/graphql-api";

interface CorpusOption {
  key: string;
  text: string;
  value: string;
}

/**
 * Props for the CorpusDropdown component.
 */
interface CorpusDropdownProps {
  /** Optional controlled value (corpus ID). */
  value?: string | null;
  /** Optional callback when the selection changes. If provided, the global state is not updated. */
  onChange?: (corpus: CorpusType | null) => void;
  /** Optional flag to allow clearing the selection. Defaults to true. */
  clearable?: boolean;
  /** Optional placeholder text. */
  placeholder?: string;
  /** Optional flag for fluid width. Defaults to true. */
  fluid?: boolean;
}

export const CorpusDropdown: React.FC<CorpusDropdownProps> = ({
  value,
  onChange,
  clearable = true,
  placeholder = "Select Corpus",
  fluid = true,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>();
  // Use global selectedCorpus only if the component is not controlled
  const global_selected_corpus = useReactiveVar(selectedCorpus);

  const { loading, error, data, refetch } = useQuery<
    GetCorpusesOutputs,
    GetCorpusesInputs
  >(GET_CORPUSES, {
    variables: searchQuery
      ? {
          textSearch: searchQuery,
        }
      : {},
    fetchPolicy: "cache-and-network", // Ensure fresh data but use cache initially
  });

  // Refetch when search query changes
  useEffect(() => {
    // Debounce refetching on search query change if needed, but direct refetch is often fine here
    refetch({ textSearch: searchQuery });
  }, [searchQuery, refetch]);

  const corpuses = data?.corpuses.edges
    ? data.corpuses.edges
        .map((edge) => edge.node)
        .filter((c): c is CorpusType => !!c) // Ensure nodes are not null/undefined and type guard
    : [];

  const debouncedSetSearchQuery = useCallback(
    _.debounce((query: string) => {
      setSearchQuery(query);
    }, 300), // Slightly shorter debounce
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
    const selected = _.find(corpuses, { id: data.value as string });
    const resultCorpus = selected ? (selected as CorpusType) : null;

    // If onChange prop is provided, use it (controlled component behavior)
    if (onChange) {
      onChange(resultCorpus);
    } else {
      // Otherwise, update the global reactive variable (uncontrolled behavior)
      selectedCorpus(resultCorpus);
    }
  };

  const getDropdownOptions = (): CorpusOption[] => {
    return corpuses.map((node) => ({
      key: node.id,
      text: node.title ?? "Untitled Corpus", // Provide fallback for potentially null/undefined title
      value: node.id,
    }));
  };

  // Determine the value to display: controlled value first, then global state
  const displayValue =
    value !== undefined ? value : global_selected_corpus?.id ?? undefined;

  if (error) {
    // Consider a more user-friendly error display, maybe a disabled dropdown with an error message
    console.error("Error loading corpuses:", error);
    return <Dropdown placeholder="Error loading corpuses" disabled error />;
  }

  return (
    <Dropdown
      fluid={fluid}
      selection
      search
      clearable={clearable}
      options={getDropdownOptions()}
      value={displayValue === null ? undefined : displayValue}
      placeholder={placeholder}
      onChange={handleSelectionChange}
      onSearchChange={handleSearchChange}
      loading={loading}
      selectOnNavigation={false} // Prevents closing dropdown on search result navigation
    />
  );
};
