import React, { useEffect, useState } from "react";
import {
  Grid,
  Card,
  Image,
  Header,
  Segment,
  Placeholder,
  Loader,
  Container,
  Divider,
  Popup,
} from "semantic-ui-react";
import ReactMarkdown from "react-markdown";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CorpusQueryType, ServerAnnotationType } from "../../graphql/types";
import {
  displayAnnotationOnAnnotatorLoad,
  onlyDisplayTheseAnnotations,
  openedDocument,
  selectedAnnotation,
} from "../../graphql/cache";
import wait_icon from "../../assets/icons/waiting for robo.webp";

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
      console.log("viewSourceAnnotation", viewSourceAnnotation);
      displayAnnotationOnAnnotatorLoad(viewSourceAnnotation);
      selectedAnnotation(viewSourceAnnotation);
      openedDocument(viewSourceAnnotation.document);
      onlyDisplayTheseAnnotations([viewSourceAnnotation]);
      setViewSourceAnnotation(null);
    }
  }, [viewSourceAnnotation]);

  if (!query_obj.started) {
    return (
      <Container>
        <Grid stackable columns={2}>
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
              <Image avatar src={wait_icon} />
            </Segment>
          </Grid.Column>
        </Grid>
      </Container>
    );
  }

  if (query_obj.started && !query_obj.completed && !query_obj.failed) {
    return (
      <Container>
        <Grid stackable columns={2}>
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
      </Container>
    );
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength) + "...";
  };

  if (query_obj.failed) {
    return (
      <Container>
        <Grid stackable columns={2}>
          <Grid.Column width={4}>
            <Card fluid>
              <Card.Content>
                <Card.Header>Annotations</Card.Header>
              </Card.Content>
              <Card.Content style={{ maxHeight: "60vh", overflowY: "auto" }}>
                <Card.Group itemsPerRow={1}>
                  {query_obj.fullSourceList.map((annotation) => (
                    <Card
                      key={annotation.id}
                      onClick={() => setViewSourceAnnotation(annotation)}
                      style={{ cursor: "pointer" }}
                    >
                      <Card.Content>
                        <Card.Header>
                          {annotation.annotationLabel.text}
                        </Card.Header>
                        <Card.Description>
                          <Popup
                            trigger={
                              <div>
                                {truncateText(
                                  annotation.rawText ? annotation.rawText : "",
                                  256
                                )}
                              </div>
                            }
                            content={annotation.rawText}
                            position="top left"
                            size="small"
                            inverted
                          />
                        </Card.Description>
                      </Card.Content>
                    </Card>
                  ))}
                </Card.Group>
              </Card.Content>
            </Card>
          </Grid.Column>
        </Grid>
      </Container>
    );
  }

  return (
    <Container>
      <Grid stackable columns={2}>
        <Grid.Column width={4}>
          <Card fluid>
            <Card.Content>
              <Card.Header>Annotations</Card.Header>
            </Card.Content>
            <Card.Content style={{ maxHeight: "60vh", overflowY: "auto" }}>
              <Card.Group itemsPerRow={1}>
                {query_obj.fullSourceList.map((annotation) => (
                  <Card
                    key={annotation.id}
                    onClick={() => setViewSourceAnnotation(annotation)}
                    style={{ cursor: "pointer" }}
                  >
                    <Card.Content>
                      <Card.Header>
                        {annotation.annotationLabel.text}
                      </Card.Header>
                      <Card.Description>
                        <Popup
                          trigger={
                            <div>
                              {truncateText(
                                annotation.rawText ? annotation.rawText : "",
                                256
                              )}
                            </div>
                          }
                          content={annotation.rawText}
                          position="left center"
                          size="small"
                          inverted
                        />
                      </Card.Description>
                    </Card.Content>
                  </Card>
                ))}
              </Card.Group>
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
            <Divider />
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
    </Container>
  );
};

export default QueryResultsViewer;
