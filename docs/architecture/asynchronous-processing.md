## Asynchronous Tasks

OpenContracts makes extensive use of celery, a powerful, mature python framework for distributed and asynchronous 
processing. Out-of-the-box, dedicated celeryworkers are configured in the docker compose stack
to handle computationally-intensive and long-running tasks like parsing documents, applying
annotations to pdfs, creating exports, importing exports, and more. 

### What if my celery queue gets clogged?

We are always working to make OpenContracts more fault-tolerant and stable. That said, due to 
the nature of the types of documents we're working with - pdfs - there is 
tremendous variation in what the parsers have to parse. Some documents are extremely long - thousands of pages or more -
whereas other documents may have poor formatting, no text layers, etc.. In most cases, 
OpenContracts should be able to process the pdfs and make them compatible with our annotation tools. 
Sometimes, however, either due to unexpected issues or unexpected volume of documents, you may 
want to purge the queue of tasks to be processed by your celery workers. To do this, type:

```commandline
sudo docker-compose -f local.yml run django celery -A config.celery_app purge
```

Be aware that this can cause some undesired effects for your users. For example, everytime a new 
document is uploaded, a Django signal kicks off the pdf preprocessor to produce the PAWLs token
layer that is later annotated. If these tasks are in-queue and the queue is purged, 
you'll have documents that are not annotatable as they'll lack the PAWLS token layers. In such cases, 
we recommend you delete and re-upload the documents. There are ways to manually
reprocess the pdfs, but we don't have a user-friendly way to do this yet. 
