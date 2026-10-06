# Public data format

All three files must agree on IDs. IDs are opaque strings: use a stable lowercase slug, with `paper:` or `study:` prefixes for entries.

## entries.json

A JSON array of lightweight records:

```json
[{"id":"paper:deepreach","title":"DeepReach","kind":"paper","year":2021,"concept_ids":[]}]
```

`kind` is `paper` or `study`. `year` is a publication year and may be null; it is not a study date. `concept_ids` are optional descriptive identifiers and are not standalone graph nodes in this version.

## entry-details.json

An object with an `entries` dictionary keyed by entry ID:

```json
{"entries":{"paper:deepreach":{
  "id":"paper:deepreach",
  "kind":"paper",
  "title":"DeepReach",
  "authors":[],
  "institutions":[],
  "publication_year":2021,
  "venue":null,
  "urls":{"paper":null,"code":null},
  "studied_month":"2026-06",
  "sessions":[],
  "public_insights":[],
  "asked_questions":[],
  "related_entry_ids":[]
}}}
```

This abbreviated example demonstrates structure, not a complete bibliography. Use verified authors, institutions, and paper URLs in your actual records. Unknown values remain null/empty; do not invent them.

`studied_month` is YYYY-MM or null. Legacy local datasets can include `sessions` with `first_discussed_date`; the UI falls back to the earliest session date. Public records should use a reviewed month and an empty session array.

Each `asked_questions` item has `question` and `answer` strings. Insights are strings. Zero insights or questions is allowed. Related IDs must exist in `entries.json`.

## map-config.json

```json
{
  "fields":[{"id":"control","title":"Control","color":"#a8a3ff"}],
  "topics":[{"id":"reachability","title":"Reachability","field_ids":["control"],"primary_field_id":"control"}],
  "memberships":[{"entry_id":"paper:deepreach","topic_ids":["reachability"],"primary_topic_id":"reachability"}]
}
```

Each topic has one primary field included in its `field_ids`. Each entry has one membership record, with one primary topic included in `topic_ids`. Add other field/topic IDs for dotted connections. Do not duplicate membership records to represent shared entries.

Node size is based on unique connected descendants, including dotted memberships, with concave scaling. Shared descendants are counted once within each branch.
