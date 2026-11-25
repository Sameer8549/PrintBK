# Webhook signature verification

UPIlerify sends a JSON `POST` to your configured webhook URL. Verify its
signature **before parsing the body or performing any business action**.
These examples match [WebhookDispatcher](../lib/webhooks/webhookDispatcher.ts).

## Signing contract

- Set `WEBHOOK_SECRET` in both UPIlerify and your receiving backend to the same
  secret. Keep it server-side; never use an empty secret or a fallback value.
- `X-Upilerify-Signature` contains the **64-character lowercase hexadecimal**
  HMAC-SHA256 of the exact request body bytes. There is no `sha256=` prefix.
- Use the secret as UTF-8 text, not as a hex-decoded key.
- Read the **raw body**. Parsing and re-serializing JSON can change whitespace,
  key order, or Unicode escaping and invalidate the signature.
- `X-Upilerify-Event` is not part of the signed body. Use the verified JSON
  `event` field when deciding which event to handle.

**Always use a constant-time comparison to protect against timing attacks.**
Ordinary string equality can exit at the first difference, revealing how much
of a signature matched. The examples use Python's `hmac.compare_digest`, PHP's
`hash_equals`, and Go's `subtle.ConstantTimeCompare`. Rejecting an invalid
format or length first is safe: the signature's fixed length is public.

The handlers below acknowledge authenticated JSON objects. Add your application's
event validation and processing where indicated; acknowledgement alone does not
fulfil an order.

## Python — Flask

Install Flask with `python -m pip install flask`. Save as `app.py`, set
`WEBHOOK_SECRET` in the environment, then run
`flask --app app run --port 8000` for local testing.
HMAC verification uses only standard-library `hmac` and `hashlib`.

```python
import hashlib
import hmac
import json
import os
import re

from flask import Flask, jsonify, request

secret = os.environ["WEBHOOK_SECRET"].encode("utf-8")
if not secret:
    raise RuntimeError("WEBHOOK_SECRET must not be empty")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024


def valid_signature(raw_body: bytes, received: str) -> bool:
    if re.fullmatch(r"[0-9a-f]{64}", received) is None:
        return False
    expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)


@app.post("/api/webhooks/upi")
def webhook():
    raw_body = request.get_data()  # Read before any JSON middleware.
    received = request.headers.get("X-Upilerify-Signature", "")
    if not valid_signature(raw_body, received):
        return jsonify(error="Invalid signature"), 401

    try:
        payload = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return jsonify(error="Invalid JSON"), 400
    if not isinstance(payload, dict):
        return jsonify(error="Expected a JSON object"), 400

    # Validate payload["event"], timestamp, and order; process idempotently.
    return jsonify(received=True), 200
```

For FastAPI, the same verification function can be used with
`raw_body = await request.body()` and
`request.headers.get("X-Upilerify-Signature", "")`; verify before calling
`await request.json()` or invoking business logic.

## PHP

Requires PHP 7.3+ with the hash and JSON extensions. Save as `webhook.php` and
route your webhook URL to it. For local testing, set `WEBHOOK_SECRET` and run
`php -S 127.0.0.1:8000 webhook.php`.

```php
<?php
declare(strict_types=1);

header('Content-Type: application/json');

function respond(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['error' => 'Method not allowed']);
}

$secret = getenv('WEBHOOK_SECRET');
if ($secret === false || $secret === '') {
    respond(500, ['error' => 'Webhook secret not configured']);
}

$rawBody = file_get_contents('php://input');
if ($rawBody === false) {
    respond(400, ['error' => 'Unable to read request body']);
}
$received = $_SERVER['HTTP_X_UPILERIFY_SIGNATURE'] ?? '';
if (preg_match('/\A[0-9a-f]{64}\z/', $received) !== 1) {
    respond(401, ['error' => 'Invalid signature']);
}

$expected = hash_hmac('sha256', $rawBody, $secret);
// The known signature goes first; the untrusted header goes second.
if (!hash_equals($expected, $received)) {
    respond(401, ['error' => 'Invalid signature']);
}

try {
    $payload = json_decode($rawBody, false, 512, JSON_THROW_ON_ERROR);
} catch (JsonException $error) {
    respond(400, ['error' => 'Invalid JSON']);
}
if (!($payload instanceof stdClass)) {
    respond(400, ['error' => 'Expected a JSON object']);
}

// Validate $payload->event, timestamp, and order; process idempotently.
respond(200, ['received' => true]);
```

