## Select and Setup Storage Backend

You can use Amazon S3 as a file storage backend (if you set the env flag `USE_AWS=True`, more on that below), or you
can use the local storage of the host machine via a Docker volume.

## AWS Storage Backend
If you want to use AWS S3 to store files (primarily pdfs, but also exports, tokens and txt files), you will need an
Amazon AWS account to setup S3. This README does not cover the AWS side of configuration, but there  are a number of
[tutorials](https://simpleisbetterthancomplex.com/tutorial/2017/08/01/how-to-setup-amazon-s3-in-a-django-project.html)
and [guides](https://testdriven.io/blog/storing-django-static-and-media-files-on-amazon-s3/) to getting AWS configured
to be used with a django project.

Once you have an S3 bucket configured, you'll need to set the following env variables in your .env file (the `.django`
file in `.envs/.production` or `.envs/.local`, depending on your target environment). Our sample .envs only show these
fields in the .production samples, but you could use them in the .local env file too.

**Here the variables you need to set to enable AWS S3 storage:**

1. `USE_AWS` - set to `true` since you're using AWS, otherwise the backend will use a docker volume for storage.
2. `AWS_ACCESS_KEY_ID` - the access key ID created by AWS when you set up your IAM user (see tutorials above).
3. `AWS_SECRET_ACCESS_KEY` - the secret access key created by AWS when you set up your IAM user
   (see tutorials above)
4. `AWS_STORAGE_BUCKET_NAME` - the name of the AWS bucket you created to hold the files.
5. `AWS_S3_REGION_NAME` - the region of the AWS bucket you configured.

## Django Storage Backend

Setting `USE_AWS=false` will use the disk space in the django container. When using the local docker compose stack,
the celery workers and django containers share the same disk, so this works fine. Our production configuration would not
work properly with `USE_AWS=false`, however, as each container has its own disk.
