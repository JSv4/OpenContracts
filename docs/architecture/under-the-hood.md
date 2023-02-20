## Data Layers

OpenContracts builds on the work that AllenAI did with [PAWLs](https://github.com/allenai/pawls) to create a consistent
shared source of truth for data labeling and NLP algorithms, regardless of whether they are layout-aware, like
LayoutLM or not, like BERT, Spacy or LexNLP. One of the challenges with natural language documents, particularly contracts
is there are so many ways to structure any given file (e.g. .docx or .pdf) to represent exactly the same text. Even an
identical document with identical formatting in a format like .pdf can have a significantly different file structure
depending on what software was used to create it, the user's choices, and the software's own choices in deciding how to
structure its output.

PAWLs and OpenContracts attempt to solve this by sending every document through a processing pipeline that provides a uniform
and consistent way of extracting and structuring text and layout information. Using the parsing engine of [Grobid](https://grobid.readthedocs.io/en/latest/)
and the open source OCR engine [Tesseract](https://github.com/tesseract-ocr/tesseract), every single document is re-OCRed
(to produce a consistent output for the same inputs) and then the "tokens" (text surrounded on all sides by whitespace -
typically a word) in the OCRed document are stored as JSONs with their page and positional information. In OpenContracts, we
refer to this JSON layer that combines text and positional data as the "PAWLs" layer. We use the PAWLs layer to build the
full text extract from the document as well and store this as the "text layer".

Thus, in OpenContracts, every document has three files associated with it - the original pdf, a json file (the "PAWLs layer"),
and a text file (the "text layer"). Because the text layer is built from the PAWLs layer, we can easily translate back and
forth from text to positional information - e.g. given the start and end of a span of text the text layer, we can accurately
say which PAWLs tokens the span includes, and, based on that, the x,y position of the span in the document.

This lets us take the outputs of many NLP libraries which typically produce only start and stop ranges and layer them perfectly
on top of the original pdf. With the PAWLs tokens as the source of truth, we can seamlessly transition from text only to layout-aware
text.

## Limitations

OCR is not perfect. By only accepting pdf inputs and OCRing every document, we do ignore any text embedded in the pdf. To
the extent that text was exported accurately from whatever tool was used to write the document, this introduces some potential
loss of fidelity - e.g. if you've ever seen an OCR engine mistake an 'O' or a 0 or 'I' for a '1' or something like that.
Typically, however, the instance of such errors is fairly small, and it's a price we have to pay for the power of being able to
effortlessly layer NLP outputs that have no layout awareness on top of complex, visual layouts.
