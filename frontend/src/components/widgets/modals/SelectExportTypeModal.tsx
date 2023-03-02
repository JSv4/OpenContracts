import React from 'react'
import { Button, Icon, Modal } from 'semantic-ui-react'


export function SelectExportTypeModal({
  visible,
  toggleModal,
  startExport
}: {
  visible: boolean;
  toggleModal: (args?: any) => void | any;
  startExport: (id: string, type: ) => void | any;
}) {

  return (
      <Modal
        size="small"
        open={open}
        onClose={() => dispatch({ type: 'close' })}
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
            <Dropdown
              placeholder="Select label"
              search
              selection
              options={dropdownOptions}
              onChange={handleDropdownChange}
              onMouseDown={onMouseDown}
              value={selectedLabel.id}
            />
            </div>
          </div>
        </Modal.Content>
        <Modal.Actions>
          <Button negative onClick={() => toggleModal()}>
            Cancel
          </Button>
          <Button positive onClick={() => dispatch({ type: 'close' })}>
            Start
          </Button>
        </Modal.Actions>
      </Modal>
  )
}

export default ModalExampleSize
