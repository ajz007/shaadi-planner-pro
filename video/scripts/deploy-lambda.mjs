// Publishes the video compositions to AWS Lambda for the planner's WhatsApp
// videos. Used by .github/workflows/video-lambda.yml; can also be run by hand
// with the deploy identity's credentials in the environment:
//
//   AWS_REGION=us-west-1 npm run deploy:lambda
//
// Every resource is named with the "spp-" prefix so it stays apart from
// other projects in the same AWS account (see video/aws/README.md):
//   bucket    spp-video-<account>-<region>
//   function  spp-video-render-<remotion version>
//   role      spp-video-lambda-role (created once by hand)
//   site      spp-video (the uploaded compositions)
//
// 1. Creates the bucket if needed and (re)applies its settings: no ACLs,
//    compositions under sites/ readable by the render's browser, renders/
//    private and deleted after 30 days.
// 2. Deploys the render function (reused if it already exists).
// 3. Uploads the compositions over the previous upload, so new designs go
//    live without an app deploy.
// Prints the SHAADI_VIDEO_* values the app needs.
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import {
  CreateBucketCommand, HeadBucketCommand, PutBucketLifecycleConfigurationCommand, PutBucketOwnershipControlsCommand,
  PutBucketPolicyCommand, PutBucketTaggingCommand, PutPublicAccessBlockCommand, S3Client,
} from '@aws-sdk/client-s3'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { deployFunction, deploySite } from '@remotion/lambda'
import { VERSION } from 'remotion/version'
import { webpackOverride } from '../webpack-override.mjs'

const region = process.env.AWS_VIDEO_REGION || process.env.AWS_REGION
if (!region) throw new Error('Set AWS_REGION (the shop bucket region, for example us-west-1).')
const prefix = 'spp-video'
const roleName = `${prefix}-lambda-role`
const siteName = prefix
const functionName = `${prefix}-render-${VERSION.replaceAll('.', '-')}`
// How long finished videos are kept. The app treats older files as gone.
const keepDays = 30

const { Account: account } = await new STSClient({ region }).send(new GetCallerIdentityCommand({}))
const bucketName = `${prefix}-${account}-${region}`
const tags = [{ Key: 'project', Value: 'spp' }, { Key: 'purpose', Value: 'whatsapp-video' }]

const s3 = new S3Client({ region })
try {
  await s3.send(new HeadBucketCommand({ Bucket: bucketName }))
} catch (error) {
  if (error?.$metadata?.httpStatusCode !== 404) throw error
  await s3.send(new CreateBucketCommand({ Bucket: bucketName,
    ...(region === 'us-east-1' ? {} : { CreateBucketConfiguration: { LocationConstraint: region } }) }))
  console.log(`created bucket ${bucketName}`)
}
await s3.send(new PutBucketOwnershipControlsCommand({ Bucket: bucketName,
  OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] } }))
// ACLs stay blocked; the bucket policy below is the only public access.
await s3.send(new PutPublicAccessBlockCommand({ Bucket: bucketName, PublicAccessBlockConfiguration: {
  BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: false, RestrictPublicBuckets: false } }))
// The render's headless browser loads the compositions over HTTPS, so only
// sites/ is public. It holds the compiled video templates, no family data.
await s3.send(new PutBucketPolicyCommand({ Bucket: bucketName, Policy: JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Sid: 'PublicVideoTemplates', Effect: 'Allow', Principal: '*', Action: 's3:GetObject',
    Resource: `arn:aws:s3:::${bucketName}/sites/*` }],
}) }))
await s3.send(new PutBucketLifecycleConfigurationCommand({ Bucket: bucketName, LifecycleConfiguration: { Rules: [
  { ID: 'expire-renders', Status: 'Enabled', Filter: { Prefix: 'renders/' }, Expiration: { Days: keepDays },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } },
] } }))
await s3.send(new PutBucketTaggingCommand({ Bucket: bucketName, Tagging: { TagSet: tags } }))
console.log(`bucket ready: ${bucketName}`)

const { alreadyExisted } = await deployFunction({
  region,
  functionName,
  customRoleArn: `arn:aws:iam::${account}:role/${roleName}`,
  // 3 GB memory and 2 GB disk per invocation, 4-minute limit. A render is
  // split across several invocations, so a 30-second video takes well under
  // a minute.
  memorySizeInMb: 3008,
  diskSizeInMb: 2048,
  timeoutInSeconds: 240,
  createCloudWatchLogGroup: true,
  cloudWatchLogRetentionPeriodInDays: 14,
})
console.log(alreadyExisted ? `function already deployed: ${functionName}` : `deployed function: ${functionName}`)

const { serveUrl } = await deploySite({
  entryPoint: path.resolve('src/index.ts'),
  bucketName,
  region,
  siteName,
  // ACLs are disabled on the bucket; the bucket policy makes sites/ readable.
  privacy: 'no-acl',
  options: { webpackOverride, bypassBucketNameValidation: true },
})
console.log(`uploaded site: ${serveUrl}`)

const env = [`SHAADI_VIDEO_LAMBDA_FUNCTION=${functionName}`, `SHAADI_VIDEO_SERVE_URL=${serveUrl}`,
  `SHAADI_VIDEO_BUCKET=${bucketName}`, `SHAADI_VIDEO_REGION=${region}`]
console.log('\nSet these on the app if they changed:\n' + env.join('\n'))
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### WhatsApp video renderer deployed', '',
    'Set these on the app (Railway) if they changed:', '', '```', ...env, '```', ''].join('\n'))
}
