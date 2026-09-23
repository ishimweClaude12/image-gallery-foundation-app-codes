# nodejs-application (Kivu Gallery)

The application layer of the Kivu Gallery lab: a small Node.js photo gallery,
its Dockerfile, tests, the CodeDeploy deploy artifacts, and the GitHub Actions
workflow that builds the image, pushes it to ECR, and uploads the deploy bundle.

## What the app does

- `GET /` serves the gallery page.
- `GET /api/photos` lists photos (description plus a CloudFront image URL) from
  RDS PostgreSQL.
- `POST /api/photos` accepts an image and a description, stores the image in the
  private S3 bucket, and writes the description to RDS.
- `GET /health` is the ALB target group health check and does not touch the
  database.

Images are served through CloudFront, never directly from S3. The app builds
image URLs from the `CLOUDFRONT_DOMAIN` value injected by the task definition.

## Layout

```
nodejs-application/
├── src/
│   ├── app.js       # Express routes
│   ├── server.js    # entrypoint, initialises the DB table then listens
│   ├── env.js       # loads .env for local runs
│   ├── db.js        # pg pool + queries
│   └── s3.js        # S3 upload + CloudFront URL builder
├── public/
│   └── index.html   # gallery UI
├── test/
│   └── app.test.js  # node:test suite (no AWS needed)
├── deploy/
│   ├── appspec.yaml # CodeDeploy ECS blue/green appspec
│   └── taskdef.json # task definition template (placeholders)
├── docker-compose.yml # local Postgres for development
├── Dockerfile
├── .github/workflows/build-and-push.yml
└── package.json
```

## Environment variables (set at runtime by the task definition)

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (3000) |
| `AWS_REGION` | Region for the S3 client |
| `S3_BUCKET` | Private image bucket |
| `CLOUDFRONT_DOMAIN` | Distribution domain for building image URLs |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | RDS connection |
| `DB_PASSWORD` | Injected from Secrets Manager via the task definition |
| `DB_SSL` | Set to `false` for a local Postgres without TLS (RDS needs TLS) |

## Run and test locally

RDS is private and only reachable from the ECS tasks, so local development uses
a Postgres container instead. `npm start` loads `.env` automatically when it
exists (`src/env.js`); the container has no `.env` and uses the task definition.

Prerequisites: Node 20+, Docker, and AWS credentials for the account (uploads
go to S3).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the local database (Postgres 16, credentials in `docker-compose.yml`):

   ```bash
   docker compose up -d db
   ```

3. Create `.env` in the project root (it is gitignored):

   ```bash
   PORT=3000
   AWS_REGION=eu-north-1

   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=kivugallery
   DB_USER=galleryadmin
   DB_PASSWORD=localdev
   DB_SSL=false

   S3_BUCKET=kivu-gallery-images-<account-id>-eu-north-1
   CLOUDFRONT_DOMAIN=<distribution>.cloudfront.net
   ```

   `S3_BUCKET` and `CLOUDFRONT_DOMAIN` are published by the infrastructure
   stack under the SSM path `/kivu-gallery/deploy/` (`image-bucket` and
   `cloudfront-domain`).

4. Start the app and open http://localhost:3000:

   ```bash
   npm start
   ```

   The log should show `Database ready`; the `photos` table is created on
   first start.

5. Run the tests (no database or AWS needed):

   ```bash
   npm test
   ```

Uploads from a local run go to the real S3 bucket, so they show up next to the
deployed app's images. Stop the database with `docker compose down` (add `-v`
to also delete its data).

## CI/CD: one-time setup

The workflow authenticates to AWS with OIDC, so there are no stored keys. It
needs one repository variable:

- `AWS_ACCOUNT_ID` = the AWS account that holds the foundation stack's
  `kivu-gallery-ci-role`. Set it under
  **Settings > Secrets and variables > Actions > Variables** (or on the `dev`
  environment), alongside `AWS_REGION`.

## What a push does

1. Runs the tests.
2. Builds the image and pushes two tags to ECR: the commit SHA and `latest`.
3. Renders `taskdef.json` from parameters the infrastructure stack publishes
   under `/kivu-gallery/deploy/*`, zips it with `appspec.yaml`, and uploads
   `config-source.zip` to the artifact bucket.

Step 3 is skipped automatically if those parameters do not exist yet, so you can
push this repo before the infrastructure stack is deployed. The image still
lands in ECR. Once `aws-infrastructure` is up, push again (or re-run the
workflow) and the deploy bundle publishes, at which point an ECR push triggers
the blue/green deployment through CodePipeline and CodeDeploy.

## Dependency this repo has on the rest of the lab

- **Foundation stack (already built):** provides the ECR repo, the artifact
  bucket, and the CI role this workflow assumes. The image build and push depend
  only on this.
- **Infrastructure stack (built next):** publishes the SSM parameters used to
  render the task definition (role ARNs, log group, DB endpoint and secret,
  CloudFront domain, image bucket), and owns the pipeline that consumes the
  uploaded bundle.
