from typing import List
import marvin
import logging
from django.conf import settings

from opencontractserver.pipeline.utils import get_preferred_embedder
from opencontractserver.shared.decorators import doc_analyzer_task
from opencontractserver.types.dicts import TextSpan

# Pass OpenAI API key to marvin for parsing / extract
marvin.settings.openai.api_key = settings.OPENAI_API_KEY

logger = logging.getLogger(__name__)


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


# TODO - more robust, more production-grade approach to knowlege base building
@doc_analyzer_task()
def build_contract_knowledge_base(*args, pdf_text_extract, **kwargs):
    """
    Build a knowledge base from the document.
    """
    
    from llama_index.llms.openai import OpenAI
    from llama_index.core.llms import ChatMessage
    from opencontractserver.annotations.models import Note
    from opencontractserver.documents.models import Document
    from django.core.files.base import ContentFile
    
    corpus_id = kwargs.get("corpus_id", None)
    if not corpus_id:
        logger.error("corpus_id is required for build_knowledge_base task")
        return [], [], [], False

    llm = OpenAI(
        model="gpt-4o-mini",  # using the "mini" version as specified
        api_key=settings.OPENAI_API_KEY,  # optional, pulls from env var by default
    )
    
    doc_id = kwargs.get("doc_id", None)
    if not doc_id:
        logger.error("doc_id is required for build_knowledge_base task")
        return [], [], [], False
    
    def get_markdown_response(system_prompt: str, user_prompt: str) -> str | None:
        """
        Creates a conversation with given system and user prompts and returns
        the LLM's response in Markdown format.
        
        :param system_prompt: The content for the system role.
        :param user_prompt: The content for the user role.
        :return: The assistant's response as a string.
        """
        messages: List[ChatMessage] = [
            ChatMessage(role="system", content=system_prompt),
            ChatMessage(role="user", content=user_prompt),
        ]
        response = llm.chat(messages)
        return response.message.content
    
    def prompt_1_single_pass(pdf_text: str) -> str:
        system_prompt = (
            "You are a highly skilled paralegal specializing in contract analysis. "
            "Your goal is to carefully read the contract and produce a detailed yet "
            "concise summary. Strictly follow the requested format and level of detail. "
            "You write in elegant and expressive markdown."
        )
        
        user_prompt = f"""\
    **Please analyze the following contract** (included below) **and provide the following information:**

    1. **Context and Purpose**  
    - A brief description (2–3 sentences) explaining the primary purpose of the contract and any relevant background details.

    2. **Knowledge Base Article Summary**  
    - **Parties Involved**: Identify all parties and their roles or obligations.  
    - **Key Dates**: Outline important dates (e.g., effective date, milestones, deadlines, renewal dates).  
    - **Key Definitions**: Lisst or paraphrase any critical definitions that shape the agreement.  
    - **Termination & Renewal Provisions**: Summarize any clauses that address how and when the contract can end or renew.

    3. **Notes on Referenced Documents & Regulations**  
    - **Referenced Documents**: List names and any critical details (e.g., date, version, or relevant sections).  
    - **Referenced Rules/Regulations**: List any laws, statutes, or regulatory bodies referenced, along with a short description of how they apply.

    **Contract Text:**
    {pdf_text}
    """
        return get_markdown_response(system_prompt, user_prompt)

    def prompt_4_references(pdf_text: str) -> str: 
        system_prompt = (
            "You are acting as a senior legal assistant. Your primary focus is on ensuring "
            "all references to external documents, exhibits, regulations, or statutes are "
            "identified accurately. You write in elegant and expressive markdown."
        )

        user_prompt = f"""\
            Given the contract below, please:

            Summarize the contract with attention to main purpose and parties.
            Enumerate all references to documents, laws, regulations, or external materials:
            Document/Regulation name
            Section or clause referencing it
            Brief note on relevance
            Identify any key definitions that link to external references or industry-standard terminology.
            Highlight any deadlines or termination clauses tied to external compliance requirements.
            Contract Text: {pdf_text} """
        return get_markdown_response(system_prompt, user_prompt)
    
    
    def prompt_5_bullet_points(pdf_text: str) -> str: 
        system_prompt = (
            "You are a paralegal who must produce a bullet-point cheat sheet for "
            "attorneys seeking a quick reference guide. You write in elegant and expressive markdown."
        )

        user_prompt = f"""\
        Read the contract below and produce a bullet-point summary with the following sections:

        1. Purpose & Context
        2. Parties
        3. Key Dates
        4. Key Definitions
        5. Termination & Renewal
        6. Referenced Documents & Regulations (including names, dates, versions, relevant sections)
        Contract Text: {pdf_text} """
        
        return get_markdown_response(system_prompt, user_prompt)
    
    def create_searchable_summary(full_summary: str) -> str:
        """
        Creates a concise, searchable summary from the full markdown summary,
        optimized for document discovery.
        
        :param full_summary: The detailed markdown summary
        :return: A 2-3 sentence searchable summary
        """
        system_prompt = (
            "You are a legal knowledge management specialist. Your task is to create "
            "a concise 2-3 sentence summary of a contract that will help paralegals "
            "quickly find this document in a search index. Include specific details "
            "like party names, dates, and particular context while maintaining clarity. "
            "Focus on what makes this contract unique and identifiable."
        )
        
        user_prompt = f"""\
            Based on the following detailed contract summary, create a 2-3 sentence summary 
            that would help paralegals quickly identify this specific contract in a search. 
            Include proper names, dates, and specific context where available. The summary 
            should be both accurate and distinctive enough to differentiate this contract 
            from similar ones.

            Detailed Summary:
            {full_summary}
            """
        
        return get_markdown_response(system_prompt, user_prompt)
    
    doc = Document.objects.get(id=doc_id)
    
    summary = prompt_1_single_pass(pdf_text_extract)
    reference_notes = prompt_4_references(pdf_text_extract)
    cheat_sheet = prompt_5_bullet_points(pdf_text_extract)    
    searchable_summary = create_searchable_summary(summary)

    # Generate embeddings for the searchable summary
    try:
        embedder_class = get_preferred_embedder(doc.file_type)
        if embedder_class:
            embedder = embedder_class()
            description_embeddings = embedder.embed_text(searchable_summary)
            doc.description_embedding = description_embeddings
    except Exception as e:
        logger.error(f"Failed to generate description embeddings: {e}")

    doc.md_summary_file = ContentFile(summary.encode("utf-8"), name="summary.md")
    doc.description = searchable_summary
    doc.save()
    
    Note.objects.create(
        title="Referenced Documents",
        document=doc,
        content=reference_notes,
        corpus_id=corpus_id,
    )
    
    Note.objects.create(
        title="Quick Reference",
        document=doc,
        content=cheat_sheet,
        corpus_id=corpus_id,
    )
    
    return [], [], [], True



