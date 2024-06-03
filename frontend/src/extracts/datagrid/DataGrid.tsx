import React, { useState } from "react";
import {
  Table,
  Input,
  Button,
  Icon,
  Popup,
  Modal,
  List,
  Dropdown,
} from "semantic-ui-react";
import {
  ColumnType,
  DatacellType,
  DocumentType,
  ExtractType,
} from "../../graphql/types";
import { useMutation } from "@apollo/client";
import {
  REQUEST_ADD_DOC_TO_EXTRACT,
  REQUEST_DELETE_COLUMN,
  REQUEST_REMOVE_DOC_FROM_EXTRACT,
  REQUEST_UPDATE_COLUMN,
  RequestAddDocToExtractInputType,
  RequestAddDocToExtractOutputType,
  RequestDeleteColumnInputType,
  RequestDeleteColumnOutputType,
  RequestRemoveDocFromExtractInputType,
  RequestRemoveDocFromExtractOutputType,
  RequestUpdateColumnInputType,
  RequestUpdateColumnOutputType,
} from "../../graphql/mutations";
import { toast } from "react-toastify";
import { SelectDocumentsModal } from "../../components/widgets/modals/SelectDocumentsModal";
import { CRUDModal } from "../../components/widgets/CRUD/CRUDModal";
import {
  editColumnForm_Schema,
  editColumnForm_Ui_Schema,
} from "../../components/forms/schemas";
import { LanguageModelDropdown } from "../../components/widgets/selectors/LanguageModelDropdown";

interface DataGridProps {
  extract: ExtractType;
}

