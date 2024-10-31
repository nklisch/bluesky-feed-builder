#!/bin/sh

# Ensure required environment variables are set

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set."
  exit 1
fi

if [ -z "$FEEDGEN_LISTENHOST" ]; then
  echo "Error: FEEDGEN_LISTENHOST is not set."
  exit 1
fi

if [ -z "$FEEDGEN_SUBSCRIPTION_ENDPOINT" ]; then
  echo "Error: FEEDGEN_SUBSCRIPTION_ENDPOINT is not set."
  exit 1
fi

if [ -z "$FEEDGEN_HOSTNAME" ]; then
  echo "Error: FEEDGEN_HOSTNAME is not set."
  exit 1
fi

if [ -z "$FEEDGEN_PUBLISHER_DID" ]; then
  echo "Error: FEEDGEN_PUBLISHER_DID is not set."
  exit 1
fi

# Optional environment variable: FEEDGEN_SERVICE_DID
# This will use a default value or remain unset if not provided.
if [ -z "$FEEDGEN_SERVICE_DID" ]; then
  echo "Warning: FEEDGEN_SERVICE_DID is not set. Using derived service DID."
fi

# Ensure numeric value for FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY
if [ -z "$FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY" ]; then
  echo "Error: FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY is not set."
  exit 1
elif ! echo "$FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY" | grep -E '^[0-9]+$' >/dev/null 2>&1; then
  echo "Error: FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY must be a number."
  exit 1
fi

# All required environment variables are set, now start the application
exec "$@"
