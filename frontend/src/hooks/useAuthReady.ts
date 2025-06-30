import { useReactiveVar } from "@apollo/client";
import { authStatusVar } from "../graphql/cache";

/**
 * React hook that returns true once authentication cycle has completed
 * (regardless of whether the user ended up logged-in or anonymous).
 */
export const useAuthReady = () => {
  const status = useReactiveVar(authStatusVar);
  return status !== "LOADING";
};