export const DataGrid = ({ extract }: DataGridProps) => {
  const [column_to_edit, setColumnToEdit] = useState<ColumnType | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [showAddRowButton, setShowAddRowButton] = useState(false);
  const [openAddRowModal, setOpenAddRowModal] = useState(false);

  const { fullDatacellList, documents, fieldset } = extract;

  const cells = fullDatacellList ? fullDatacellList : [];
  const rows = documents ? documents : [];
  const columns = fieldset?.fullColumnList ? fieldset.fullColumnList : [];

  const [
    deleteColumn,
    {
      loading: delete_column_loading,
      error: delete_column_error,
      data: delete_column_data,
    },
  ] = useMutation<RequestDeleteColumnOutputType, RequestDeleteColumnInputType>(
    REQUEST_DELETE_COLUMN,
    {
      onCompleted: (data) => {
        toast.success("SUCCESS! Removed column from Extract.");
      },
      onError: (err) => {
        toast.error("ERROR! Could not remove column.");
      },
    }
  );

  const [
    updateColumn,
    {
      loading: update_column_loading,
      error: update_column_error,
      data: update_column_data,
    },
  ] = useMutation<RequestUpdateColumnOutputType, RequestUpdateColumnInputType>(
    REQUEST_UPDATE_COLUMN,
    {
      onCompleted: (data) => {
        toast.success("SUCCESS! Updated column.");
      },
      onError: (err) => {
        toast.error("ERROR! Could not update column.");
      },
    }
  );

  // TODO - I think I need to do something in the cache here...
  const [
    removeDocsFromExtract,
    { loading: remove_docs_loading, data: remove_docs_data },
  ] = useMutation<
    RequestRemoveDocFromExtractOutputType,
    RequestRemoveDocFromExtractInputType
  >(REQUEST_REMOVE_DOC_FROM_EXTRACT, {
    onCompleted: (data) => {
      toast.success("SUCCESS! Removed docs from extract.");
    },
    onError: (err) => {
      toast.error("ERROR! Could not remove docs from extract.");
    },
  });

  const [addDocsToExtract, { loading: add_docs_loading, data: add_docs_data }] =
    useMutation<
      RequestAddDocToExtractOutputType,
      RequestAddDocToExtractInputType
    >(REQUEST_ADD_DOC_TO_EXTRACT, {
      onCompleted: (data) => {
        toast.success("SUCCESS! Added docs to extract.");
      },
      onError: (err) => {
        toast.error("ERROR! Could not add docs to extract.");
      },
    });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        height: "100%",
        width: "100%",
        position: "relative",
      }}
      onMouseMove={(e) => {
        const rightEdge = e.currentTarget.getBoundingClientRect().right;
        const mouseX = e.clientX;
        setIsAddingColumn(mouseX >= rightEdge - 20);
      }}
      onMouseEnter={() => setShowAddRowButton(true)}
      onMouseLeave={() => setShowAddRowButton(false)}
    >
      <SelectDocumentsModal
        open={openAddRowModal}
        onAddDocumentIds={(documentIds: string[]) =>
          addDocsToExtract({
            variables: { extractId: extract.id, documentIds },
          })
        }
        toggleModal={() => setOpenAddRowModal(!openAddRowModal)}
      />
      <CRUDModal
        open={column_to_edit !== null}
        mode="EDIT"
        old_instance={column_to_edit ? column_to_edit : {}}
        model_name="column"
        ui_schema={editColumnForm_Ui_Schema}
        data_schema={editColumnForm_Schema}
        has_file={false}
        file_is_image={false}
        accepted_file_types=""
        file_field=""
        file_label=""
        onClose={() => setColumnToEdit(null)}
        property_widgets={{
          labelSet: <LanguageModelDropdown />,
        }}
      />
      <CRUDModal
        open={showAddColumnModal}
        mode="CREATE"
        old_instance={{}}
        model_name="column"
        ui_schema={editColumnForm_Ui_Schema}
        data_schema={editColumnForm_Schema}
        has_file={false}
        file_is_image={false}
        accepted_file_types=""
        file_field=""
        file_label=""
        onClose={() => setColumnToEdit(null)}
        property_widgets={{
          labelSet: <LanguageModelDropdown />,
        }}
      />
      <Table celled style={{ flex: 1 }}>
        <Table.Header fullWidth>
          <Table.Row>
            <Table.HeaderCell>
              <h3>Document</h3>
            </Table.HeaderCell>
            {columns.map((column) => (
              <Table.HeaderCell key={column.id}>
                {column.name}
                <Dropdown
                  icon={null}
                  trigger={<Icon name="cog" style={{ float: "right" }} />}
                  pointing="top right"
                  style={{ float: "right" }}
                >
                  <Dropdown.Menu>
                    <Dropdown.Item
                      text="Edit"
                      onClick={() => console.log("Edit", column)}
                    />
                    <Dropdown.Item
                      text="Delete"
                      onClick={() =>
                        deleteColumn({ variables: { id: column.id } })
                      }
                    />
                  </Dropdown.Menu>
                </Dropdown>
              </Table.HeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={columns.length + 1} textAlign="center">
                Please Click the "+" at the Bottom to Add Documents...
              </Table.Cell>
            </Table.Row>
          ) : (
            rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>
                  {row.title}
                  <Dropdown
                    icon={null}
                    trigger={<Icon name="cog" style={{ float: "right" }} />}
                    pointing="top right"
                    style={{ float: "right" }}
                  >
                    <Dropdown.Menu>
                      <Dropdown.Item
                        text="Edit"
                        onClick={() => console.log("Edit row ", row)}
                      />
                      <Dropdown.Item
                        text="Delete"
                        onClick={() =>
                          removeDocsFromExtract({
                            variables: {
                              extractId: extract.id,
                              documentIdsToRemove: [row.id],
                            },
                          })
                        }
                      />
                    </Dropdown.Menu>
                  </Dropdown>
                </Table.Cell>
                {cells
                  .filter((cell) => cell.document.id == row.id)
                  .map((cell) => (
                    <Table.Cell key={cell.id}>{cell.data}</Table.Cell>
                  ))}
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
      {isAddingColumn && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "40px",
            background: "rgba(0, 0, 0, 0.1)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            zIndex: 100000,
          }}
        >
          <Button
            icon="plus"
            circular
            onClick={() => setShowAddColumnModal(true)}
          />
        </div>
      )}
      {showAddRowButton && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: rows.length === 0 ? "40px" : 0,
            height: "40px",
            background: "rgba(0, 0, 0, 0.1)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Button
            icon="plus"
            circular
            onClick={() => setOpenAddRowModal(true)}
          />
        </div>
      )}
    </div>
  );
};