## Go — net/http

Save as `main.go`, set `WEBHOOK_SECRET`, then run `go run main.go`.
This example uses only the Go standard library and listens on port 8000.

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "crypto/subtle"
    "encoding/hex"
    "encoding/json"
    "io"
    "log"
    "net/http"
    "os"
)

func validSignature(rawBody []byte, received string, secret []byte) bool {
    if len(received) != sha256.Size*2 {
        return false
    }
    for _, c := range received {
        if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
            return false
        }
    }
    mac := hmac.New(sha256.New, secret)
    mac.Write(rawBody)
    expected := hex.EncodeToString(mac.Sum(nil))
    return subtle.ConstantTimeCompare([]byte(expected), []byte(received)) == 1
}

func main() {
    secret := []byte(os.Getenv("WEBHOOK_SECRET"))
    if len(secret) == 0 {
        log.Fatal("WEBHOOK_SECRET must not be empty")
    }

    http.HandleFunc("/api/webhooks/upi", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
            w.Header().Set("Allow", "POST")
            http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
            return
        }
        r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
        defer r.Body.Close()
        rawBody, err := io.ReadAll(r.Body)
        if err != nil {
            http.Error(w, "Unable to read request body", http.StatusBadRequest)
            return
        }
        received := r.Header.Get("X-Upilerify-Signature")
        if !validSignature(rawBody, received, secret) {
            http.Error(w, "Invalid signature", http.StatusUnauthorized)
            return
        }

        var payload map[string]json.RawMessage
        if err := json.Unmarshal(rawBody, &payload); err != nil || payload == nil {
            http.Error(w, "Expected a JSON object", http.StatusBadRequest)
            return
        }
        // Validate payload["event"], timestamp, and order; process idempotently.
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte(`{"received":true}`))
    })

    log.Fatal(http.ListenAndServe("127.0.0.1:8000", nil))
}
```

## Test your receiver

Start one receiver above. In another terminal, set the **same** `WEBHOOK_SECRET`.
Save this as `send-webhook.cjs` and run `node send-webhook.cjs` (Node.js 18+).
It uses the dispatcher's signing algorithm and sends only to your local server.

```js
const { createHmac } = require('node:crypto');

async function main() {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) throw new Error('Set WEBHOOK_SECRET before testing');
  const body = JSON.stringify({
    event: 'webhook.test',
    timestamp: Date.now(),
    order: { id: 'ord_test', status: 'VERIFIED', amount: 10 },
  });
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  for (const [name, rawBody, received, expectedStatus] of [
    ['valid', body, signature, 200],
    ['tampered body', body + ' ', signature, 401],
    ['wrong signature', body, '0'.repeat(64), 401],
    ['malformed signature', body, 'not-hex', 401],
    ['missing signature', body, null, 401],
  ]) {
    const headers = { 'Content-Type': 'application/json' };
    if (received !== null) headers['X-Upilerify-Signature'] = received;
    const response = await fetch('http://127.0.0.1:8000/api/webhooks/upi', {
      method: 'POST', headers, body: rawBody,
    });
    await response.text();
    if (response.status !== expectedStatus) {
      throw new Error(`${name}: expected ${expectedStatus}, got ${response.status}`);
    }
    console.log(`${name}: PASS (${response.status})`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
```

## Before processing payments

- A valid HMAC authenticates the body; it does **not** prevent replay. Validate
  the signed `timestamp` (Unix milliseconds) against a suitable freshness window,
  such as five minutes, and reject invalid or unexpectedly future timestamps.
- Persist a unique `(event, order.id)` processing record and apply fulfilment
  atomically so duplicate deliveries cannot fulfil an order twice.
- Validate the event type, order ID, status, amount, and currency assumptions
  against your own records. Never fulfil an order for `webhook.test`.
- Acknowledge with a 2xx response only after successful processing or durable
  queueing. The dispatcher waits at most five seconds for a response.
- Use HTTPS for production delivery and configure request-size limits in your
  server or reverse proxy. The local development servers above are for testing.

## Constant-time comparison references

- [Python: hmac.compare_digest](https://docs.python.org/3/library/hmac.html#hmac.compare_digest)
- [PHP: hash_equals](https://www.php.net/manual/en/function.hash-equals.php)
- [Go: subtle.ConstantTimeCompare](https://pkg.go.dev/crypto/subtle#ConstantTimeCompare)
