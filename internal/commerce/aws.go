package commerce

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
	"github.com/aws/aws-sdk-go-v2/service/sesv2/types"
	"github.com/aws/smithy-go"
)

func awsConfig() (aws.Config, error) {
	region := strings.TrimSpace(os.Getenv("AWS_REGION"))
	key, secret := os.Getenv("AWS_ACCESS_KEY_ID"), os.Getenv("AWS_SECRET_ACCESS_KEY")
	if region == "" || key == "" || secret == "" {
		return aws.Config{}, errors.New("Excel checkout requires AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY")
	}
	return aws.Config{
		Region:      region,
		Credentials: aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(key, secret, os.Getenv("AWS_SESSION_TOKEN"))),
		HTTPClient:  &http.Client{Timeout: 5 * time.Second},
	}, nil
}

func loadPackage(ctx context.Context, client *s3.Client, bucket, key, checksum string) ([]byte, error) {
	if bucket == "" || key == "" {
		return nil, errors.New("set SHAADI_EXCEL_S3_BUCKET and upload the package to its private object key")
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return nil, fmt.Errorf("could not read the package from S3: %w", awsFailure(err))
	}
	defer out.Body.Close()
	const limit = 8 << 20
	kit, err := io.ReadAll(io.LimitReader(out.Body, limit+1))
	if err != nil {
		return nil, errors.New("could not read the complete package from S3")
	}
	if len(kit) > limit || fmt.Sprintf("%x", sha256.Sum256(kit)) != checksum {
		return nil, errors.New("the S3 object does not match the approved package")
	}
	return kit, nil
}

type receiptMailer struct {
	client        *sesv2.Client
	from, replyTo string
}

func (m receiptMailer) send(ctx context.Context, address, text, reference string) error {
	input := &sesv2.SendEmailInput{
		FromEmailAddress: aws.String(m.from),
		Destination:      &types.Destination{ToAddresses: []string{address}},
		Content: &types.EmailContent{Simple: &types.Message{
			Subject: &types.Content{Data: aws.String("Your ShaadiPlannerPro receipt"), Charset: aws.String("UTF-8")},
			Body:    &types.Body{Text: &types.Content{Data: aws.String(text), Charset: aws.String("UTF-8")}},
		}},
		EmailTags: []types.MessageTag{{Name: aws.String("receipt"), Value: aws.String(reference)}},
	}
	if m.replyTo != "" {
		input.ReplyToAddresses = []string{m.replyTo}
	}
	// The receipt queue owns retries. SES SendEmail has no idempotency token.
	_, err := m.client.SendEmail(ctx, input, func(o *sesv2.Options) { o.Retryer = aws.NopRetryer{} })
	if err != nil {
		return fmt.Errorf("SES receipt request failed: %w", awsFailure(err))
	}
	return nil
}

func awsFailure(err error) error {
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return errors.New(apiErr.ErrorCode())
	}
	return errors.New("request failed")
}
