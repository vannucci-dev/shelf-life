# 0004: Barcode lookup via Open Food Facts with a local cache

- Status: Accepted
- Date: 2026-11-26

## Context
Barcodes identify products reliably but carry no expiry date. Commercial product APIs cost money. Open Food Facts is free, open-licensed (ODbL) and has good UK/EU grocery coverage, though it has gaps.

## Decision
Scan on-device (`BarcodeDetector`, with a `zxing-wasm` fallback). Look codes up in this order: the local cache, then the user's own overrides, then our server's `products` table, then Open Food Facts. Cache every result. When a code is not found, fall back to a photo or manual entry, and remember the user's answer.

## Consequences
- Free, and works offline for products the user has scanned before.
- Some products, such as own-brand and loose items, will be missing. The user override covers those.
- We must follow Open Food Facts API etiquette: send a custom User-Agent with no personal details, and keep the request rate low.
- The expiry date still comes from a date photo, an estimate, or manual entry.
