from enum import Enum


class FileTypeEnum(str, Enum):
    PDF = "pdf"
    TXT = "txt"
    DOCX = "docx"
    # HTML = "html"  # Removed as we don't support it
    # Add more as needed

    @classmethod
    def from_mimetype(cls, mimetype: str) -> "FileTypeEnum":
        """
        Convert a MIME type to a FileTypeEnum.

        Args:
            mimetype: The MIME type to convert

        Returns:
            The corresponding FileTypeEnum, or None if not found
        """
        mime_to_enum = {
            "application/pdf": cls.PDF,
            "text/plain": cls.TXT,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": cls.DOCX,
            # "text/html": cls.HTML,  # Removed as we don't support it
        }

        return mime_to_enum.get(mimetype)
