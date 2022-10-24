We use Black and Flake8 for Python Code Styling. These are run via pre-commit before all commits. If you want to develop extensions or code based on OpenContracts, you'll need to setup pre-commit. First, make sure the requirements in `./requirements/local.txt` are installed in your local environment.

Then, install pre-commit into your local git repo. From the root of the repo, run:

```
 $ pre-commit install
```
If you want to run pre-commit manually on all the code in the repo, use this command:

```
 $ pre-commit run --all-files
```

When you commit changes to your repo or our repo as a PR, pre-commit will run and ensure your code
follows our style guide and passes linting.
