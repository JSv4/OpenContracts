import { List, Modal, Header, Icon, Button, Image } from "semantic-ui-react";

import inverted_cookie_icon from "../../assets/icons/noun-cookie-2123093-FFFFFF.png";
import { showCookieAcceptModal } from "../../graphql/cache";

export const CookieConsentDialog = () => {
  return (
    <Modal basic size="small" open>
      <Header icon>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          <div>
            <Image src={inverted_cookie_icon} />
          </div>
        </div>
        <div style={{ marginTop: ".5em" }}>This Site Uses Cookies</div>
      </Header>
      <Modal.Content style={{ marginTop: "0", paddingTop: "0" }}>
        <p>
          This website uses cookies to enhance the user experience and help us
          refine OpenContracts. We do not sell or share user information. Please
          accept the cookie to continue.
        </p>
        <Header inverted textAlign="center">
          <Header.Content as="h4">
            <u>What We Collect</u>
          </Header.Content>
        </Header>
        <List>
          <List.Item>
            <List.Icon name="users" />
            <List.Content>User Information (email, name, ip)</List.Content>
          </List.Item>
          <List.Item>
            <List.Icon name="settings" />
            <List.Content>Usage Information</List.Content>
          </List.Item>
          <List.Item>
            <List.Icon name="computer" />
            <List.Content>System Information</List.Content>
          </List.Item>
        </List>
      </Modal.Content>
      <Modal.Actions>
        <Button
          color="green"
          inverted
          onClick={() => showCookieAcceptModal(false)}
        >
          <Icon name="checkmark" /> Accept
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
