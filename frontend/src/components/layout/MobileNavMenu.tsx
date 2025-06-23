import { Menu, Image, Dropdown, Icon } from "semantic-ui-react";
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
} from "../../graphql/cache";
import { useReactiveVar } from "@apollo/client";
import "./MobileNavMenu.css";
import { useEnv } from "../hooks/UseEnv";

export const MobileNavMenu = () => {
  const { REACT_APP_USE_AUTH0 } = useEnv();
  const { loginWithRedirect, logout, user: auth0_user, isLoading } = useAuth0();
  const cache_user = useReactiveVar(userObj);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const user = REACT_APP_USE_AUTH0 ? auth0_user : cache_user;

  const show_export_modal = useReactiveVar(showExportModal);

  let public_header_items = header_menu_items.filter((item) => !item.protected);
  let private_header_items = header_menu_items.filter((item) => item.protected);

  const requestLogout = (args: any) => {
    if (REACT_APP_USE_AUTH0) {
      logout(args);
    } else {
      authToken("");
      userObj(null);
      navigate("/");
    }
  };

  const isActive = (route: string) => {
    if (route === "/corpuses") {
      return pathname === "/" || pathname.startsWith("/corpuses");
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  };

  const clearSelections = () => {
    openedCorpus(null);
    openedDocument(null);
  };

  const items = public_header_items.map((item) => (
    <Dropdown.Item
      id={item.id}
      className="uninvert_me"
      name={item.title}
      active={isActive(item.route)}
      key={`${item.title}`}
      onClick={clearSelections}
    >
      <Link to={item.route}>{item.title}</Link>
    </Dropdown.Item>
  ));

  const private_items = private_header_items.map((item) => (
    <Dropdown.Item
      id={item.id}
      className="uninvert_me"
      name={item.title}
      active={isActive(item.route)}
      key={`${item.title}`}
      onClick={clearSelections}
    >
      <Link to={item.route}>{item.title}</Link>
    </Dropdown.Item>
  ));

  if (REACT_APP_USE_AUTH0) {
    return (
      <Menu fluid inverted attached style={{ marginBottom: "0px" }}>
        <Menu.Menu position="left">
          <Menu.Item>
            <Image size="mini" src={logo} style={{ marginRight: "1.5em" }} />
            <Dropdown
              id="MobileMenuDropdown"
              item
              simple
              text="Open Contracts"
              style={{
                background: "#1b1c1d !important",
              }}
            >
              <Dropdown.Menu
                style={{
                  background: "#1b1c1d !important",
                }}
              >
                {user ? [...items, ...private_items] : items}
              </Dropdown.Menu>
            </Dropdown>
          </Menu.Item>
        </Menu.Menu>

        <Menu.Menu position="right">
          {!isLoading && user ? (
            <>
              <Menu.Item>
                <Image src={user_logo} avatar />
                <Dropdown
                  item
                  simple
                  icon={<Icon style={{ marginLeft: "5px" }} name="dropdown" />}
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
                      text="Logout"
                      onClick={() =>
                        requestLogout({ returnTo: window.location.origin })
                      }
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
            <Menu.Item onClick={() => loginWithRedirect()}>Login</Menu.Item>
          )}
        </Menu.Menu>
      </Menu>
    );
  } else {
    return (
      <Menu fluid inverted attached style={{ marginBottom: "0px" }}>
        <Menu.Menu position="left">
          <Menu.Item>
            <Image size="mini" src={logo} style={{ marginRight: "1.5em" }} />
            <Dropdown
              id="MobileMenuDropdown"
              item
              simple
              text="Open Contracts"
              style={{
                background: "#1b1c1d !important",
              }}
            >
              <Dropdown.Menu
                style={{
                  background: "#1b1c1d !important",
                }}
              >
                {user ? [...items, ...private_items] : items}
              </Dropdown.Menu>
            </Dropdown>
          </Menu.Item>
        </Menu.Menu>

        <Menu.Menu position="right">
          {user ? (
            <>
              <Menu.Item>
                <Image src={user_logo} avatar />
                <Dropdown
                  item
                  simple
                  icon={<Icon style={{ marginLeft: "5px" }} name="dropdown" />}
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
                      text="Logout"
                      onClick={() =>
                        requestLogout({ returnTo: window.location.origin })
                      }
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
    );
  }
};
