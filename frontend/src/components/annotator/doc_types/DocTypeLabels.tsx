import { Card, Icon, Popup, Header } from "semantic-ui-react";
import { AnnotationLabelType } from "../../../graphql/types";

interface DocTypeLabelProps {
  label: AnnotationLabelType;
  onRemove: (() => void) | null;
}

export const DocTypeLabel = ({ label, onRemove }: DocTypeLabelProps) => {
  return (
    <Card
      className="doc_label"
      raised
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        margin: ".25vw",
        width: "12vw",
        userSelect: "none",
        "-msUserSelect": "none",
        MozUserSelect: "none",
      }}
    >
      {onRemove ? (
        <Icon
          link
          color="red"
          name="trash"
          style={{ position: "absolute", right: ".25vw", top: ".25vw" }}
          onClick={() => onRemove()}
        />
      ) : (
        <></>
      )}
      <Card.Content
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <Popup
          style={{ textAlign: "left" }}
          content={
            <p>
              <u>
                <b>
                  <em>Description:</em>
                </b>
              </u>
              <br />
              {`${label.description}`}
            </p>
          }
          trigger={
            <Card.Header
              style={{
                textAlign: "left",
                wordBreak: "break-all",
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-start",
                height: "100%",
                margin: "0px",
              }}
            >
              <div>
                <Header as="h5">
                  <Icon name={label.icon} style={{ color: label.color }} />
                  <Header.Content>{label.text}</Header.Content>
                </Header>
              </div>
            </Card.Header>
          }
        />
      </Card.Content>
    </Card>
  );
};

export const BlankDocTypeLabel = () => {
  return (
    <Card
      raised
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        margin: ".25vw",
        width: "12vw",
      }}
    >
      <Card.Content
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
        }}
      >
        <Card.Header style={{ textAlign: "left" }}>
          <Header as="h5">
            <Icon name="dont" />
            <Header.Content>No Label</Header.Content>
          </Header>
        </Card.Header>
      </Card.Content>
    </Card>
  );
};
