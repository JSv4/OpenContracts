import { useLocation, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useReactiveVar } from "@apollo/client";
import {
  authStatusVar,
  backendUserObj,
  showExportModal,
} from "../../graphql/cache";
import { header_menu_items } from "../../assets/configurations/menus";
import { useEnv } from "../hooks/UseEnv";
import { clearAuthSession } from "../../utils/authSession";
import { useAuthLogin } from "../../hooks/useAuthLogin";
import { toast } from "react-toastify";

/**
 * Shared navigation menu logic for both desktop and mobile nav components.
 * Handles auth resolution, menu filtering, active state, and logout.
 */
export const useNavMenu = () => {
  const { REACT_APP_USE_AUTH0, REACT_APP_AUDIENCE } = useEnv();
  const { logout } = useAuth0();
  const backendUser = useReactiveVar(backendUserObj);
  const authStatus = useReactiveVar(authStatusVar);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { doLogin, isLoggingIn } = useAuthLogin();
  const user = authStatus === "AUTHENTICATED" ? backendUser : null;
  // Backend validation has a timeout and retry UI; identity absence never
  // latches the navigation into a permanent loading state.
  const isLoading = authStatus === "LOADING" || isLoggingIn;
  const show_export_modal = useReactiveVar(showExportModal);

  // Filter menu items based on authentication
  const public_header_items = header_menu_items.filter(
    (item) => !item.protected
  );
  const private_header_items = header_menu_items.filter(
    (item) => item.protected
  );

  /**
   * Determines whether a menu item should be shown as active based on the current
   * location pathname. We consider an item active when the pathname is exactly
   * the route OR it is a sub-route (i.e. pathname starts with `${route}/`).
   */
  const isActive = (route: string) => {
    if (route === "/") {
      // Discover/Home is only active on exact "/" path
      return pathname === "/";
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  };

  const requestLogout = () => {
    clearAuthSession(undefined, "logout");
    if (REACT_APP_USE_AUTH0) {
      void logout({ logoutParams: { returnTo: window.location.origin } }).catch(
        () => {
          toast.error(
            "You are signed out locally. Sign-out from Auth0 could not be completed."
          );
        }
      );
    } else {
      navigate("/");
    }
  };

  // isSuperuser is sourced from backendUserObj (populated by GET_ME query),
  // not from Auth0 user or cache_user which don't carry this field.
  const isSuperuser = Boolean(user?.isSuperuser);

  return {
    // Auth state
    user,
    isSuperuser,
    isLoading,
    REACT_APP_USE_AUTH0,
    REACT_APP_AUDIENCE,

    // Menu items
    public_header_items,
    private_header_items,

    // UI state
    show_export_modal,
    pathname,

    // Functions
    isActive,
    requestLogout,
    doLogin,

    // Navigation
    navigate,
  };
};
