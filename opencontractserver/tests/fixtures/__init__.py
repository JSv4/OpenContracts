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

SAMPLE_PDF_FILE_TWO_PATH = pathlib.Path(__file__).parent / "USC Title 1 - CHAPTER 1.pdf"

PUBLIC_PDF_URL_LIST = pathlib.Path(__file__).parent / "test_pdf_file_urls.txt"


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


def get_valid_pdf_urls():
    with PUBLIC_PDF_URL_LIST.open() as f:
        file_str = f.read()
    file_list = [x for x in file_str.split("\n") if x]
    return file_list
