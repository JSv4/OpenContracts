import React, { useState } from "react";
import { useQuery } from "@apollo/client";
import {
  Segment,
  Header,
  Grid,
  Statistic,
  Dropdown,
  Container,
} from "semantic-ui-react";
import { GET_DASHBOARD_STATISTICS } from "../graphql/queries";

// Define the type for our statistics
interface Statistics {
  corpuses: number;
  documents: number;
  extractors: number;
  annotations: number;
}

// Define the type for dropdown options
interface DropdownOption {
  label: string;
  onClick: () => void;
}

// Define the type for our dropdown mappings
type DropdownMappings = {
  [key: string]: DropdownOption[];
};

export const Dashboard: React.FC = () => {
  const { loading, error, data } = useQuery<{ statistics: Statistics }>(
    GET_DASHBOARD_STATISTICS
  );
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :</p>;

  const stats = data?.statistics;

  // Define the dropdown mappings
  const dropdownMappings: DropdownMappings = {
    corpuses: [
      {
        label: "View Corpuses",
        onClick: () => console.log("Viewing Corpuses"),
      },
      { label: "Add Corpus", onClick: () => console.log("Adding Corpus") },
      {
        label: "Manage Corpuses",
        onClick: () => console.log("Managing Corpuses"),
      },
    ],
    documents: [
      {
        label: "View Documents",
        onClick: () => console.log("Viewing Documents"),
      },
      { label: "Add Document", onClick: () => console.log("Adding Document") },
      {
        label: "Search Documents",
        onClick: () => console.log("Searching Documents"),
      },
    ],
    extractors: [
      {
        label: "View Extractors",
        onClick: () => console.log("Viewing Extractors"),
      },
      {
        label: "Add Extractor",
        onClick: () => console.log("Adding Extractor"),
      },
      {
        label: "Run Extractor",
        onClick: () => console.log("Running Extractor"),
      },
    ],
    annotations: [
      {
        label: "View Annotations",
        onClick: () => console.log("Viewing Annotations"),
      },
      {
        label: "Add Annotation",
        onClick: () => console.log("Adding Annotation"),
      },
      {
        label: "Export Annotations",
        onClick: () => console.log("Exporting Annotations"),
      },
    ],
  };

  const handleStatisticClick = (key: string) => {
    setOpenDropdown(openDropdown === key ? null : key);
  };

  return (
    <Container style={{ marginTop: "2em" }}>
      <Segment
        style={{
          backgroundColor: "#FFF0F5", // Light pink background
          padding: "2em",
          borderRadius: "15px",
        }}
      >
        <Header as="h2" textAlign="center" style={{ color: "#8B4B8B" }}>
          Statistics Dashboard
        </Header>
        <Grid columns={4} stackable textAlign="center">
          <Grid.Row>
            {stats &&
              Object.entries(stats).map(([key, value]) => (
                <Grid.Column key={key}>
                  <Segment
                    raised
                    style={{
                      backgroundColor: "#F8E0F7", // Lighter purple
                      borderColor: "#D8BFD8", // Light purple border
                      cursor: "pointer",
                    }}
                    onClick={() => handleStatisticClick(key)}
                  >
                    <Statistic>
                      <Statistic.Value>{value}</Statistic.Value>
                      <Statistic.Label style={{ color: "#8B4B8B" }}>
                        {key}
                      </Statistic.Label>
                    </Statistic>
                    <Dropdown
                      open={openDropdown === key}
                      onClose={() => setOpenDropdown(null)}
                      style={{ marginTop: "1em" }}
                    >
                      <Dropdown.Menu>
                        {dropdownMappings[key].map((option, index) => (
                          <Dropdown.Item
                            key={index}
                            text={option.label}
                            onClick={option.onClick}
                          />
                        ))}
                      </Dropdown.Menu>
                    </Dropdown>
                  </Segment>
                </Grid.Column>
              ))}
          </Grid.Row>
        </Grid>
      </Segment>
    </Container>
  );
};
