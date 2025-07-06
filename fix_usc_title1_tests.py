"""Script to update test questions in test_structured_response_api.py for USC Title 1."""

import re

# Read the test file
with open("opencontractserver/tests/test_structured_response_api.py") as f:
    content = f.read()

# Define replacements for each test
replacements = [
    # Float test
    (
        r'"What is the total monetary value mentioned in this document\? Return just the number\."',
        "\"Extract the chapter number of 'ACTS AND RESOLUTIONS; FORMALITIES OF ENACTMENT...' as a float.\"",
    ),
    # Boolean test
    (
        r'"Does this document contain confidentiality clauses\?"',
        '"Does this document establish the process for presidential impeachment?"',
    ),
    # List test
    (
        r'"List the main sections or headings in this document\."',
        '"Extract a list of the terms that Section 1 defines as being included '
        "under the words 'person' and 'whoever'.\"",
    ),
    # Contract dates test
    (
        r'"Extract all important dates from this contract\."',
        "\"Extract the enactment date of the 'Born-Alive Infants Protection Act of 2002'.\"",
    ),
    # Contract parties test
    (
        r'"Identify all parties to this contract with their roles\."',
        '"Extract a list of any private corporations or associations named as parties in this legal text."',
    ),
    # Payment terms test
    (
        r'"Extract all payment terms from this document\."',
        '"Extract a list of any payment schedules or financial obligations mentioned in the text."',
    ),
    # Comprehensive analysis test
    (
        r'"Provide a comprehensive analysis of this contract\."',
        "\"Perform a comprehensive analysis of the 'Respect for Marriage Act' amendment to Section 7. Extract its "
        'public law number, the year it was amended, and a summary of the change."',
    ),
    # Custom model test
    (
        r'"Summarize this document in one sentence\."',
        '"Summarize the amendment made by Pub. L. 112-231."',
    ),
    # Max tokens test
    (
        r'"Describe this document\."',
        "\"Extract the definition of 'person' with a very small max_tokens limit.\"",
    ),
    # Verification behavior test - need to update the prompt
    (
        r'"Extract financial and signature information from this document"',
        '"Based on the text of Title 1, extract the total monetary penalty specified '
        'and its currency. The text contains no monetary values."',
    ),
    # Convenience API test
    (
        r'"Summarize this document"',
        "\"Get a structured response summarizing the rule for 'writs of error'.\"",
    ),
    # Corpus insights test
    (
        r'"Analyze this corpus and provide high-level insights\."',
        '"From a corpus containing Title 1 and other legal documents, extract high-level insights about statutory interpretation."',  # noqa: E501
    ),
    # Corpus statistics test
    (
        r'"Calculate statistics for this document collection\."',
        '"Extract basic statistics about a corpus of legal documents including Title 1."',
    ),
    # Convenience with overrides test
    (
        r'"What is the square root of 16\?"',
        "\"Using all available overrides (custom prompt, LLM, embedder, etc.), ask the model to act as a child and explain what the 'Born-Alive Infants Protection Act of 2002' does.\"",  # noqa: E501
    ),
    # No conversation persistence test
    (r'"What color is the sky\?"', "\"Extract the definition of 'vehicle'.\""),
    (r'"What color is grass\?"', "\"Extract the definition of 'county'.\""),
    # Multiple extractions test
    (r'"Extract the title"', "\"Extract the definition of 'writing'.\""),
    (r'"Extract the first paragraph"', "\"Extract the definition of 'oath'.\""),
    # Nested pydantic test
    (
        r'"Extract information about the main company mentioned"',
        "\"Extract information about the 'Respect for Marriage Act' into a nested model that includes details about its enactment year and findings.\"",  # noqa: E501
    ),
    # Optional fields test
    (
        r'"Extract document metadata"',
        "\"Extract metadata about the '21st Century Language Act of 2012'. The model has optional fields for 'sponsor' and 'committee'.\"",  # noqa: E501
    ),
    # Enum extraction test
    (
        r'"What type of document is this\?"',
        "\"Classify the legal status of this title based on the introductory notes. Use an enum of 'POSITIVE_LAW', 'PROPOSED_BILL', or 'REPEALED'.\"",  # noqa: E501
    ),
    # Concurrent extractions test
    (r'"Extract the title"', '"The official citation format for this title"'),
    (r'"Count the pages"', '"The number of sections defined in Chapter 1"'),
    (r'"Is this a contract\?"', '"Whether this document is the US Constitution"'),
    (
        r'"List parties involved"',
        "\"A list of terms defined under the 'Rules of Construction' in Section 1\"",
    ),
    # Contact info test
    (
        r'"Extract all contact information from this document"',
        '"Extract contact information (phone, email) for the enactor of this title. The text contains none."',
    ),
    # Custom vs default prompt test
    (
        r'"What type of document is this and how accurate is your assessment\?"',
        '"Using a custom prompt for a legal scholar, identify the primary purpose of this text and the legal principle it establishes."',  # noqa: E501
    ),
    # Placeholder values test
    (
        r'"Extract all contact information from this document"',
        '"Extract contact information (phone, email) for the enactor of this title. The text contains none."',
    ),
]

# Apply replacements
for old_pattern, new_text in replacements:
    content = re.sub(old_pattern, new_text, content)

# Fix the verification test assertions
content = re.sub(
    r"assert len\(result\.currency\) == 3  # Valid currency code",
    'assert result.currency == "" or result.currency is None or len(result.currency) == 3',
    content,
)

content = re.sub(
    r"assert result\.parties_count > 0  # At least one party",
    "assert result.parties_count >= 0  # May be 0 for this document type",
    content,
)

# Fix the integer test assertion
content = re.sub(
    r"assert result > 0$",
    "assert result == 2  # County is defined in Section 2",
    content,
    flags=re.MULTILINE,
)

# Fix the float test assertion
content = re.sub(
    r"assert isinstance\(result, float\) or result is None$",
    "assert isinstance(result, float) or result is None\n        if result:\n            assert result == 2.0  # Chapter 2",  # noqa: E501
    content,
    flags=re.MULTILINE,
)

# Fix list test assertion
content = re.sub(
    r"assert all\(isinstance\(item, str\) for item in result\)$",
    'assert all(isinstance(item, str) for item in result)\n            # Should include corporations, companies, associations, etc.\n            assert any("corporation" in item.lower() for item in result)',  # noqa: E501
    content,
    flags=re.MULTILINE,
)

# Write the updated content
with open("opencontractserver/tests/test_structured_response_api.py", "w") as f:
    f.write(content)

print("Test file updated successfully!")
