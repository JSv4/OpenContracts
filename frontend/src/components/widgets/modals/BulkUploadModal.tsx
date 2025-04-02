// frontend/src/components/widgets/modals/BulkUploadModal.tsx
import { useState, useCallback } from "react";
import { useMutation, useReactiveVar } from "@apollo/client";
import { Modal, Button, Form, Message, Progress } from "semantic-ui-react";
import { toast } from "react-toastify";
import { gql } from "@apollo/client"; // Import gql

import { showBulkUploadModal, filterToCorpus } from "../../../graphql/cache";

// Define the mutation GraphQL string
const UPLOAD_DOCUMENTS_ZIP = gql`
  mutation UploadDocumentsZip(
    $base64FileString: String!
    $makePublic: Boolean!
    $addToCorpusId: ID
    $titlePrefix: String
    $description: String
  ) {
    uploadDocumentsZip(
      base64FileString: $base64FileString
      makePublic: $makePublic
      addToCorpusId: $addToCorpusId
      titlePrefix: $titlePrefix
      description: $description
    ) {
      ok
      message
      jobId
    }
  }
`;

// Define types for mutation variables and output
interface UploadDocumentsZipVars {
  base64FileString: string;
  makePublic: boolean; // Assuming default public for simplicity, can add checkbox
  addToCorpusId?: string | null;
  titlePrefix?: string;
  description?: string;
}

interface UploadDocumentsZipOutput {
  uploadDocumentsZip: {
    ok: boolean;
    message: string;
    jobId?: string;
  };
}

export const BulkUploadModal = () => {
  const visible = useReactiveVar(showBulkUploadModal);
  const currentCorpus = useReactiveVar(filterToCorpus); // Optional: Upload directly to current corpus

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [base64File, setBase64File] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0); // For potential future progress bar
  const [error, setError] = useState<string | null>(null);

  const [uploadZipMutation] = useMutation<
    UploadDocumentsZipOutput,
    UploadDocumentsZipVars
  >(UPLOAD_DOCUMENTS_ZIP);

  const handleClose = () => {
    setSelectedFile(null);
    setBase64File(null);
    setLoading(false);
    setError(null);
    setUploadProgress(0);
    showBulkUploadModal(false);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null); // Clear previous errors
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === "application/zip" || file.name.endsWith(".zip")) {
        setSelectedFile(file);
        // Convert file to Base64
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1]; // Remove "data:mime/type;base64," part
          setBase64File(base64);
        };
        reader.onerror = (error) => {
          console.error("Error reading file:", error);
          setError("Failed to read the selected file.");
          setSelectedFile(null);
          setBase64File(null);
        };
      } else {
        setError("Invalid file type. Please select a .zip file.");
        setSelectedFile(null);
        setBase64File(null);
      }
    }
  };

  const handleSubmit = async () => {
    if (!base64File) {
      setError("No file selected or file could not be read.");
      return;
    }

    setLoading(true);
    setError(null);
    setUploadProgress(50); // Indicate processing started

    try {
      const result = await uploadZipMutation({
        variables: {
          base64FileString: base64File,
          makePublic: true, // Or get from a checkbox
          addToCorpusId: currentCorpus?.id ?? null, // Add to current corpus if one is selected
        },
      });

      setUploadProgress(100);

      if (result.data?.uploadDocumentsZip.ok) {
        toast.success(
          `Upload started successfully! Job ID: ${result.data.uploadDocumentsZip.jobId}`
        );
        handleClose(); // Close modal on success
      } else {
        throw new Error(
          result.data?.uploadDocumentsZip.message || "Upload failed."
        );
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setError(err.message || "An unexpected error occurred during upload.");
      toast.error(`Upload failed: ${err.message}`);
      setUploadProgress(0); // Reset progress on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={visible} onClose={handleClose} size="tiny">
      <Modal.Header>Bulk Upload Documents (.zip)</Modal.Header>
      <Modal.Content>
        <Form loading={loading} error={!!error}>
          <Message
            error
            header="Upload Error"
            content={error}
            onDismiss={() => setError(null)}
          />
          <Form.Field>
            <label>Select Zip File</label>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileChange}
              disabled={loading}
            />
            {selectedFile && <p>Selected: {selectedFile.name}</p>}
          </Form.Field>
          {/* Optional: Add fields for title prefix, description, make public checkbox */}
          {currentCorpus && (
            <Message info size="mini">
              Documents will be added to the currently selected corpus:{" "}
              <strong>{currentCorpus.title}</strong>
            </Message>
          )}
          {loading && (
            <Progress
              percent={uploadProgress}
              indicating
              progress
              size="small"
            />
          )}
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          primary
          onClick={handleSubmit}
          disabled={!selectedFile || !base64File || loading}
          loading={loading}
        >
          Upload
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
