import React from "react";
import { Button, Container, Header, Image, Input } from "semantic-ui-react";

interface NewQuerySearchProps {
  corpus_id: string;
}

export const NewQuerySearch: React.FC<NewQuerySearchProps> = ({
  corpus_id,
}) => {
  const [query, setQuery] = React.useState("");

  const handleSubmit = () => {
    console.log("Create query for corpus", corpus_id);
  };

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        overflowY: "auto",
        minHeight: "40vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignContent: "center",
      }}
    >
      <Container textAlign="center">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1rem",
          }}
        >
          <Image src="path/to/your/logo.png" size="small" />
          <Header as="h2" style={{ marginLeft: "1rem" }}>
            Agentic Query
            <Header.Subheader>Query your document collection</Header.Subheader>
          </Header>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          <Input
            placeholder="Enter your query here"
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e: { key: string }) => {
              if (e.key === "Enter") {
                handleSubmit();
              }
            }}
            style={{ width: "400px" }}
          />
          <Button icon="search">Search</Button>
        </div>
      </Container>
    </div>
  );
};
