package controller

import (
	"context"
)

type ctxKey string

const uuidKey ctxKey = "pm_uuid"

func withUUID(ctx context.Context, uuid string) context.Context {
	return context.WithValue(ctx, uuidKey, uuid)
}

func uuidFrom(ctx context.Context) string {
	if v, ok := ctx.Value(uuidKey).(string); ok {
		return v
	}
	return ""
}
