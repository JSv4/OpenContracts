import React, { useEffect, useState } from "react";
import {
  Grid,
  Card,
  List,
  Header,
  Segment,
  Placeholder,
  Loader,
} from "semantic-ui-react";
import ReactMarkdown from "react-markdown";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CorpusQueryType, ServerAnnotationType } from "../../graphql/types";
import {
  displayAnnotationOnAnnotatorLoad,
  openedDocument,
  selectedAnnotation,
} from "../../graphql/cache";

interface QueryResultsViewerProps {
  query_obj: CorpusQueryType;
}

const QueryResultsViewer: React.FC<QueryResultsViewerProps> = ({
  query_obj,
}) => {
  console.log("View query results", query_obj);

  const [viewSourceAnnotation, setViewSourceAnnotation] =
    useState<ServerAnnotationType | null>(null);

  useEffect(() => {
    if (viewSourceAnnotation) {
      // console.log(`Annotation Card Selected for Id ${targetAnnotation.selected_annotation.id}`);
      displayAnnotationOnAnnotatorLoad(viewSourceAnnotation);
      selectedAnnotation(viewSourceAnnotation);
      openedDocument(viewSourceAnnotation.document);
      setViewSourceAnnotation(null);

      // This is being done in the AnnotationCards for standalone annotations... but I don't think we want that.
      // if (location.pathname !== "/") {
      //   navigate("/");
      // }
    }
  }, [viewSourceAnnotation]);

  if (!query_obj.started) {
    return (
      <Grid columns={2}>
        <Grid.Column width={4}>
          <Card fluid>
            <Card.Content>
              <Placeholder>
                <Placeholder.Header>
                  <Placeholder.Line />
                </Placeholder.Header>
                <Placeholder.Paragraph>
                  <Placeholder.Line />
                  <Placeholder.Line />
                  <Placeholder.Line />
                </Placeholder.Paragraph>
              </Placeholder>
            </Card.Content>
          </Card>
        </Grid.Column>
        <Grid.Column width={12}>
          <Segment>
            <Header as="h3">Waiting for next available agent...</Header>
          </Segment>
        </Grid.Column>
      </Grid>
    );
  }

  if (query_obj.started && !query_obj.completed && !query_obj.failed) {
    return (
      <Grid columns={2}>
        <Grid.Column width={4}>
          <Card fluid>
            <Card.Content>
              <Placeholder>
                <Placeholder.Header>
                  <Placeholder.Line />
                </Placeholder.Header>
                <Placeholder.Paragraph>
                  <Placeholder.Line />
                  <Placeholder.Line />
                  <Placeholder.Line />
                </Placeholder.Paragraph>
              </Placeholder>
            </Card.Content>
          </Card>
        </Grid.Column>
        <Grid.Column width={12}>
          <Segment>
            <Loader active inline="centered">
              Query is processing...
            </Loader>
          </Segment>
        </Grid.Column>
      </Grid>
    );
  }

  if (query_obj.failed) {
    return (
      <Grid columns={2}>
        <Grid.Column width={4}>
          <Card fluid>
            <Card.Content>
              <Card.Header>Annotations</Card.Header>
            </Card.Content>
            <Card.Content>
              <List divided relaxed>
                {query_obj.fullSourceList.map((annotation) => (
                  <List.Item
                    key={annotation.id}
                    onClick={() => setViewSourceAnnotation(annotation)}
                    style={{ cursor: "pointer" }}
                  >
                    <List.Header>{annotation.annotationLabel.text}</List.Header>
                    <List.Description>{annotation.rawText}</List.Description>
                  </List.Item>
                ))}
              </List>
            </Card.Content>
          </Card>
        </Grid.Column>
        <Grid.Column width={12}>
          <Card fluid>
            <Card.Content>
              <Card.Header>Query</Card.Header>
            </Card.Content>
            <Card.Content>
              <SyntaxHighlighter language="graphql" style={vs}>
                {query_obj.query}
              </SyntaxHighlighter>
            </Card.Content>
          </Card>
          <Segment>
            <Header as="h3">Stacktrace</Header>
            <SyntaxHighlighter language="bash" style={vs}>
              {query_obj.stacktrace || ""}
            </SyntaxHighlighter>
          </Segment>
        </Grid.Column>
      </Grid>
    );
  }

  return (
    <Grid columns={2}>
      <Grid.Column width={4}>
        <Card fluid>
          <Card.Content>
            <Card.Header>Annotations</Card.Header>
          </Card.Content>
          <Card.Content>
            <List divided relaxed>
              {query_obj.fullSourceList.map((annotation) => (
                <List.Item
                  key={annotation.id}
                  onClick={() => setViewSourceAnnotation(annotation)}
                  style={{ cursor: "pointer" }}
                >
                  <List.Header>{annotation.annotationLabel.text}</List.Header>
                  <List.Description>{annotation.rawText}</List.Description>
                </List.Item>
              ))}
            </List>
          </Card.Content>
        </Card>
      </Grid.Column>
      <Grid.Column width={12}>
        <Card fluid>
          <Card.Content>
            <Card.Header>Query</Card.Header>
          </Card.Content>
          <Card.Content>
            <SyntaxHighlighter language="graphql" style={vs}>
              {query_obj.query}
            </SyntaxHighlighter>
          </Card.Content>
        </Card>
        <Segment>
          <Header as="h3">Response</Header>
          <ReactMarkdown
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log(event, href);
                  }}
                >
                  {children}
                </a>
              ),
            }}
          >
            {query_obj.response || ""}
          </ReactMarkdown>
        </Segment>
      </Grid.Column>
    </Grid>
  );
};

export default QueryResultsViewer;
