import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dropdown, DropdownProps, Header } from "semantic-ui-react";
import { useQuery } from "@apollo/client";
import _ from "lodash";
import {
  GET_REGISTERED_EXTRACT_TASKS,
  GetRegisteredExtractTasksOutput,
} from "../../../graphql/queries";

interface ExtractTaskDropdownProps {
  read_only?: boolean;
  taskName?: string | undefined;
  style?: React.CSSProperties;
  onChange?: (taskName: string | null) => void;
}

export const ExtractTaskDropdown: React.FC<ExtractTaskDropdownProps> = ({
  read_only,
  style,
  onChange,
  taskName,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>();

  const { loading, error, data, refetch } =
    useQuery<GetRegisteredExtractTasksOutput>(GET_REGISTERED_EXTRACT_TASKS, {
      fetchPolicy: "network-only",
      notifyOnNetworkStatusChange: true,
    });

  useEffect(() => {
    refetch();
  }, [searchQuery]);

  const tasks = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.registeredExtractTasks).map(
      ([name, description]) => ({
        name,
        description: description as string,
      })
    );
  }, [data]);

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
    event: React.SyntheticEvent<HTMLElement>,
    data: DropdownProps
  ) => {
    if (onChange) {
      const selected = _.find(tasks, { name: data.value as string });
      onChange(selected ? selected.name : null);
    }
  };

  const getDropdownOptions = () => {
    return tasks.map((task) => ({
      key: task.name,
      text: task.name,
      value: task.name,
      content: <Header content={task.name} subheader={task.description} />,
    }));
  };

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <Dropdown
      fluid
      selection
      search
      disabled={read_only}
      options={getDropdownOptions()}
      value={taskName}
      placeholder="Select a task"
      onChange={read_only ? () => {} : handleSelectionChange}
      onSearchChange={handleSearchChange}
      loading={loading}
      style={{ ...style, minWidth: "50vw" }}
    />
  );
};
