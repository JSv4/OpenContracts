import pathlib

from .factories import generate_random_analyzer_return_values

SAMPLE_GREMLIN_ENGINE_MANIFEST_PATH = (
    pathlib.Path(__file__).parent / "sample_gremlin_engine_analyzer_manifest.json"
)

SAMPLE_GREMLIN_OUTPUT_FOR_PUBLIC_DOCS = (
    pathlib.Path(__file__).parent / "sample_gremlin_engine_output_for_public_docs.json"
)

SAMPLE_PAWLS_FILE_ONE_PATH = (
    pathlib.Path(__file__).parent
    / "EtonPharmaceuticalsInc_20191114_10-Q_EX-10_1_11893941_EX-10_1_Development_Agreement_ZrZJLLv.json"
)

SAMPLE_TXT_FILE_ONE_PATH = (
    pathlib.Path(__file__).parent
    / "EtonPharmaceuticalsInc_20191114_10-Q_EX-10_1_11893941_EX-10_1_Development_Agreement_ZrZJLLv.txt"
)

SAMPLE_PDF_FILE_ONE_PATH = (
    pathlib.Path(__file__).parent
    / "EtonPharmaceuticalsInc_20191114_10-Q_EX-10.1_11893941_EX-10.1_Development_"
    "Agreement_ZrZJLLv.pdf"
)

# files for nlm ingestor pipeline test
NLM_INGESTOR_SAMPLE_PDF = pathlib.Path(__file__).parent / "sample.pdf"
NLM_INGESTOR_SAMPLE_PDF_NEEDS_OCR = pathlib.Path(__file__).parent / "needs_ocr.pdf"
NLM_INGESTOR_EXPECTED_JSON = (
    pathlib.Path(__file__).parent / "nlm_ingestor_output_for_sample_pdf.json"
)

SAMPLE_PDF_FILE_TWO_PATH = pathlib.Path(__file__).parent / "USC Title 1 - CHAPTER 1.pdf"


def create_mock_submission_response(analyzer_id: int):
    return {
        "id": 0,
        "analyzer_id": analyzer_id,
        "status": "CREATED",
        "started": "2022-08-12T04:48:58.943Z",
        "finished": None,
        "error_message": "",
        "callback_url": "no url provided for test",
        "callback_success": True,
    }
