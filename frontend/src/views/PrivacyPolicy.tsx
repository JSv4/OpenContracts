import { Component } from "react";
import { Container } from "semantic-ui-react";

import { privacy_page_html } from "../assets/templates/privacy";

export class PrivacyPolicy extends Component {
  render() {
    var template = { __html: privacy_page_html };

    return (
      <div>
        <Container text style={{ marginTop: "5em", marginBottom: "10em" }}>
          <div dangerouslySetInnerHTML={template} />
        </Container>
      </div>
    );
  }
}
