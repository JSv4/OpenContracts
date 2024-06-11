from pydantic import BaseModel
from django.test import TestCase

from opencontractserver.utils.etl import parse_model_or_primitive


class ParseModelOrPrimitiveTestCase(TestCase):
    def test_parse_model(self):
        model_string = '''
        name: str
        age: int
        email: str
        '''
        parsed_model = parse_model_or_primitive(model_string)
        self.assertTrue(issubclass(parsed_model, BaseModel))
        self.assertEqual(parsed_model.__fields__.keys(), {'name', 'age', 'email'})

    def test_parse_int_type(self):
        primitive_type_string = "int"
        parsed_type = parse_model_or_primitive(primitive_type_string)
        self.assertEqual(parsed_type, int)

    def test_parse_float_type(self):
        primitive_type_string = "float"
        parsed_type = parse_model_or_primitive(primitive_type_string)
        self.assertEqual(parsed_type, float)

    def test_parse_str_type(self):
        primitive_type_string = "str"
        parsed_type = parse_model_or_primitive(primitive_type_string)
        self.assertEqual(parsed_type, str)

    def test_parse_bool_type(self):
        primitive_type_string = "bool"
        parsed_type = parse_model_or_primitive(primitive_type_string)
        self.assertEqual(parsed_type, bool)

    def test_invalid_model_string_default_value(self):
        invalid_model_string = '''
        name: str
        age: int = 25
        email: str
        '''
        with self.assertRaisesMessage(ValueError, "We don't support default values, sorry."):
            parse_model_or_primitive(invalid_model_string)

    def test_invalid_model_string_missing_type(self):
        invalid_model_string = '''
        name: str
        age
        email: str
        '''
        with self.assertRaisesMessage(ValueError, "Every property needs to be typed!"):
            parse_model_or_primitive(invalid_model_string)

    def test_invalid_model_string_syntax_error(self):
        invalid_model_string = '''
        name: str
        age: int: 25
        email: str
        '''
        with self.assertRaisesRegex(ValueError, r"There is an error in line \d+ your model"):
            parse_model_or_primitive(invalid_model_string)

    def test_invalid_primitive_type(self):
        invalid_primitive_type = "invalid"
        with self.assertRaisesMessage(ValueError, "Invalid model or primitive type: invalid"):
            parse_model_or_primitive(invalid_primitive_type)
