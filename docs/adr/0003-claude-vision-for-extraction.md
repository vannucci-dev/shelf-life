# 0003: Use Claude vision for photo extraction

- Status: Accepted
- Date: 2026-11-26

## Context
Turning a photo into items means recognising products and reading printed dates, which come in many formats ("BB 03/25", "USE BY 12 DEC", embossed or dot-matrix print). On-device OCR plus heuristics is free and private, but it handles product recognition and messy dates poorly.

## Decision
Send a resized photo to a server-side function that calls the Claude API with a vision prompt that returns strict JSON. The output includes per-field confidence and a suggested location. The model ID is a configuration value.

## Consequences
- High accuracy, and several products can be read from one photo.
- Requires a connection, and costs a small amount per photo, so we apply a rate limit.
- Photos leave the device. They are not stored by us unless the user opts in.
- We need a small eval set of real photos to catch regressions when the prompt or model changes.
