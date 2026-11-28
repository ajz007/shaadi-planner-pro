# AWS setup for WhatsApp videos

Everything this project creates in AWS starts with `spp-`, so it stays separate from other projects in the same account. Each identity can only touch `spp-video-*` resources.

| Resource | Name | Created by |
| --- | --- | --- |
| S3 bucket | `spp-video-<account>-us-west-1` | the deploy workflow |
| Render function | `spp-video-render-<remotion version>`, e.g. `spp-video-render-4-0-542` | the deploy workflow |
| Function logs | `/aws/lambda/spp-video-render-…`, kept 14 days | the deploy workflow |
| Role the function runs as | `spp-video-lambda-role` | you, once |
| Deploy user for GitHub Actions | `spp-video-deploy` | you, once |
| The app's existing user | `shaadiplannerpro-app` (two statements added) | you, once |

**Bucket layout:**
- `sites/spp-video/` holds the compiled video templates. The render's headless browser loads them over HTTPS, so only `sites/` is publicly readable. It contains no family data.
- `renders/` holds the finished videos. It is private: the app hands out 15-minute signed links, and a lifecycle rule deletes renders after 30 days.
- ACLs are disabled. Couple photos never reach S3: the render fetches each one from the app through a one-time link.

## One-time setup

In the policy files, replace `ACCOUNT_ID` with your AWS account ID.

1. **Create the role the function runs as.**
   - In IAM → Roles, create `spp-video-lambda-role` with the trust policy in `lambda-role-trust-policy.json` (trusted entity: Lambda).
   - Add `lambda-role-policy.json` as an inline policy named `spp-video-lambda`.
2. **Create the deploy user.**
   - In IAM → Users, create `spp-video-deploy` with no console access.
   - Add `deploy-user-policy.json` as an inline policy named `spp-video-deploy`.
   - Create an access key for "Application running outside AWS".
3. **Extend the app's user.** Add the two statements in `app-policy-statements.json` to the existing `shaadiplannerpro-app` policy. The app needs them to start renders and to sign download links.
4. **Add the GitHub settings.** In Settings → Secrets and variables → Actions:
   - secrets `AWS_VIDEO_DEPLOY_ACCESS_KEY_ID` and `AWS_VIDEO_DEPLOY_SECRET_ACCESS_KEY`, from step 2;
   - a variable `AWS_VIDEO_REGION` set to `us-west-1`.
5. **Deploy.** Run **Deploy WhatsApp video renderer** under Actions. Its summary lists four values. Set them on the app in Railway:

   ```
   SHAADI_VIDEO_LAMBDA_FUNCTION=spp-video-render-4-0-542
   SHAADI_VIDEO_SERVE_URL=https://spp-video-<account>-us-west-1.s3.us-west-1.amazonaws.com/sites/spp-video/index.html
   SHAADI_VIDEO_BUCKET=spp-video-<account>-us-west-1
   SHAADI_VIDEO_REGION=us-west-1
   ```

   The app keeps its existing `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Until the four values are set, the studio says videos aren't switched on yet.

## Afterwards

- **Design changes.** A push to `main` that changes `video/` or the shared invitation art redeploys automatically. The site URL stays the same, so the app needs no change.
- **Remotion upgrades.** Upgrading Remotion creates a new `spp-video-render-<version>` function. Update `SHAADI_VIDEO_LAMBDA_FUNCTION` from the workflow summary, then delete the old function. The Go SDK in `go.mod` must be pinned to the same Remotion version.
- **Cost tracking.** The bucket is tagged `project=spp`, so you can filter it in Cost Explorer once you activate that tag as a cost allocation tag.
