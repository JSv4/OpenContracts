import unittest
from io import BytesIO

from PIL import Image

from opencontractserver.utils.files import create_text_thumbnail


class TestTextThumbnail(unittest.TestCase):
    def test_image_creation(self):
        """Test if the function creates an image"""
        img = create_text_thumbnail("Test")
        self.assertIsInstance(img, Image.Image)

    def test_image_size(self):
        """Test if the created image has the correct size"""
        width, height = 400, 500
        img = create_text_thumbnail("Test", width=width, height=height)
        self.assertEqual(img.size, (width, height))

    def test_text_presence(self):
        """Test if the text is present in the image"""
        text = "Hello, World!"
        img = create_text_thumbnail(text)
        img_bytes = BytesIO()
        img.save(img_bytes, format="PNG")
        img_bytes.seek(0)
        img_loaded = Image.open(img_bytes)

        # Convert image to RGB mode for compatibility
        img_loaded = img_loaded.convert("RGB")

        pixels = list(img_loaded.getdata())
        
        # Check for any non-white pixels instead of just black
        non_white_pixels = [p for p in pixels if p != (255, 255, 255)]
        
        self.assertGreater(
            len(non_white_pixels), 0, 
            "No non-white pixels found, text might be missing"
        )

    def test_empty_text(self):
        """Test if the function handles empty text"""
        img = create_text_thumbnail("")
        self.assertIsInstance(img, Image.Image)

    def test_long_text(self):
        """Test if the function handles very long text"""
        long_text = "This is a very long text. " * 100
        img = create_text_thumbnail(long_text)
        self.assertIsInstance(img, Image.Image)

    def test_custom_font_size(self):
        """Test if the function respects custom font size"""
        img1 = create_text_thumbnail("Test", font_size=12)
        img2 = create_text_thumbnail("Test", font_size=24)
        self.assertNotEqual(list(img1.getdata()), list(img2.getdata()))

    def test_custom_margins(self):
        """Test if the function respects custom margins"""
        img1 = create_text_thumbnail("Test", margin=10)
        img2 = create_text_thumbnail("Test", margin=50)
        self.assertNotEqual(list(img1.getdata()), list(img2.getdata()))


if __name__ == "__main__":
    unittest.main()
