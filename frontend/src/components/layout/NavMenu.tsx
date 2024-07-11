import { Menu, Image, Dropdown, Icon } from "semantic-ui-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { Link } from "react-router-dom";

import logo from "../../assets/images/os_legal_128.png";
import user_logo from "../../assets/icons/noun-person-113116-FFFFFF.png";
import { header_menu_items } from "../../assets/configurations/menus";
import { authToken, showExportModal, userObj } from "../../graphql/cache";
import { useReactiveVar } from "@apollo/client";
import { useEnv } from "../hooks/UseEnv";

export const NavMenu = () => {
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

  const items = public_header_items.map((item) => (
    <Menu.Item
      id={item.id}
      name={item.title}
      active={pathname === item.route}
      key={`${item.title}`}
    >
      <Link to={item.route}>
        {item.title}
        {item.icon ? (
          <Icon name={item.icon} style={{ paddingLeft: ".25rem" }} />
        ) : (
          <></>
        )}
      </Link>
    </Menu.Item>
  ));

  const private_items = private_header_items.map((item) => (
    <Menu.Item
      id={item.id}
      name={item.title}
      active={pathname === item.route}
      key={`${item.title}`}
    >
      <Link to={item.route}>{item.title}</Link>
    </Menu.Item>
  ));

  if (REACT_APP_USE_AUTH0) {
    return (
      <Menu fluid inverted attached style={{ marginBottom: "0px" }}>
        <Menu.Item header>
          <Image size="mini" src={logo} style={{ marginRight: "1.5em" }} />
          Open Contracts
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
        <Menu.Item header>
          <Image size="mini" src={logo} style={{ marginRight: "1.5em" }} />
          Open Contracts
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
