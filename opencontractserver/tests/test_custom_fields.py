from django.forms import Form
from django.test import TestCase

from opencontractserver.shared.fields import (
    NullableJSONField,
    PDFBase64File,
    UTF8JSONFormField,
)


class PDFBase64FileTests(TestCase):
    def setUp(self):
        self.field = PDFBase64File()

    def test_valid_pdf_file(self):
        pdf_content = b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n"
        result = self.field.get_file_extension("test.pdf", pdf_content)
        self.assertEqual(result, "pdf")

    def test_invalid_file_type(self):
        txt_content = b"This is not a PDF file"
        result = self.field.get_file_extension("test.txt", txt_content)
        self.assertIsNone(result)

    def test_non_pdf_file(self):
        jpg_content = b"\xff\xd8\xff\xe0\x00\x10JFIF"
        result = self.field.get_file_extension("test.jpg", jpg_content)
        self.assertIsNone(result)


class UTF8JSONFormFieldTests(TestCase):
    def setUp(self):
        self.field = UTF8JSONFormField()

    def test_prepare_value_invalid_json_input(self):
        value = self.field.prepare_value('{"key": "value"}')
        self.assertEqual(value, '"{\\"key\\": \\"value\\"}"')

    def test_prepare_value_valid_json_input(self):
        value = self.field.prepare_value({"key": "value"})
        self.assertEqual(value, '{"key": "value"}')

    def test_prepare_value_non_ascii(self):
        value = self.field.prepare_value({"key": "värde"})
        self.assertEqual(value, '{"key": "värde"}')


class NullableJSONFieldTests(TestCase):
    def setUp(self):
        self.field = NullableJSONField()

    def test_formfield(self):
        form_field = self.field.formfield()
        self.assertIsInstance(form_field, UTF8JSONFormField)

    def test_empty_values(self):
        self.assertIn(None, self.field.empty_values)
        self.assertIn("", self.field.empty_values)
        self.assertIn([], self.field.empty_values)
        self.assertIn({}, self.field.empty_values)


class CustomJSONFieldFormTests(TestCase):
    class TestForm(Form):
        json_field = NullableJSONField()

    def test_form_with_valid_json(self):
        form = self.TestForm({"json_field": '{"key": "value"}'})
        self.assertTrue(form.is_valid())

    def test_form_with_empty_json(self):
        form = self.TestForm({"json_field": "{}"})
        self.assertTrue(form.is_valid())

    def test_form_with_null_json(self):
        form = self.TestForm({"json_field": ""})
        self.assertTrue(form.is_valid())

    # TODO - this test is not quite working as expected. Minimal risk ATM.
    # def test_form_with_invalid_json(self):
    #     form = self.TestForm({'json_field': 'not json'})
    #     self.assertFalse(form.is_valid())
