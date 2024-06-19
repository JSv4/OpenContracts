import { useMutation } from "@apollo/client";
import React from "react";
import {
  Button,
  Container,
  Header,
  Icon,
  Image,
  Input,
} from "semantic-ui-react";
import {
  ASK_QUERY_OF_CORPUS,
  AskQueryOfCorpusInputType,
  AskQueryOfCorpusOutputType,
} from "../../graphql/mutations";
import { toast } from "react-toastify";
import { openedQueryObj } from "../../graphql/cache";

interface NewQuerySearchProps {
  corpus_id: string;
}

export const NewQuerySearch: React.FC<NewQuerySearchProps> = ({
  corpus_id,
}) => {
  const [query, setQuery] = React.useState("");

  const [sendQuery] = useMutation<
    AskQueryOfCorpusOutputType,
    AskQueryOfCorpusInputType
  >(ASK_QUERY_OF_CORPUS, {
    onCompleted: (data) => {
      toast.success("SUCCESS! Question Submitted.");
      openedQueryObj(data.askQuery.obj);
    },
    onError: (err) => {
      toast.error("ERROR! Failed submitting question.");
    },
  });

  const handleSubmit = () => {
    sendQuery({
      variables: {
        corpusId: corpus_id,
        query,
      },
    });
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
          <Icon name="search" size="huge" />
          <Header as="h2" style={{ marginLeft: "1rem" }}>
            Corpus Query
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
          <Button icon="search" onClick={() => handleSubmit()}>
            Search
          </Button>
        </div>
      </Container>
    </div>
  );
};
