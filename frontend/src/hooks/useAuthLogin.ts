import { useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "react-toastify";
import { safeReturnTo } from "../utils/authRedirect";

export function useAuthLogin() {
  const { loginWithRedirect } = useAuth0();
  const inProgress = useRef(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const doLogin = async () => {
    if (inProgress.current) return;
    inProgress.current = true;
    setIsLoggingIn(true);
    try {
      await loginWithRedirect({
        appState: {
          returnTo: safeReturnTo(
            window.location.pathname +
              window.location.search +
              window.location.hash
          ),
        },
      });
    } catch {
      toast.error("Sign-in could not be started. Please try again.", {
        toastId: "auth-sign-in",
      });
    } finally {
      inProgress.current = false;
      setIsLoggingIn(false);
    }
  };
  return { doLogin, isLoggingIn };
}
