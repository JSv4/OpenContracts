import {
  Segment,
  Container,
  Grid,
  Divider,
  Image,
  List,
  Header,
} from "semantic-ui-react";
import { Link } from "react-router-dom";

import logo from "../../assets/images/os_legal_128.png";

export function Footer() {
  return (
    <Segment inverted vertical style={{ width: "100%", padding: "5em 0em" }}>
      <Container textAlign="center">
        <Grid divided inverted stackable>
          <Grid.Column width={4}>
            <Header inverted as="h4" content="Our Other Projects:" />
            <List link inverted>
              <List.Item as="a" href="https://github.com/JSv4/GremlinServer">
                GREMLIN Low-Code
              </List.Item>
              <List.Item
                as="a"
                href="https://github.com/JSv4/AtticusClassifier"
              >
                Open Classifiers
              </List.Item>
            </List>
          </Grid.Column>
          <Grid.Column width={4}>
            <Header inverted as="h4" content="Open Source Legal" />
            <List link inverted>
              <List.Item as="a" href="https://github.com/JSv4">
                Github
              </List.Item>
              <List.Item as="a" href="https://opensource.legal">
                OpenSource.Legal
              </List.Item>
            </List>
          </Grid.Column>
          <Grid.Column width={8}>
            <Header
              inverted
              as="h4"
              content="Gordium Knot, Inc. d/b/a OpenSource.Legal ©2021"
            />
            <p>
              Open Contracts was developed by Gordium Knot, Inc. d/b/a
              OpenSource.Legal. Use of this tool is governed by our terms of
              service.
            </p>
          </Grid.Column>
        </Grid>
        <Divider inverted section />
        <Image centered size="small" src={logo} />
        <List horizontal inverted divided link size="small">
          <List.Item>
            <Link to="/">Site Map</Link>
          </List.Item>
          <List.Item>
            <Link to="/contact">Contact Us</Link>
          </List.Item>
          <List.Item>
            <Link to="/terms_of_service">Terms of Service</Link>
          </List.Item>
          <List.Item>
            <Link to="/privacy">Privacy Policy</Link>
          </List.Item>
        </List>
      </Container>
    </Segment>
  );
}
