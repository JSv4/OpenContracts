import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider as JotaiProvider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { ChatTray } from "../src/components/knowledge_base/document/right_tray/ChatTray";
import { authToken, userObj } from "../src/graphql/cache";
import { relayStylePagination } from "@apollo/client/utilities";

interface ChatTrayTestWrapperProps {
  mocks?: MockedResponse[];
  documentId: string;
  corpusId?: string;
  initialMessage?: string;
  showLoad?: boolean;
  setShowLoad?: React.Dispatch<React.SetStateAction<boolean>>;
  onMessageSelect?: () => void;
  initialEntries?: string[];
}

// Create a minimal cache with necessary field policies
const createCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          conversations: relayStylePagination(),
          chatMessages: {
            keyArgs: ["conversationId"],
            merge(existing = [], incoming) {
              return incoming;
            },
          },
        },
      },
    },
  });

export const ChatTrayTestWrapper: React.FC<ChatTrayTestWrapperProps> = ({
  mocks = [],
  documentId,
  corpusId,
  initialMessage,
  showLoad = false,
  setShowLoad = () => {},
  onMessageSelect = () => {},
  initialEntries = ["/"],
}) => {
  // Ensure auth token and user are available **before** ChatTray mounts so that
  // the component can establish its WebSocket connection on the very first
  // render. Setting these reactive variables synchronously avoids a race
  // where the initial `useEffect` in `ChatTray` would run without a token,
  // preventing the socket from connecting and leaving `wsReady` stuck at
  // `false`.
  authToken("test-auth-token");
  userObj({
    id: "test-user",
    email: "test@example.com",
    username: "testuser",
  });

  return (
    <MemoryRouter initialEntries={initialEntries}>
      <JotaiProvider>
        <MockedProvider mocks={mocks} cache={createCache()} addTypename={true}>
          <div style={{ height: "100vh", width: "100%", display: "flex" }}>
            <ChatTray
              documentId={documentId}
              corpusId={corpusId}
              showLoad={showLoad}
              setShowLoad={setShowLoad}
              onMessageSelect={onMessageSelect}
              initialMessage={initialMessage}
            />
          </div>
        </MockedProvider>
      </JotaiProvider>
    </MemoryRouter>
  );
};
