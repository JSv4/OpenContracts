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
import useWindowDimensions from "../hooks/WindowDimensionHook";

export function Footer() {
  const { width } = useWindowDimensions();

  if (width <= 1000) {
    return (
      <Segment inverted vertical style={{ width: "100%", padding: "1em" }}>
        <Container textAlign="center">
          <Image
            centered
            size="small"
            src={logo}
            style={
              width <= 400
                ? { width: "auto", height: "50px", fontSize: ".9rem" }
                : {}
            }
          />
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
          <Divider inverted section />
          <Grid divided inverted stackable>
            <Grid.Column width={4}>
              <Header inverted as="h4" content="My Other Projects:" />
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
              <Header inverted as="h4" content="Open Source Legaltech" />
              <List link inverted>
                <List.Item as="a" href="https://github.com/JSv4">
                  Github
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
                Open Contracts was developed by{" "}
                <a href="https://github.com/JSv4">JSv4</a>. Use of this tool is
                governed by the terms of service.
              </p>
            </Grid.Column>
          </Grid>
        </Container>
      </Segment>
    );
  } else {
    return (
      <Segment inverted vertical style={{ width: "100%", padding: "5em 0em" }}>
        <Container textAlign="center">
          <Grid divided inverted stackable>
            <Grid.Column width={4}>
              <Header inverted as="h4" content="My Other Projects:" />
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
              <Header inverted as="h4" content="Open Source Legaltech" />
              <List link inverted>
                <List.Item as="a" href="https://github.com/JSv4">
                  Github
                </List.Item>
              </List>
            </Grid.Column>
            <Grid.Column width={8}>
              <Header inverted as="h4" content="©2021-2024 JSv4" />
              <p>
                Open Contracts was developed by{" "}
                <a href="https://github.com/JSv4">JSv4</a>. Use of this tool is
                governed by the terms of service.
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
}
