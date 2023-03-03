import { ApolloError, useMutation, useReactiveVar } from "@apollo/client";
import React, { SyntheticEvent, useState } from "react";
import { toast } from "react-toastify";
import {
  Button,
  Dropdown,
  DropdownProps,
  Modal,
  Message,
  Divider,
  Header,
} from "semantic-ui-react";
import { exportingCorpus } from "../../../graphql/cache";
import {
  StartExportCorpusInputs,
  StartExportCorpusOutputs,
  START_EXPORT_CORPUS,
} from "../../../graphql/mutations";
import { ExportTypes } from "../../types";

import langchain_icon from "../../../assets/icons/langchain.png";
import open_contracts_icon from "../../../assets/icons/oc_45_dark.png";

export function SelectExportTypeModal({ visible }: { visible: boolean }) {
  const exporting_corpus = useReactiveVar(exportingCorpus);
  const [exportFormat, setExportFormat] = useState<ExportTypes>(
    ExportTypes.OPEN_CONTRACTS
  );

  const [startExportCorpus, {}] = useMutation<
    StartExportCorpusOutputs,
    StartExportCorpusInputs
  >(START_EXPORT_CORPUS, {
    onCompleted: (data) => {
      toast.success(
        "SUCCESS! Export started. Check export status under the user menu dropdown in the top right."
      );
      exportingCorpus(null);
    },
    onError: (err: ApolloError) => {
      toast.error(`Could Not Start Export: ${err}`);
    },
  });

  const triggerCorpusExport = () => {
    if (exporting_corpus) {
      startExportCorpus({
        variables: { corpusId: exporting_corpus?.id, exportFormat },
      });
    }
  };

  const dropdown_options = [
    {
      key: ExportTypes.LANGCHAIN,
      text: "LangChain",
      value: ExportTypes.LANGCHAIN,
      image: { avatar: true, src: langchain_icon },
      disabled: true,
    },
    {
      key: ExportTypes.OPEN_CONTRACTS,
      text: "Open Contracts",
      value: ExportTypes.OPEN_CONTRACTS,
      image: { avatar: true, src: open_contracts_icon },
    },
  ];

  const handleDropdownChange = (
    event: SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => {
    console.log(
      "Handle export type select dropdown selection",
      data.value,
      typeof data.value
    );
    console.log(Object.values<string>(ExportTypes));
    console.log(Object.values<string>(ExportTypes).includes(`${data.value}`));

    if (Object.values<string>(ExportTypes).includes(`${data.value}`)) {
      console.log("pASSED VALIDATION");
      setExportFormat(ExportTypes[`${data.value}` as keyof typeof ExportTypes]);
    }
  };

  return (
    <Modal size="small" open={visible} onClose={() => {}}>
      <Modal.Header>Export Corpus</Modal.Header>
      <Modal.Content>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-start",
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <Message>
              <Message.Header>Export Formats</Message.Header>
              <Message.List
                items={[
                  "LangChain - Get a JSON output that is easily converted to LangChain docs (Coming Soon!).",
                  "OpenContracts - Get a zip archive containing not only annotated pdfs but also the annotation data. This can be used to roundtrip corpuses - export and re-import from one instance to another",
                ]}
              />
            </Message>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                height: "100%",
                marginBottom: "1rem",
              }}
            >
              <div>
                <Header size="small">Choose Export Format:</Header>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <Divider horizontal />

              <Dropdown
                placeholder="Select Export Type"
                options={dropdown_options}
                onChange={handleDropdownChange}
                value={exportFormat}
              />
            </div>
          </div>
        </div>
      </Modal.Content>
      <Modal.Actions>
        <Button negative onClick={() => exportingCorpus(null)}>
          Cancel
        </Button>
        <Button positive onClick={() => triggerCorpusExport()}>
          Start
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
