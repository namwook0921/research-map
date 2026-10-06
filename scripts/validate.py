#!/usr/bin/env python3
"""Validate the public map's required fields and references (not factual accuracy)."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
data_root = root if all((root / name).exists() for name in ('entries.json', 'entry-details.json', 'map-config.json')) else root / 'examples'
entries = json.loads((data_root / 'entries.json').read_text())
details = json.loads((data_root / 'entry-details.json').read_text())['entries']
config = json.loads((data_root / 'map-config.json').read_text())
errors = []
def require(condition, message):
    if not condition:
        errors.append(message)

def unique(items, label):
    ids = [x['id'] for x in items]
    require(len(ids) == len(set(ids)), f'Duplicate {label} IDs')
    return set(ids)

entry_ids = unique(entries, 'entry')
field_ids = unique(config['fields'], 'field')
topic_ids = unique(config['topics'], 'topic')
require(set(details) == entry_ids, 'Entry/sidebar IDs do not match')
for t in config['topics']:
    require(bool(t['field_ids']) and set(t['field_ids']) <= field_ids, f'Invalid fields: {t["id"]}')
    require(t['primary_field_id'] in t['field_ids'], f'Invalid primary field: {t["id"]}')
member_ids = []
for m in config['memberships']:
    member_ids.append(m['entry_id'])
    require(m['entry_id'] in entry_ids, f'Unknown entry: {m["entry_id"]}')
    require(bool(m['topic_ids']) and set(m['topic_ids']) <= topic_ids, f'Invalid topics: {m["entry_id"]}')
    require(m['primary_topic_id'] in m['topic_ids'], f'Invalid primary topic: {m["entry_id"]}')
require(len(member_ids) == len(set(member_ids)) and set(member_ids) == entry_ids, 'Each entry needs exactly one membership')
for e in entries:
    require(e.get('kind') in ('paper', 'study') and bool(e.get('title')), f'Invalid entry: {e["id"]}')
    d = details.get(e['id'], {})
    require(d.get('id') == e['id'] and d.get('kind') == e['kind'], f'Mismatched details: {e["id"]}')
    month = d.get('studied_month')
    require(month is None or bool(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month)), f'Invalid study month: {e["id"]}')
    require(isinstance(d.get('sessions'), list), f'Missing sessions array: {e["id"]}')
    require(set(d.get('related_entry_ids', [])) <= entry_ids, f'Unknown related entry: {e["id"]}')
    for q in d.get('asked_questions', []):
        require(bool(q.get('question')) and bool(q.get('answer')), f'Incomplete question: {e["id"]}')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'Valid: {len(entries)} entries, {len(config["topics"])} topics, {len(config["fields"])} fields.')
