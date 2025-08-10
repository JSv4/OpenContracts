import React, { useEffect } from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import UserSettingsModal from "../src/components/modals/UserSettingsModal";
import { backendUserObj, showUserSettingsModal } from "../src/graphql/cache";

export interface UserSettingsModalHarnessProps {
  mocks: ReadonlyArray<MockedResponse>;
}

const UserSettingsModalHarness: React.FC<UserSettingsModalHarnessProps> = ({
  mocks,
}) => {
  useEffect(() => {
    backendUserObj({ id: "user-1", username: "alice", slug: "alice" } as any);
    showUserSettingsModal(true);
    return () => {
      showUserSettingsModal(false);
      backendUserObj(null);
    };
  }, []);
  return (
    <MockedProvider mocks={mocks} addTypename>
      <UserSettingsModal />
    </MockedProvider>
  );
};

export default UserSettingsModalHarness;
