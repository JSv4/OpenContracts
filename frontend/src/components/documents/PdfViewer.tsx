import { Modal, Button, Icon, Statistic } from "semantic-ui-react";
import { useState } from "react";
import { pdfjs, Document, Page, Outline } from "react-pdf";
import {
  HorizontallyCenteredDiv,
  VerticallyCenteredDiv,
} from "../layout/Wrappers";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export function PdfViewer({
  url,
  opened,
  toggleModal,
}: {
  url: string;
  opened: boolean;
  toggleModal: () => void;
}) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  function changePage(offset: number) {
    setPageNumber((prevPageNumber) => prevPageNumber + offset);
  }

  function previousPage() {
    changePage(-1);
  }

  function nextPage() {
    changePage(1);
  }

  function onItemClick({ pageNumber }: { pageNumber: string }) {
    setPageNumber(parseInt(pageNumber));
  }

  return (
    <Modal
      closeIcon
      onClose={() => toggleModal()}
      open={opened}
      style={{ padding: "1rem" }}
    >
      {url ? (
        <div
          style={{
            position: "absolute",
            right: "2rem",
            top: "2rem",
            zIndex: 10000,
          }}
        >
          <Button circular onClick={() => window.open(url)}>
            <Icon name="download" /> Save
          </Button>
        </div>
      ) : (
        <></>
      )}
      <div style={{ position: "absolute", left: "2rem", bottom: "2rem" }}>
        <Statistic size="mini">
          <Statistic.Label>Page</Statistic.Label>
          <Statistic.Value>
            {pageNumber || (numPages ? 1 : "--")} of {numPages || "--"}
          </Statistic.Value>
        </Statistic>
      </div>
      <HorizontallyCenteredDiv>
        <VerticallyCenteredDiv>
          <Document file={url} onLoadSuccess={onDocumentLoadSuccess}>
            <Page pageNumber={pageNumber} />
          </Document>
          <HorizontallyCenteredDiv>
            <Button.Group>
              <Button
                content="Previouw"
                icon="left arrow"
                labelPosition="left"
                disabled={pageNumber <= 1}
                onClick={previousPage}
              />
              <Button
                content="Next"
                icon="right arrow"
                labelPosition="right"
                disabled={numPages !== null && pageNumber >= numPages}
                onClick={nextPage}
              />
            </Button.Group>
          </HorizontallyCenteredDiv>
        </VerticallyCenteredDiv>
      </HorizontallyCenteredDiv>
    </Modal>
  );
}
