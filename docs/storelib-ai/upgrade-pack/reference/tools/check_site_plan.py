#!/usr/bin/env python3
"""Offline example SitePlan linter. Does NOT validate Storelib theme DSL.
For production, replace/add the repository's real theme/asset/schema validators.
"""
import json
import pathlib
import re
import sys

ALLOWED_KINDS = {'home', 'catalog', 'collection_template', 'product_template', 'about', 'faq', 'contact', 'policy', 'content', 'landing', 'app_view', 'auth', 'blog', 'service', 'course', 'community', 'member', 'dashboard'}


def validate(plan):
    errors = []
    if plan.get('schema_version') != 'storelib-siteplan-v1':
        errors.append('Missing or incorrect schema_version')
    pages = plan.get('pages')
    if not isinstance(pages, list) or not pages:
        return errors + ['pages must be a nonempty array']
    routes, ids, section_ids = set(), set(), set()
    for i, page in enumerate(pages):
        tag = f'pages[{i}]'
        for key in ('id', 'route', 'kind', 'title', 'sections'):
            if not page.get(key):
                errors.append(f'{tag}: missing {key}')
        route = page.get('route', '')
        if not isinstance(route, str) or not route.startswith('/') or ' ' in route:
            errors.append(f'{tag}: invalid route {route!r}')
        if route in routes:
            errors.append(f'{tag}: duplicate route {route}')
        routes.add(route)
        page_id = page.get('id')
        if page_id in ids:
            errors.append(f'{tag}: duplicate page id {page_id}')
        ids.add(page_id)
        if page.get('kind') not in ALLOWED_KINDS:
            errors.append(f'{tag}: unknown page kind {page.get("kind")}')
        sections = page.get('sections', [])
        if not isinstance(sections, list) or not sections:
            errors.append(f'{tag}: no sections')
            continue
        for j, sec in enumerate(sections):
            label = f'{tag}.sections[{j}]'
            for key in ('id', 'type', 'purpose', 'layout'):
                if not sec.get(key):
                    errors.append(f'{label}: missing {key}')
            sid = sec.get('id')
            if sid in section_ids:
                errors.append(f'{label}: duplicate section id {sid}')
            section_ids.add(sid)
            if sec.get('cta') and not (sec['cta'].get('text') and sec['cta'].get('destination')):
                errors.append(f'{label}: CTA requires text and destination')
    if '/' not in routes:
        errors.append('Missing homepage route /')
    # Only check exact local link destinations. Data-driven template slugs are resolved by Storelib.
    for page in pages:
        for sec in page.get('sections', []):
            cta = sec.get('cta', {})
            dest = cta.get('destination', '')
            if dest.startswith('/') and ':' not in dest and '{' not in dest and dest not in routes:
                if not any(':' in template and re.match('^'+re.sub(r':[a-zA-Z_][a-zA-Z0-9_]*', r'[^/]+', template)+'$', dest) for template in routes):
                    errors.append(f'{sec.get("id")}: CTA destination {dest} not a declared route')
    return errors


def main():
    paths = [pathlib.Path(p) for p in sys.argv[1:]]
    if not paths:
        print('Usage: python3 tools/check_site_plan.py examples/*.plan.json')
        return 2
    bad = False
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            errs = validate(data)
        except (OSError, ValueError, TypeError) as exc:
            errs = [str(exc)]
        if errs:
            bad = True
            print(f'FAIL {path}')
            for e in errs:
                print('  -', e)
        else:
            print(f'PASS {path}: {len(data["pages"])} pages, {sum(len(p["sections"]) for p in data["pages"])} sections')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
