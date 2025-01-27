import re


def extract_document_id(path: str) -> str:
    print(f"Extract document id from path: {path}")
    match = re.match(r"^/?ws/document/(?P<document_id>[-a-zA-Z0-9_=]+)/query/$", path)
    if match:
        return match.group("document_id")
    else:
        raise ValueError(f"Invalid path format: {path}")
