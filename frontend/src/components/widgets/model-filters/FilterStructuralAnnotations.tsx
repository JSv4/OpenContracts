import { useReactiveVar } from "@apollo/client";
import { Dropdown, Menu, Label, DropdownItemProps } from "semantic-ui-react";
import { filterToStructuralAnnotations } from "../../../graphql/cache";

interface FilterToStructuralAnnotationsSelectorProps {
  style?: Record<string, any>;
}

export const FilterToStructuralAnnotationsSelector = ({
  style,
}: FilterToStructuralAnnotationsSelectorProps) => {
  // Get the current value of the reactive variable
  const structural_filter = useReactiveVar(filterToStructuralAnnotations);

  // Options for the dropdown
  const structuralOptions: DropdownItemProps[] = [
    { key: "ONLY", text: "Only Structural", value: "ONLY" },
    { key: "EXCLUDE", text: "Exclude Structural", value: "EXCLUDE" },
    { key: "INCLUDE", text: "Include Structural", value: "INCLUDE" },
  ];

  return (
    <Menu
      style={{
        padding: "0px",
        margin: "0px",
        marginRight: ".25rem",
      }}
    >
      <Label
        style={{
          marginRight: "0px",
          borderRadius: "5px 0px 0px 5px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div>Filter Structural Annotations:</div>
      </Label>
      <Dropdown
        fluid
        selection
        options={structuralOptions}
        onChange={(e, { value }) => {
          // Update the reactive variable when a selection is made
          if (value !== undefined) {
            filterToStructuralAnnotations(
              value as "ONLY" | "INCLUDE" | "EXCLUDE" | undefined
            );
          }
        }}
        placeholder="Filter by Structural Annotations..."
        value={structural_filter}
        style={{
          margin: "0px",
          width: "15rem",
          ...style,
        }}
      />
    </Menu>
  );
};
