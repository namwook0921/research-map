#!/usr/bin/env python3
"""Prepare private text transcripts from a supported conversation export."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('export', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
records = json.loads(args.export.read_text())
if not isinstance(records, list) or any(not isinstance(c, dict) or not isinstance(c.get('mapping'), dict) for c in records):
    parser.error('Expected a list of conversations with mapping objects; this export format is unsupported.')
args.output.mkdir(parents=True, exist_ok=True)
for i, conversation in enumerate(records):
    nodes = conversation['mapping']
    # Prefer the active branch. If absent, retain all text messages for manual review.
    chain, seen = [], set()
    ident = conversation.get('current_node')
    while ident in nodes and ident not in seen:
        seen.add(ident)
        chain.append(nodes[ident])
        ident = nodes[ident].get('parent')
    selected = list(reversed(chain)) if chain else list(nodes.values())
    messages = []
    for node in selected:
        msg = node.get('message') or {}
        role = (msg.get('author') or {}).get('role')
        parts = (msg.get('content') or {}).get('parts') or []
        text = '\n'.join(part for part in parts if isinstance(part, str)).strip()
        if role in ('user', 'assistant') and text:
            stamp = msg.get('create_time')
            try:
                date = datetime.fromtimestamp(float(stamp), timezone.utc).isoformat() if stamp else 'unknown'
            except (ValueError, TypeError, OverflowError, OSError):
                date = 'unknown'
            messages.append((role, date, text))
    out = args.output / f'conversation-{i:05d}.txt'
    if out.exists():
        parser.error(f'Refusing to overwrite {out}; use a new output directory.')
    header = [f'Title: {conversation.get("title", "Untitled")}', f'Private conversation ID: {conversation.get("id", "unknown")}', f'User text messages: {sum(m[0] == "user" for m in messages)}', 'Branch: active path' if chain else 'Branch: all nodes; review duplicates/branches manually']
    out.write_text('\n'.join(header) + '\n\n' + '\n\n'.join(f'[{role} | {date}]\n{text}' for role, date, text in messages))
print(f'Prepared {len(records)} private transcripts in {args.output}. Review before extraction; do not publish them.')
