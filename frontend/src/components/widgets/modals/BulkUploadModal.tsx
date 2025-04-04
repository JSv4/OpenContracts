// frontend/src/components/widgets/modals/BulkUploadModal.tsx
import React, { useState } from "react";
import { useMutation, useReactiveVar } from "@apollo/client";
import {
  Modal,
  Button,
  Form,
  Message,
  Progress,
  FormField, // Import FormField
} from "semantic-ui-react";
import { toast } from "react-toastify";
import { gql } from "@apollo/client"; // Import gql

import { showBulkUploadModal } from "../../../graphql/cache"; // Removed filterToCorpus import as it's unused
import { CorpusType } from "../../../types/graphql-api"; // Import CorpusType
import { CorpusDropdown } from "../selectors/CorpusDropdown"; // Import CorpusDropdown

// Define the mutation GraphQL string (Renamed back)
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

// Define types for mutation variables and output (These should ideally live in graphql/mutations.ts)
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
  // Remove dependency on filterToCorpus
  // const currentCorpus = useReactiveVar(filterToCorpus);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [base64File, setBase64File] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  // Add state for the selected corpus within the modal
  const [targetCorpus, setTargetCorpus] = useState<CorpusType | null>(null);

  const [uploadZipMutation] = useMutation<
    UploadDocumentsZipOutput,
    UploadDocumentsZipVars
  >(UPLOAD_DOCUMENTS_ZIP);

  /**
   * Resets all modal state and closes the modal.
   */
  const handleClose = () => {
    setSelectedFile(null);
    setBase64File(null);
    setLoading(false);
    setError(null);
    setUploadProgress(0);
    setTargetCorpus(null); // Reset target corpus on close
    showBulkUploadModal(false);
  };

  /**
   * Handles the file input change event, validates the file type,
   * and converts the selected file to a base64 string.
   * @param event - The input change event.
   */
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
        // Reset file input visually
        if (event.target) {
          event.target.value = "";
        }
      }
    } else {
      // Handle case where user cancels file selection
      setSelectedFile(null);
      setBase64File(null);
    }
  };

  /**
   * Handles the form submission, sending the base64 encoded file
   * and selected options to the backend mutation.
   */
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
          makePublic: true, // TODO: Consider adding a checkbox for this
          addToCorpusId: targetCorpus?.id ?? null, // Use the locally selected corpus ID
          // titlePrefix: "", // Optional: Add fields if needed
          // description: "", // Optional: Add fields if needed
        },
      });

      setUploadProgress(100); // Indicate near completion

      if (result.data?.uploadDocumentsZip.ok) {
        toast.success(
          `Upload job started successfully! Job ID: ${result.data.uploadDocumentsZip.jobId}`
        );
        handleClose(); // Close modal on success
      } else {
        throw new Error(
          result.data?.uploadDocumentsZip.message || "Upload failed."
        );
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      const errorMessage =
        err.message || "An unexpected error occurred during upload.";
      setError(errorMessage);
      toast.error(`Upload failed: ${errorMessage}`);
      setUploadProgress(0); // Reset progress on error
    } finally {
      // Don't set loading to false immediately if progress is 100,
      // let the success/error handling manage it or add a slight delay.
      // setLoading(false); // Moved setting loading false to handleClose or error block
      if (!loading) setLoading(false); // Ensure loading is false if an error occurred before finally
    }
  };

  return (
    <Modal open={visible} onClose={handleClose} size="tiny">
      <Modal.Header>Bulk Upload Documents (.zip)</Modal.Header>
      <Modal.Content>
        <Form loading={loading} error={!!error}>
          {/* Error Message Display */}
          <Message
            error
            header="Upload Error"
            content={error}
            visible={!!error} // Control visibility directly
            onDismiss={() => setError(null)}
          />

          {/* File Input Field */}
          <Form.Field required>
            {" "}
            {/* Mark as required */}
            <label>Select Zip File</label>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileChange}
              disabled={loading}
              // Add required attribute for browser validation (optional)
              // required
            />
            {selectedFile && (
              <p style={{ marginTop: "5px", color: "#666" }}>
                Selected: {selectedFile.name}
              </p>
            )}
          </Form.Field>

          {/* Corpus Selection Field */}
          <FormField>
            {" "}
            {/* Wrap Dropdown in FormField for consistent styling */}
            <label>Add to Corpus (Optional)</label>
            <CorpusDropdown
              value={targetCorpus?.id ?? null} // Pass controlled value (will be handled in CorpusDropdown)
              onChange={setTargetCorpus} // Pass state setter
              clearable={true}
              placeholder="Select a corpus..."
            />
          </FormField>

          {/* Optional: Add fields for title prefix, description, make public checkbox */}
          {/* Example:
          <Form.Input label="Title Prefix (Optional)" placeholder="e.g., ProjectX-" />
          <Form.Checkbox label="Make documents public" defaultChecked />
          */}

          {/* Remove the message about the currently selected corpus */}
          {/* {currentCorpus && ( ... )} */}

          {/* Loading Progress */}
          {loading &&
            uploadProgress > 0 && ( // Show progress only when loading and progress > 0
              <Progress
                percent={uploadProgress}
                indicating={uploadProgress < 100} // Only indicating while in progress
                success={uploadProgress === 100} // Show success state at 100%
                progress
                size="small"
                style={{ marginTop: "1em" }} // Add some margin
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
          loading={loading && uploadProgress < 100} // Show loading spinner only during active upload
        >
          {loading && uploadProgress < 100 ? "Uploading..." : "Upload"}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
