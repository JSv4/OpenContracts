import { Card, Icon, Popup, Header } from "semantic-ui-react";
import { AnnotationLabelType } from "../../../../graphql/types";

interface LabelCardProps {
  label: AnnotationLabelType;
}

export const SpanLabelCard = ({ label }: LabelCardProps) => {
  return (
    <Card
      raised
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        margin: ".25vw",
        flex: 1,
        maxWidth: "200px",
        minWidth: "100px",
        userSelect: "none",
        MsUserSelect: "none",
        MozUserSelect: "none",
      }}
    >
      <Card.Content
        raised
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

export const BlankLabelElement = () => {
  return (
    <Card
      raised
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        margin: ".25vw",
        width: "100%",
      }}
    >
      <Card.Content
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
        }}
      >
        <Card.Header style={{ textAlign: "left" }}>
          <Header as="h5">
            <Icon name="dont" />
            <Header.Content>No Label Selected</Header.Content>
          </Header>
        </Card.Header>
      </Card.Content>
    </Card>
  );
};
