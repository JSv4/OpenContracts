# Export / Import Functionality

## Exports

OpenContracts support both exporting and importing corpuses. This functionality is disabled on the public
demo as it can be bandwidth intensive. If you want to experiment with these features on your own, you'll see
the export action when you right-click on a corpus:

![](../../assets/images/screenshots/Corpus_Context_Menu.png)

You can access your exports from the user dropdown menu in the top right corner of the screen. Once your
export is complete, you should be able to download a zip containing all the documents, their PAWLs layers, and
the corpus data you created - including all annotations.

## Imports

If you've enabled corpus imports (see the **frontend** env file for the boolean toggle to do this - it's
`REACT_APP_ALLOW_IMPORTS`), you'll see an import action when you click the action button on the corpus page.

# Export Format

## OpenContracts Export Format Specification

The OpenContracts export is a zip archive containing:
1. A `data.json` file with metadata about the export 
2. The original PDF documents
3. Exported annotations "burned in" to the PDF documents

### data.json Format

The `data.json` file contains a JSON object with the following fields:

* `annotated_docs` (dict): Maps PDF filenames to OpenContractDocExport objects with annotations for that document.

* `doc_labels` (dict): Maps document label names (strings) to AnnotationLabelPythonType objects defining those labels.

* `text_labels` (dict): Maps text annotation label names (strings) to AnnotationLabelPythonType objects defining those labels.

* `corpus` (OpenContractCorpusType): Metadata about the exported corpus, with fields:
    - `id` (int): ID of the corpus
    - `title` (string)  
    - `description` (string)
    - `icon_name` (string): Filename of the corpus icon image
    - `icon_data` (string): Base64 encoded icon image data
    - `creator` (string): Email of the corpus creator
    - `label_set` (string): ID of the labelset used by this corpus
        
* `label_set` (OpenContractsLabelSetType): Metadata about the label set, with fields:
    - `id` (int)
    - `title` (string)  
    - `description` (string)
    - `icon_name` (string): Filename of the labelset icon
    - `icon_data` (string): Base64 encoded labelset icon data 
    - `creator` (string): Email of the labelset creator


### OpenContractDocExport Format

Each document in `annotated_docs` is represented by an OpenContractDocExport object with fields:

* `doc_labels` (list[string]): List of document label names applied to this doc
* `labelled_text` (list[OpenContractsAnnotationPythonType]): List of text annotations
* `title` (string): Document title
* `content` (string): Full text content of the document  
* `description` (string): Description of the document
* `pawls_file_content` (list[PawlsPagePythonType]): PAWLS parse data for each page
* `page_count` (int): Number of pages in the document

### OpenContractsAnnotationPythonType Format

Represents an individual text annotation, with fields:

* `id` (string): Optional ID 
* `annotationLabel` (string): Name of the label for this annotation
* `rawText` (string): Raw text content of the annotation
* `page` (int): 0-based page number the annotation is on 
* `annotation_json` (dict): Maps page numbers to OpenContractsSinglePageAnnotationType

### OpenContractsSinglePageAnnotationType Format

Represents the annotation data for a single page:

* `bounds` (BoundingBoxPythonType): Bounding box of the annotation on the page
* `tokensJsons` (list[TokenIdPythonType]): List of PAWLS tokens covered by the annotation
* `rawText` (string): Raw text of the annotation on this page

### BoundingBoxPythonType Format

Represents a bounding box with fields:

* `top` (int)
* `bottom` (int)  
* `left` (int)
* `right` (int)

### TokenIdPythonType Format  

References a PAWLS token by page and token index:

* `pageIndex` (int)
* `tokenIndex` (int)

### PawlsPagePythonType Format

Represents PAWLS parse data for a single page:

* `page` (PawlsPageBoundaryPythonType): Page boundary info
* `tokens` (list[PawlsTokenPythonType]): List of PAWLS tokens on the page

### PawlsPageBoundaryPythonType Format

Represents the page boundary with fields:  

* `width` (float)
* `height` (float)
* `index` (int): Page index

### PawlsTokenPythonType Format

Represents a single PAWLS token with fields:

* `x` (float): X-coordinate of token box 
* `y` (float): Y-coordinate of token box
* `width` (float): Width of token box
* `height` (float): Height of token box  
* `text` (string): Text content of the token

### AnnotationLabelPythonType Format

Defines an annotation label with fields:

* `id` (string)
* `color` (string): Hex color for the label 
* `description` (string) 
* `icon` (string): Icon name
* `text` (string): Label text
* `label_type` (LabelType): One of DOC_TYPE_LABEL, TOKEN_LABEL, RELATIONSHIP_LABEL, METADATA_LABEL

### Example data.json 
```json
{
  "annotated_docs": {
    "document1.pdf": {
      "doc_labels": ["Contract", "NDA"],
      "labelled_text": [
        {
          "id": "1",
          "annotationLabel": "Effective Date",
          "rawText": "This agreement is effective as of January 1, 2023",
          "page": 0,
          "annotation_json": {
            "0": {
              "bounds": {
                "top": 100,
                "bottom": 120,
                "left": 50,
                "right": 500
              },
              "tokensJsons": [
                {
                  "pageIndex": 0,
                  "tokenIndex": 5
                },
                {
                  "pageIndex": 0,
                  "tokenIndex": 6
                }
              ],
              "rawText": "January 1, 2023"
            }
          }
        }
      ],
      "title": "Nondisclosure Agreement",
      "content": "This Nondisclosure Agreement is made...",
      "description": "Standard mutual NDA",
      "pawls_file_content": [
        {
          "page": {
            "width": 612,
            "height": 792,
            "index": 0
          },
          "tokens": [
            {
              "x": 50,
              "y": 100,
              "width": 60,
              "height": 10,
              "text": "This"
            },
            {
              "x": 120,
              "y": 100,
              "width": 100,
              "height": 10,
              "text": "agreement"
            }
          ]
        }
      ],
      "page_count": 5
    }
  },
  "doc_labels": {
    "Contract": {
      "id": "1",
      "color": "#FF0000",
      "description": "Indicates a legal contract",
      "icon": "contract",
      "text": "Contract",
      "label_type": "DOC_TYPE_LABEL"
    },
    "NDA": {
      "id": "2", 
      "color": "#00FF00",
      "description": "Indicates a non-disclosure agreement",
      "icon": "nda",
      "text": "NDA",
      "label_type": "DOC_TYPE_LABEL"
    }
  },
  "text_labels": {
    "Effective Date": {
      "id": "3",
      "color": "#0000FF",
      "description": "The effective date of the agreement",
      "icon": "calendar",
      "text": "Effective Date",
      "label_type": "TOKEN_LABEL"
    }
  },
  "corpus": {
    "id": 1,
    "title": "Example Corpus",
    "description": "A sample corpus for demonstration",
    "icon_name": "corpus_icon.png",
    "icon_data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==",
    "creator": "user@example.com",
    "label_set": "4"
  },
  "label_set": {
    "id": "4",
    "title": "Example Label Set",  
    "description": "A sample label set",
    "icon_name": "label_icon.png",
    "icon_data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==",
    "creator":  "user@example.com"
  }
}
```

This `data.json` file includes:

- One annotated document (`document1.pdf`) with two document labels ("Contract" and "NDA") and one text annotation for the "Effective Date"
- Definitions for the two document labels ("Contract" and "NDA") and one text label ("Effective Date")
- Metadata about the exported corpus and labelset, including Base64 encoded icon data

The PAWLS token data and text content are truncated for brevity. In a real export, the `pawls_file_content` would include the complete token data for each page, and `content` would contain the full extracted text of the document.

Let me know if you have any other questions!
