import os
import tempfile
import unittest

from opencontractserver.utils.files import is_plaintext_content


class TestPlaintextDetector(unittest.TestCase):
    def create_temp_file(self, content):
        fd, path = tempfile.mkstemp()
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(content)
        return path

    def test_plaintext_file(self):
        content = b"This is a plaintext file.\nIt contains normal text."
        path = self.create_temp_file(content)
        self.assertTrue(is_plaintext_content(content))
        os.remove(path)

    def test_binary_file(self):
        content = bytes([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD])
        path = self.create_temp_file(content)
        self.assertFalse(is_plaintext_content(content))
        os.remove(path)

    def test_mixed_content_file(self):
        content = b"Some text\x00\x01\x02\x03More text"
        path = self.create_temp_file(content)
        self.assertTrue(is_plaintext_content(content))
        os.remove(path)

    def test_empty_file(self):
        content = b""
        path = self.create_temp_file(content)
        self.assertFalse(is_plaintext_content(content))
        os.remove(path)

    def test_nonexistent_file(self):
        self.assertFalse(is_plaintext_content("nonexistent_file.txt"))

    def test_plaintext_content(self):
        content = b"This is a plaintext file.\nIt contains normal text."
        self.assertTrue(is_plaintext_content(content))

    def test_binary_content(self):
        content = bytes([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD])
        self.assertFalse(is_plaintext_content(content))

    def test_mixed_content(self):
        content = b"Some text\x00\x01\x02\x03More text"
        self.assertTrue(is_plaintext_content(content))

    def test_empty_content(self):
        content = b""
        self.assertFalse(is_plaintext_content(content))

    def test_custom_sample_size_and_threshold(self):
        content = b"A" * 500 + bytes([0x00] * 500)
        self.assertTrue(is_plaintext_content(content, sample_size=1000, threshold=0.4))
        self.assertFalse(is_plaintext_content(content, sample_size=1000, threshold=0.6))


if __name__ == "__main__":
    unittest.main()
