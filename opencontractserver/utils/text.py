import re


def __consolidate_common_equivalent_chars(string):

    # OCR sometimes uses characters similar to what we're looking for in place of actual char.
    # Here we do some quick, naive cleanup of this by replacing some more exotic chars that look
    # like common chars with their common equivalents.

    # Things that commonly look like apostrophes
    for i in "’'´":
        string = string.replace(i, "'")

    # Things that commonly look like periods
    for i in "⋅":
        string = string.replace(i, ".")

    return string


def only_alphanumeric_chars(raw_str: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", raw_str)
