import io

from django.contrib.auth import get_user_model
from django.test import TestCase
from docx import Document
from graphene.test import Client
from graphql_relay import from_global_id
from openpyxl import Workbook
from pptx import Presentation

from config.graphql.schema import schema
from opencontractserver.documents.models import Document as DocumentModel
from opencontractserver.utils.files import base_64_encode_bytes

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class UploadDocumentMutationTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))
        self.mutation = """
            mutation UploadDocument(
                $file: String!,
                $filename: String!,
                $title: String!,
                $description: String!,
                $customMeta: GenericScalar!,
                $addToCorpusId: ID,
                $makePublic: Boolean!
            ) {
                uploadDocument(
                    base64FileString: $file,
                    filename: $filename,
                    title: $title,
                    description: $description,
                    customMeta: $customMeta,
                    addToCorpusId: $addToCorpusId,
                    makePublic: $makePublic
                ) {
                    ok
                    message
                    document {
                        id
                        title
                        fileType
                    }
                }
            }
        """

    def generate_file_content(self, file_type):
        if file_type == "pdf":
            return b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n"
        elif file_type == "docx":
            buffer = io.BytesIO()
            doc = Document()
            doc.add_paragraph("This is a test DOCX file.")
            doc.save(buffer)
            return buffer.getvalue()
        elif file_type == "xlsx":
            buffer = io.BytesIO()
            wb = Workbook()
            ws = wb.active
            ws["A1"] = "This is a test XLSX file."
            wb.save(buffer)
            return buffer.getvalue()
        elif file_type == "pptx":
            buffer = io.BytesIO()
            prs = Presentation()
            slide = prs.slides.add_slide(prs.slide_layouts[0])
            title = slide.shapes.title
            title.text = "This is a test PPTX file."
            prs.save(buffer)
            return buffer.getvalue()
        elif file_type == "txt":
            return b"This is a text file."

    def test_upload_document(self):
        file_types = {
            "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "txt": "application/txt",
            "txt": "text/plain",
        }

        for file_type, mime_type in file_types.items():
            with self.subTest(file_type=file_type):
                file_content = self.generate_file_content(file_type)
                base64_content = base_64_encode_bytes(file_content)

                result = self.client.execute(
                    self.mutation,
                    variables={
                        "file": base64_content,
                        "filename": f"test.{file_type}",
                        "title": f"Test {file_type.upper()}",
                        "description": f"A test {file_type.upper()} file",
                        "makePublic": True,
                        "customMeta": {},
                    },
                )

                print(f"Result: {result}")
                self.assertIsNone(result.get("errors"))

                if file_type in ["pdf", "docx", "pptx", "xlsx"]:
                    self.assertTrue(result["data"]["uploadDocument"]["ok"])
                    self.assertEqual(
                        result["data"]["uploadDocument"]["message"], "Success"
                    )
                    self.assertEqual(
                        result["data"]["uploadDocument"]["document"]["title"],
                        f"Test {file_type.upper()}",
                    )
                    self.assertEqual(
                        result["data"]["uploadDocument"]["document"]["fileType"],
                        mime_type,
                    )

                    # Verify the document was actually created in the database
                    doc_id = result["data"]["uploadDocument"]["document"]["id"]
                    doc = DocumentModel.objects.get(id=from_global_id(doc_id)[1])
                    self.assertEqual(doc.title, f"Test {file_type.upper()}")
                    self.assertEqual(doc.file_type, mime_type)
                    self.assertEqual(doc.creator, self.user)
                    self.assertTrue(doc.is_public)

                    if file_type == "txt":
                        self.assertFalse(
                            bool(doc.pdf_file)
                        )  # Check if pdf_file is empty
                        self.assertTrue(
                            bool(doc.txt_extract_file)
                        )  # Check if txt_extract_file is not empty
                    else:
                        self.assertTrue(
                            bool(doc.pdf_file)
                        )  # Check if pdf_file is not empty
                        self.assertFalse(
                            bool(doc.txt_extract_file)
                        )  # Check if txt_extract_file is empty

                else:  # txt file
                    self.assertTrue(result["data"]["uploadDocument"]["ok"])

    def tearDown(self):
        # Clean up any files created during the test
        DocumentModel.objects.all().delete()
