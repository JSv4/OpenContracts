import React, { useEffect, useMemo, useState } from "react";
import { Modal, Header, Icon, Button, Form } from "semantic-ui-react";
import { useMutation, useReactiveVar } from "@apollo/client";

import { backendUserObj, showUserSettingsModal } from "../../graphql/cache";
import {
  UPDATE_ME,
  UpdateMeInputs,
  UpdateMeOutputs,
} from "../../graphql/mutations";

interface EditableProfileState {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  slug?: string;
}

const UserSettingsModal: React.FC = () => {
  const isOpen = useReactiveVar(showUserSettingsModal);
  const user = useReactiveVar(backendUserObj);
  const [form, setForm] = useState<EditableProfileState>({});
  const [dirty, setDirty] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: (user as any).name,
        firstName: (user as any).firstName,
        lastName: (user as any).lastName,
        phone: (user as any).phone,
        slug: (user as any).slug,
      });
      setDirty(false);
    }
  }, [user, isOpen]);

  const [updateMe, { loading }] = useMutation<UpdateMeOutputs, UpdateMeInputs>(
    UPDATE_ME,
    {
      onCompleted: (data) => {
        if (data.updateMe?.user) {
          backendUserObj({ ...(user as any), ...data.updateMe.user });
        }
        showUserSettingsModal(false);
      },
    }
  );

  const onChange = (key: keyof EditableProfileState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const canSave = useMemo(() => dirty && !!user, [dirty, user]);

  return (
    <Modal
      open={isOpen}
      onClose={() => showUserSettingsModal(false)}
      size="small"
      closeIcon
      data-testid="user-settings-modal"
    >
      <Header icon data-testid="user-settings-header">
        <Icon name="user circle" />
        User Settings
        <Header.Subheader>Update your profile and public slug</Header.Subheader>
      </Header>
      <Modal.Content>
        <Form>
          <Form.Input
            label="Public Slug"
            placeholder="your-slug"
            value={form.slug || ""}
            onChange={(_, data) => onChange("slug", String(data.value || ""))}
          />
          <Form.Input
            label="Name"
            placeholder="Display name"
            value={form.name || ""}
            onChange={(_, data) => onChange("name", String(data.value || ""))}
          />
          <Form.Group widths="equal">
            <Form.Input
              label="First Name"
              value={form.firstName || ""}
              onChange={(_, data) =>
                onChange("firstName", String(data.value || ""))
              }
            />
            <Form.Input
              label="Last Name"
              value={form.lastName || ""}
              onChange={(_, data) =>
                onChange("lastName", String(data.value || ""))
              }
            />
          </Form.Group>
          <Form.Input
            label="Phone"
            value={form.phone || ""}
            onChange={(_, data) => onChange("phone", String(data.value || ""))}
          />
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button
          basic
          color="grey"
          onClick={() => showUserSettingsModal(false)}
          disabled={loading}
        >
          <Icon name="remove" /> Close
        </Button>
        <Button
          color="green"
          inverted
          disabled={!canSave}
          loading={loading}
          onClick={() => updateMe({ variables: form })}
        >
          <Icon name="check" /> Save
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

export default UserSettingsModal;
