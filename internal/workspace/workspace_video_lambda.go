package workspace

import (
	"context"
	"errors"
	"fmt"
	"mime"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	remotion "github.com/remotion-dev/lambda_go_sdk"
)

// videoRenderer starts and tracks WhatsApp video renders. Production uses
// Remotion on AWS Lambda; tests use a fake.
type videoRenderer interface {
	start(ctx context.Context, composition string, props any) (renderID, bucket string, err error)
	progress(ctx context.Context, renderID, bucket string) (videoProgress, error)
	// fileURL returns a short-lived link to a finished MP4.
	fileURL(ctx context.Context, bucket, key, fileName string, download bool) (string, error)
}

type videoProgress struct {
	Done, Failed bool
	Progress     float64
	Key          string
	Bytes        int64
	Error        string
}

// Renders are deleted from S3 after this long by the bucket's lifecycle rule
// (set by video/scripts/deploy-lambda.mjs). The app treats older files as gone.
const videoRetention = 30 * 24 * time.Hour

type lambdaVideoRenderer struct {
	function, serveURL, bucket, region string
	presign                            *s3.PresignClient
}

// newLambdaVideoRenderer reads the deployed function, site and bucket (all
// named spp-video-…, printed by the deploy workflow) from the environment. It
// returns nil when videos are not configured, which switches the feature off.
func newLambdaVideoRenderer(ctx context.Context) (*lambdaVideoRenderer, error) {
	function := strings.TrimSpace(os.Getenv("SHAADI_VIDEO_LAMBDA_FUNCTION"))
	serveURL := strings.TrimSpace(os.Getenv("SHAADI_VIDEO_SERVE_URL"))
	bucket := strings.TrimSpace(os.Getenv("SHAADI_VIDEO_BUCKET"))
	if function == "" && serveURL == "" && bucket == "" {
		return nil, nil
	}
	region := strings.TrimSpace(os.Getenv("SHAADI_VIDEO_REGION"))
	if region == "" {
		region = strings.TrimSpace(os.Getenv("AWS_REGION"))
	}
	if function == "" || serveURL == "" || bucket == "" || region == "" {
		return nil, errors.New("WhatsApp videos need SHAADI_VIDEO_LAMBDA_FUNCTION, SHAADI_VIDEO_SERVE_URL, SHAADI_VIDEO_BUCKET and a region (SHAADI_VIDEO_REGION or AWS_REGION)")
	}
	config, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("load AWS config for videos: %w", err)
	}
	return &lambdaVideoRenderer{function: function, serveURL: serveURL, bucket: bucket, region: region,
		presign: s3.NewPresignClient(s3.NewFromConfig(config))}, nil
}

func (l *lambdaVideoRenderer) start(_ context.Context, composition string, props any) (string, string, error) {
	response, err := remotion.RenderMediaOnLambda(remotion.RemotionOptions{
		ServeUrl: l.serveURL, FunctionName: l.function, Region: l.region, Composition: composition, InputProps: props,
		Codec: "h264", ImageFormat: "jpeg", Crf: 23, X264Preset: "medium",
		// The SDK defaults to public output. The spp bucket has ACLs disabled
		// and keeps renders/ private, so no ACL is set at all.
		Privacy:         "no-acl",
		ForceBucketName: l.bucket,
	})
	if err != nil {
		return "", "", err
	}
	if response.RenderId == "" {
		return "", "", fmt.Errorf("render did not start: %s", response.ErrorMessage+response.Message)
	}
	return response.RenderId, response.BucketName, nil
}

func (l *lambdaVideoRenderer) progress(_ context.Context, renderID, bucket string) (videoProgress, error) {
	result, err := remotion.GetRenderProgress(remotion.RenderConfig{RenderId: renderID, BucketName: bucket,
		FunctionName: l.function, Region: l.region})
	if err != nil {
		return videoProgress{}, err
	}
	progress := videoProgress{Done: result.Done, Failed: result.FatalErrorEncountered, Progress: result.OverallProgress}
	if result.OutKey != nil {
		progress.Key = *result.OutKey
	}
	if result.OutputSizeInBytes != nil {
		progress.Bytes = *result.OutputSizeInBytes
	}
	if len(result.Errors) > 0 {
		progress.Error = result.Errors[0].Message
	}
	return progress, nil
}

func (l *lambdaVideoRenderer) fileURL(ctx context.Context, bucket, key, fileName string, download bool) (string, error) {
	disposition := "inline"
	if download {
		disposition = "attachment"
	}
	request, err := l.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket), Key: aws.String(key),
		ResponseContentType:        aws.String("video/mp4"),
		ResponseContentDisposition: aws.String(mime.FormatMediaType(disposition, map[string]string{"filename": fileName})),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", err
	}
	return request.URL, nil
}
