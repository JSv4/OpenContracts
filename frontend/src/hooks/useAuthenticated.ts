import { useReactiveVar } from "@apollo/client";
import { authStatusVar, backendUserObj } from "../graphql/cache";

/** UI affordances follow the identity confirmed by the backend. */
export function useAuthenticated(): boolean {
  const status = useReactiveVar(authStatusVar);
  const user = useReactiveVar(backendUserObj);
  return status === "AUTHENTICATED" && Boolean(user);
}
