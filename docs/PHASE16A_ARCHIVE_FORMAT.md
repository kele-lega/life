# Life Backup Format v1

This is a portable snapshot protocol, not a synchronization wire format. The implementation lives in `src/features/cloud-backup/shared/format.ts`, `shared/records.ts`, and `local/archive.ts`.

## Container

A `.life.zip` is a regular ZIP containing exactly one `manifest.json` plus every member enumerated by that manifest. v1 writes stored (uncompressed) entries incrementally, accepts stored/deflated entries, requires a closed central directory, and rejects comments, multi-volume archives, ZIP64, duplicate entries and unsafe paths. It never executes document content.

The manifest has `format: life-backup`, `version: 1`, `dexieVersion: 6`, `exporterVersion`, `libraryId`, `capturedAt`, `counts` and `files`. Library identity is provenance, not proof of account ownership. No Session, email login credential, provider secret or temporary signed URL is included.

All seven table names must occur in counts and JSON members, including empty tables:

`moments`, `momentAppends`, `attachments`, `diaries`, `lifeEvents`, `lifeExtractionJobs`, `lifeEventProposals`.

Record paths are `records/<table>/<six-digit-part>.json`, each containing an array. Image paths use a generated UUID and a safe image extension (or `.bin` for unknown MIME types). Original filenames remain entity metadata; they never determine archive paths.

## Encoding and checksums

JSON is UTF-8 with a deterministic v1 serialization: recursively sort object keys using JavaScript string order, no whitespace, JSON string escaping, finite ECMAScript number spelling, with negative zero explicitly spelled `-0`. Arrays retain order. Unsupported/cyclic/non-JSON values fail rather than being dropped. Consumers can hash the original file bytes directly; writers for other runtimes must follow the encoder and golden test fixtures. A parsed-and-reserialized hash is not a substitute for checking original bytes.

UTF-8 decoding is strict: invalid byte sequences and BOM-prefixed/noncanonical JSON fail before any restore database is created. Decoders must never silently substitute replacement characters in original text.

Every member describes `path`, `bytes`, `sha256` (lowercase hex), and ordered `parts`. Each part has a zero-based `index`, actual `bytes` and SHA-256. Parts are 4 MiB except the last; a zero-byte file has one zero-byte part. The full file hash covers concatenated original bytes. ZIP compression, when present, is not part of this hash.

The cloud directory keeps the exact manifest bytes and their SHA-256 separately, avoiding a self-referential manifest checksum. A local archive uses its member checksums for corruption detection; they are not an authenticity signature.

## Attachment and record restoration

An Attachment JSON row retains every stored field except `blob`. Its image descriptor includes `attachmentId` and `blobType`. Rebuild `blob` from original image bytes and Blob.type, preserving fileName/mimeType/declared size independently—even if the declared metadata differs from actual bytes. No re-encoding, EXIF removal, filename rewriting of entity metadata, or remote URL substitution occurs.

IDs, created/updated/deleted time strings, title/body/originalText, favorites, location, metadata, requestKey, fingerprint, candidate/evidence, review outcomes and reciprocal Proposal/Event IDs remain unchanged. A missing optional `extractionProposalId` is not JSON null. Evidence offsets use UTF-16 code units. Day precision is not converted to midnight.

Restore does not invoke business commands. It validates stored states and uniqueness, accepts historical stale/missing sources, reports pre-existing orphan children, and rejects broken review chains. No tombstone is cleared. A new randomly named v6 database is written and read back before it can be selected; the old library remains available.

## Current limits

- Total member data: 256 MiB; total JSON record data: 32 MiB.
- Maximum 100,000 stored rows and 10,000 listed files.
- Maximum 4 MiB per JSON part; a single row must fit inside one part.
- Maximum manifest size: 4 MiB; JSON nesting: 64 levels.

Limits are checked with explicit errors, never by truncation. They bound this initial implementation, not the amount of data a user can record. A future large-library format/streaming revision must retain backward import support.
