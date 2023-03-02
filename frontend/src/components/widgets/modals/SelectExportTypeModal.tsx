import React from 'react'
import { Button, Dropdown, Modal } from 'semantic-ui-react'
import { ExportTypes } from '../../types';


export function SelectExportTypeModal({
  visible,
  toggleModal,
  startExport
}: {
  visible: boolean;
  toggleModal: (args?: any) => void | any;
  startExport: (id: string, type: ExportTypes) => void | any;
}) {

  return (
      <Modal
        size="small"
        open={visible}
        onClose={() => {}}
      >
        <Modal.Header>Delete Your Account</Modal.Header>
        <Modal.Content>
          <div style={{
            "display": "flex",
            "flexDirection": "row",
            "justifyContent": "center",
            "height": "100%"
          }}>
            <div>
            {/* <Dropdown
              placeholder="Select label"
              search
              selection
              options={[]}
              onChange={()=>{}}
              value={}
            /> */}
            </div>
          </div>
        </Modal.Content>
        <Modal.Actions>
          <Button negative onClick={() => toggleModal()}>
            Cancel
          </Button>
          <Button positive onClick={() => {}}>
            Start
          </Button>
        </Modal.Actions>
      </Modal>
  )
}
