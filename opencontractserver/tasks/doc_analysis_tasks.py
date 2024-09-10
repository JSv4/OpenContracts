import marvin
from django.conf import settings

from opencontractserver.shared.decorators import doc_analyzer_task
from opencontractserver.types.dicts import TextSpan

# Pass OpenAI API key to marvin for parsing / extract
marvin.settings.openai.api_key = settings.OPENAI_API_KEY


@doc_analyzer_task()
def contract_not_contract(*args, pdf_text_extract, **kawrgs):
    """
    Uses marvin and gpt 4o to triage contracts vs not contracts.
    """
    print("Contract not contract")
    category = marvin.classify(
        f"INTRODUCTION:\n`{pdf_text_extract[:1000]}`\nCONCLUSION:\n\n`{pdf_text_extract[-1000:]}`",
        instructions="You determine what type of document we're likely looking at based on the introduction and "
        "conclusion - a contract template, a contract, presentation, other",
        labels=["CONTRACT", "CONTRACT TEMPLATE", "PRESENTATION", "OTHER"],
    )

    return [category], [], [], True


@doc_analyzer_task()
def legal_entity_tagger(*args, pdf_text_extract, **kawrgs):
    """
    Use SALI tags plus GLINER plus SPACY sentence splitter to tag legal entities.
    """
    import spacy
    from gliner import GLiNER

    nlp = spacy.load("en_core_web_lg")

    model = GLiNER.from_pretrained("urchade/gliner_base")
    model.set_sampling_params(
        max_types=25,  # maximum number of entity types during training
        shuffle_types=True,  # if shuffle or not entity types
        random_drop=True,  # randomly drop entity types
        max_neg_type_ratio=1,  # ratio of positive/negative types, 1 mean 50%/50%, 2 mean 33%/66%, 3 mean 25%/75% ...
        max_len=2500,  # maximum sentence length
    )

    labels = [
        "Legal Entity",
        "Entity",
        "Business Trust",
        "Cooperative",
        "Corporation",
        "B Corporation",
        "C Corporation",
        "S Corporation",
        "Exempted Company",
        "Governmental Entity",
        "Limited Duration Company",
        "Limited Liability Company",
        "Municipal Corporation",
        "Non-Governmental Organization",
        "Non-Profit Organization",
        "Partnership",
        "Exempted Limited Partnership",
        "General Partnership",
        "Limited Liability Partnership",
        "Limited Partnership",
        "Political Party",
        "Professional Limited Liability Company",
        "Segregated Portfolio Company",
        "Société Anonyme",
        "Société en Commandite Simple",
        "Société à Responsabilité Limitée",
        "Sole Proprietorship",
        "Sovereign State",
        "Trade Union / Labor Union",
        "Entity Groups",
        "Board of Directors",
        "Class",
        "Committees",
        "Ad Hoc/Unofficial Committee",
        "Creditors' Committee",
        "Independent Committee",
        "Official Committee of Creditors",
        "Official Committee of Unsecured Creditors",
        "Joint Defense Group",
        "Joint Defense Group Member",
    ]

    sentences = [i for i in nlp(pdf_text_extract).sents]
    results = []

    for index, sent in enumerate(sentences):
        ents = model.predict_entities(sent.text, labels)
        for e in ents:
            # Rough heuristic - drop anything with score of less than .7. Anecdotally, anything much lower is garbage.
            if e["score"] > 0.7:
                # print(f"Found Entity with suitable score: {e}")
                span = TextSpan(
                    id=str(index),
                    start=sent.start_char + e["start"],
                    end=sent.start_char + e["end"],
                    text=e["text"],
                )
                # print(f"Mapped to span: {span}")
                results.append(
                    (
                        span,
                        str(e["label"]),
                    )
                )
                # print(f"Expected text: {pdf_text_extract[span['start']:span['end']]}")

    return [], results, [], True


@doc_analyzer_task()
def proper_name_tagger(*args, pdf_text_extract, **kawrgs):
    """
    Use Spacy to tag named entities for organizations, geopolitical entities, people and products.
    """

    import spacy

    nlp = spacy.load("en_core_web_sm")
    doc = nlp(pdf_text_extract)

    results = []

    for index, ent in enumerate(
        [ent for ent in doc.ents if ent.label_ in ["ORG", "GPE", "PERSON", "PRODUCT"]]
    ):
        results.append(
            (
                TextSpan(
                    id=str(index),
                    start=ent.start_char,
                    end=ent.end_char,
                    text="First ten",
                ),
                str(ent.label_),
            )
        )
        # print(ent.text, ent.start_char, ent.end_char, ent.label_)

    # This generates a TON of labels... so artificially limiting to 10 for now... Ideal fix here is using page aware
    # annotations, which I know I was using before for virtual loading. Think it ran into some issues with the jump
    # to annotation functionality, but that should be largely solved with new functionality to render specified annots
    # on annotator load.
    return [], results[:10], [], True
