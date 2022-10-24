### Don't Repeat Yourself

OpenContracts is designed not only be a powerful document analysis and annotation platform, it's also envisioned as a
way to embrace the DRY (Don't Repeat Yourself) principle for legal and legal engineering. You can make a corpus, along
with all of its labels, documents and annotations "public" (currently, you must do this via a GraphQL mutation).

Once something is public, it's read-only for everyone other than its original creator. People with read-only access can
"clone" the corpus to create a private copy of the corpus, its documents and its annotations. They can then edit the
annotations, add to them, export them, etc. This lets us work from previous document annotations and re-use labels and
training data.
