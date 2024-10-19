import re


def only_alphanumeric_chars(raw_str: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", raw_str)
