import { Menu, Image, Dropdown, Icon, Label } from "semantic-ui-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { Link } from "react-router-dom";

import logo from "../../assets/images/os_legal_128.png";
import user_logo from "../../assets/icons/noun-person-113116-FFFFFF.png";
import { header_menu_items } from "../../assets/configurations/menus";
import {
  authToken,
  showExportModal,
  userObj,
  openedCorpus,
  openedDocument,
  showUserSettingsModal,
} from "../../graphql/cache";
import UserSettingsModal from "../modals/UserSettingsModal";
import { useReactiveVar } from "@apollo/client";
import { useEnv } from "../hooks/UseEnv";
import { VERSION_TAG } from "../../assets/configurations/constants";

export const NavMenu = () => {
  const { REACT_APP_USE_AUTH0, REACT_APP_AUDIENCE } = useEnv();
  const {
    loginWithRedirect,
    loginWithPopup,
    logout,
    user: auth0_user,
    isLoading,
  } = useAuth0();
  const cache_user = useReactiveVar(userObj);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const user = REACT_APP_USE_AUTH0 ? auth0_user : cache_user;

  // Debug logging for authentication state
  console.log("[NavMenu] REACT_APP_USE_AUTH0:", REACT_APP_USE_AUTH0);
  console.log("[NavMenu] isLoading:", isLoading);
  console.log("[NavMenu] auth0_user:", auth0_user);
  console.log("[NavMenu] cache_user:", cache_user);
  console.log("[NavMenu] resolved user:", user);

  const show_export_modal = useReactiveVar(showExportModal);

  let public_header_items = header_menu_items.filter((item) => !item.protected);
  let private_header_items = header_menu_items.filter((item) => item.protected);

  /*
   * Determines whether a menu item should be shown as active based on the current
   * location pathname. We consider an item active when the pathname is exactly
   * the route OR it is a sub-route (i.e. pathname starts with `${route}/`).
   */
  const getIsActive = (route: string) => {
    if (route === "/corpuses") {
      // "Corpuses" acts as our home page and should also be active for the old
      // root path ("/") to avoid a brief flash before the redirect kicks in.
      return pathname === "/" || pathname.startsWith("/corpuses");
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  };

  const requestLogout = () => {
    if (REACT_APP_USE_AUTH0) {
      logout({
        logoutParams: {
          returnTo: window.location.origin,
        },
      });
    } else {
      authToken("");
      userObj(null);
      navigate("/");
    }
  };

  const clearSelections = () => {
    openedCorpus(null);
    openedDocument(null);
  };

  const items = public_header_items.map((item) => (
    <Menu.Item
      id={item.id}
      name={item.title}
      active={getIsActive(item.route)}
      key={`${item.title}`}
      onClick={clearSelections}
    >
      <Link to={item.route}>{item.title}</Link>
    </Menu.Item>
  ));

  const private_items = private_header_items.map((item) => (
    <Menu.Item
      id={item.id}
      name={item.title}
      active={getIsActive(item.route)}
      key={`${item.title}`}
      onClick={clearSelections}
    >
      <Link to={item.route}>{item.title}</Link>
    </Menu.Item>
  ));

  if (REACT_APP_USE_AUTH0) {
    const doLogin = async () => {
      console.log("[NavMenu] doLogin clicked, attempting loginWithPopup...");
      try {
        await loginWithPopup({
          authorizationParams: {
            audience: REACT_APP_AUDIENCE || undefined,
            scope: "openid profile email",
            redirect_uri: window.location.origin,
          },
        });
        console.log("[NavMenu] loginWithPopup succeeded");
      } catch (error) {
        console.error(
          "[NavMenu] loginWithPopup error, falling back to redirect:",
          error
        );
        await loginWithRedirect({
          appState: {
            returnTo: window.location.pathname + window.location.search,
          },
          authorizationParams: {
            audience: REACT_APP_AUDIENCE || undefined,
            scope: "openid profile email",
          },
        });
      }
    };

    return (
      <>
        <UserSettingsModal />
        <Menu fluid inverted attached style={{ marginBottom: "0px" }}>
          <Menu.Item header>
            <Image size="mini" src={logo} style={{ marginRight: "1.5em" }} />
            Open Contracts
            <Label
              size="tiny"
              color="grey"
              style={{ marginLeft: "0.5em", verticalAlign: "middle" }}
            >
              {VERSION_TAG}
            </Label>
          </Menu.Item>
          {!isLoading && user ? [...items, ...private_items] : items}
          <Menu.Menu position="right">
            {!isLoading && user ? (
              <>
                <Menu.Item>
                  <Image src={user_logo} avatar />
                  <Dropdown
                    item
                    simple
                    icon={
                      <Icon style={{ marginLeft: "5px" }} name="dropdown" />
                    }
                    text={` ${user?.name ? user.name : user.username}`}
                    style={{ margin: "0px", padding: "0px" }}
                    header="Logout"
                  >
                    <Dropdown.Menu>
                      <Dropdown.Item
                        text="Exports"
                        onClick={() => showExportModal(!show_export_modal)}
                        icon={<Icon name="download" />}
                      />
                      <Dropdown.Item
                        text="Profile"
                        onClick={() => showUserSettingsModal(true)}
                        icon={<Icon name="user circle" />}
                      />
                      <Dropdown.Item
                        text="Logout"
                        onClick={() => requestLogout()}
                        icon={<Icon name="log out" />}
                      />
                      {/* <Dropdown.Item 
                                            text='Settings'
                                            onClick={() => console.log("Do nothing yet...")}
                                            icon={<Icon name='settings'/>}
                                        /> */}
                    </Dropdown.Menu>
                  </Dropdown>
                </Menu.Item>
              </>
            ) : (
              <Menu.Item onClick={doLogin}>Login</Menu.Item>
            )}
          </Menu.Menu>
        </Menu>
      </>
    );
  } else {
    return (
      <>
        <UserSettingsModal />
        <Menu fluid inverted attached style={{ marginBottom: "0px" }}>
          <Menu.Item header>
            <Image size="mini" src={logo} style={{ marginRight: "1.5em" }} />
            Open Contracts
            <Label
              size="tiny"
              color="grey"
              style={{ marginLeft: "0.5em", verticalAlign: "middle" }}
            >
              {VERSION_TAG}
            </Label>
          </Menu.Item>
          {user ? [...items, ...private_items] : items}
          <Menu.Menu position="right">
            {user ? (
              <>
                <Menu.Item>
                  <Image src={user_logo} avatar />
                  <Dropdown
                    item
                    simple
                    icon={
                      <Icon style={{ marginLeft: "5px" }} name="dropdown" />
                    }
                    text={` ${user?.name ? user.name : user.username}`}
                    style={{ margin: "0px", padding: "0px" }}
                    header="Logout"
                  >
                    <Dropdown.Menu>
                      <Dropdown.Item
                        text="Exports"
                        onClick={() => showExportModal(!show_export_modal)}
                        icon={<Icon name="download" />}
                      />
                      <Dropdown.Item
                        text="Profile"
                        onClick={() => showUserSettingsModal(true)}
                        icon={<Icon name="user circle" />}
                      />
                      <Dropdown.Item
                        text="Logout"
                        onClick={() => requestLogout()}
                        icon={<Icon name="log out" />}
                      />
                      {/* <Dropdown.Item 
                                            text='Settings'
                                            onClick={() => console.log("Do nothing yet...")}
                                            icon={<Icon name='settings'/>}
                                        /> */}
                    </Dropdown.Menu>
                  </Dropdown>
                </Menu.Item>
              </>
            ) : (
              <Menu.Item
                id="login_nav_button"
                name="Login"
                active={pathname === "/login"}
                key="login_nav_button"
              >
                <Link to="/login">Login</Link>
              </Menu.Item>
            )}
          </Menu.Menu>
        </Menu>
      </>
    );
  }
};
