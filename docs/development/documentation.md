## Documentation Stack

We're using mkdocs to render our markdown into pretty, bite-sized pieces. The markdown lives in `/docs` in our repo. If you want to work on the docs you'll need to install the requirements in `/requirements/docs.txt`.

To have a live server while working on them, type:

```
mkdocs serve
```

## Building Docs

To build a html website from your markdown that can be uploaded to a webhost (or a GitHub Page),
just type:

```
mkdocs build
```

## Deploying to GH Page

mkdocs makes it super easy to deploy your docs to a GitHub page.

Just run:

```
mkdocs gh-deploy
```
