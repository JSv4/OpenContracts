# Container Data Flow

You'll notice that we have a number of containers in our docker compose file (**Note** the local.yml is up-to-date. The
production file needs some work to be production grade, and we may switch to [Tilt](https://tilt.dev/).). 

Here, you can see how these containers relate to some of the core data elements powering the application - such as 
parsing structural and layout annotations from PDFs (which powers the vector store) and generating vector embeddings.

## PNG Diagram

![Diagram](../../assets/images/diagrams/Open_Contracts_System_Diagram.png)

## Mermaid Version

```mermaid
graph TB
    subgraph "Docker Compose Environment"
        direction TB
        django[Django]
        postgres[PostgreSQL]
        redis[Redis]
        celeryworker[Celery Worker]
        celerybeat[Celery Beat]
        flower[Flower]
        frontend[Frontend React]
        nlm_ingestor[NLM Ingestor]
        vector_embedder[Vector Embedder]
    end

    subgraph "Django Models"
        direction TB
        document[Document]
        annotation[Annotation]
        relationship[Relationship]
        labelset[LabelSet]
        extract[Extract]
        datacell[Datacell]
    end

    django -->|Manages| document
    django -->|Manages| annotation
    django -->|Manages| relationship
    django -->|Manages| labelset
    django -->|Manages| extract
    django -->|Manages| datacell

    nlm_ingestor -->|Parses PDFs| django
    nlm_ingestor -->|Creates layout annotations| annotation

    vector_embedder -->|Generates embeddings| django
    vector_embedder -->|Stores embeddings| annotation
    vector_embedder -->|Stores embeddings| document

    django -->|Stores data| postgres
    django -->|Caching| redis

    celeryworker -->|Processes tasks| django
    celerybeat -->|Schedules tasks| celeryworker
    flower -->|Monitors| celeryworker

    frontend -->|User interface| django

    classDef container fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef model fill:#fff59d,stroke:#f57f17,stroke-width:2px;
    
    class django,postgres,redis,celeryworker,celerybeat,flower,frontend,nlm_ingestor,vector_embedder container;
    class document,annotation,relationship,labelset,extract,datacell model;
```
