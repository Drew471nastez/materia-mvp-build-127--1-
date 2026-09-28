"""Builds supabase/sql/run-four/ from supabase/sql/run-now/, part by part, text unchanged, and copies the same four files to supabase/sql/all-last-three-days/ and supabase/sql/all-last-14-days/ (the owner asked twice for a folder named for the window the work covers; every folder holds the same SQL, which is the whole of run-now/). Run: python3 scripts/build-run-four.py"""
import re
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
RN=ROOT+'supabase/sql/run-now/'
OUT=ROOT+'supabase/sql/run-four/'
GROUPS=[
 ('1_of_4_core.sql','1 of 4','Rate limits, newsletter, agent connections and GitHub, refunds recorded once, event and email types, order source, site speed, website addresses, coupons and the admin console, email automations.',['01','02','03','04','05','06','07','08','09','10']),
 ('2_of_4_library_checkout_uploads.sql','2 of 4','Agent MCP, library limit and privacy, checkout contacts, product bundles, upload safety, storage buckets, private digital files, storage cleanup, variant policies.',['11','12','13','14','15','16','17','18','19']),
 ('3_of_4_latest.sql','3 of 4','Saved cards, bounces and exec_sql closed, email sending, domains for a website or creator page, browser notifications and time zone, Ask Storelib conversations and pictures, Analytics speed, business accounts, creator badges, Ask Storelib reports, notification rules, website accounts and contact forms, discount code holds, orders kept with their creator, customer accounts on websites, product variant columns, company details on orders, a creator\'s own AI keys, up to three businesses on one login, the notification engine and its admin counts, receipt email records made server only, a deleted product leaving the OnePage that named it, one home for a creator\'s name and photo, the website builder agent\'s document and questions, an archived product never also published, one review per buyer per product, reviews complete (guest reviews, seller replies, reports, ratings from published reviews), one profile photo everywhere, one OnePage address in any case, the malware scan log, email records for a buyer\'s message to the seller, the picture a shared OnePage link shows, a OnePage\'s old addresses followed, the file security log, where a sale or a sign-up came from, Analytics counted the same way on every page, and money rows (orders, library, ledger, payouts, plans) written by the server only, and private columns of accounts and creators kept private with server owned ones guarded, the seller balance changed once per event in one locked step, and a deleted account that keeps its buyers\' purchases and the money records, and a copy of every deleted row kept for 90 days.',None),
]
parts={f[:2]:f for f in os.listdir(RN) if re.match(r'\d\d_.*\.sql$',f)}
# File 3 takes every part from 20 up to 89, so a new part lands there without editing this list.
GROUPS[2]=GROUPS[2][:3]+(sorted(p for p in parts if '20'<=p<='89'),)
HOW="""-- HOW: select all of this file, copy, paste into a NEW query tab in the Supabase
-- SQL editor, press Run. Run the four files in order, one at a time.
-- Safe to run again: every statement checks before it changes anything, so a
-- second run changes nothing. If Run shows an error, stop and send it; the
-- editor runs the paste as one transaction, so nothing in this file changed.
-- Built from supabase/sql/run-now/ (one statement per line, text unchanged)."""
# LAST, ON ITS OWN: part 61's placing of old page views on their property.
# It rewrites every old page view (about a minute per million rows), and a
# file is one transaction that keeps every lock it takes until it ends: in
# the file with the other parts it held the orders table, and with it every
# checkout, webhook and receipt page, for that whole minute (measured: an
# order could not be read for 75 s at a million rows). So it runs first in
# the last file instead, where it takes no lock that stops anything else: the
# order tables were released when the file before it ended, and the update
# itself lets new page views be written while it runs. Its text is
# unchanged; only where it runs moves.
LAST_ALONE={'61':'old page views placed on a property'}
def last_alone(p):
    if p not in LAST_ALONE: return None
    lines=[l for l in open(RN+parts[p]).read().rstrip('\n').split('\n')[1:] if LAST_ALONE[p] in l]
    assert len(lines)==1, (p, len(lines))
    return lines[0]
def body(p):
    lines=open(RN+parts[p]).read().rstrip('\n').split('\n')
    alone=last_alone(p)
    head=lines[0]; rest=[l for l in lines[1:] if l.strip() and l.strip()!="notify pgrst, 'reload schema';" and l!=alone]
    return head, rest
used=set()
for name,label,what,ps in GROUPS:
    out=[f"-- STORELIB DATABASE, FILE {label}", f"-- {what}", HOW, "", "set local statement_timeout = 0;", ""]
    for p in ps:
        head,rest=body(p); used.add(p)
        out.append(f"-- part {parts[p]}")
        out.append(head)
        out+=rest
        out.append("")
    out.append("notify pgrst, 'reload schema';")
    out.append(f"select 'Storelib file {label} ran. Next file.' as done;")
    open(OUT+name,'w').write("\n".join(out)+"\n")
missing=sorted(set(parts)-used-{'00','90','91','99'})
assert missing==[], missing
# file 4: storage policies (skips itself when this role cannot own them) + the check
p90=open(RN+'90_storage_policies_needs_owner.sql').read().rstrip('\n').split('\n')
assert len(p90)==2 and p90[1].count(' begin managed := ')==1
guard=(" begin if not pg_has_role(current_user, (select c.relowner from pg_class c where c.oid = 'storage.objects'::regclass), 'MEMBER') then"
       " raise notice 'storage policies skipped: this role does not own storage.objects, so they were left as they are. Everything else ran. See supabase/sql/run-four/README.md.';"
       " return; end if; managed := ")
do=p90[1].replace(' begin managed := ',guard,1)
chk=open(RN+'99_check_after.sql').read().rstrip('\n').split('\n')
chk_stmt=[l for l in chk if l.strip() and not l.startswith('/*') and not l.startswith('--')]
assert len(chk_stmt)==1
out=["-- STORELIB DATABASE, FILE 4 of 4",
     "-- Old page views placed on the property they were seen on (the last step of part 61), the storage.objects policies (seven consolidated ones), then one row of true or false, one column per part.",
     HOW, "", "set local statement_timeout = 0;", ""]
for p in sorted(LAST_ALONE):
    out+=[f"-- part {parts[p]}, its last step, here on its own so that no order waits for it (see README.md): old page views placed on the property they were seen on. About a minute per million page views; a second run changes nothing.",
          last_alone(p), ""]
out+=["-- part 90_storage_policies_needs_owner.sql, with a first step that skips it (a notice, not an error) when this role does not own storage.objects",
     p90[0], do, "",
     "-- part 99_check_after.sql: every column should read true. p90_storage_policies reads false if the step above was skipped; see README.",
     chk_stmt[0]]
open(OUT+'4_of_4_storage_policies_and_check.sql','w').write("\n".join(out)+"\n")
# The same four files under the name the owner asked for. Copied, never edited
# by hand, so the two folders cannot drift apart.
import shutil
for folder in ('all-last-three-days','all-last-14-days'):
    DAYS=ROOT+'supabase/sql/'+folder+'/'
    os.makedirs(DAYS,exist_ok=True)
    for f in sorted(os.listdir(OUT)):
        if f.endswith('.sql'): shutil.copyfile(OUT+f,DAYS+f)
for f in sorted(os.listdir(OUT)):
    if f.endswith('.sql'): print(f, os.path.getsize(OUT+f), sum(1 for l in open(OUT+f) if l.strip() and not l.startswith('--')))
# THE SAME SQL IN THREE FILES (supabase/sql/all-in-three/), which the owner
# asked for: parts 01 to 19 in one, everything from 20 in the next, and the
# storage policies and the check last. Built from the same parts, text
# unchanged, so it cannot drift from the four.
THREE=ROOT+'supabase/sql/all-in-three/'
os.makedirs(THREE,exist_ok=True)
GROUPS3=[
 ('1_of_3_core_library_checkout.sql','1 of 3','Rate limits, newsletter, agent connections and GitHub, refunds recorded once, event and email types, order source, site speed, website addresses, coupons and the admin console, email automations, agent MCP, library limit and privacy, checkout contacts, product bundles, upload safety, storage buckets, private digital files, storage cleanup, variant policies.',sorted(p for p in parts if '01'<=p<='19')),
 ('2_of_3_latest.sql','2 of 3',GROUPS[2][2],sorted(p for p in parts if '20'<=p<='89')),
]
for name,label,what,ps in GROUPS3:
    out=[f"-- STORELIB DATABASE, FILE {label}", f"-- {what}", HOW.replace('Run the four files','Run the three files'), "", "set local statement_timeout = 0;", ""]
    for q in ps:
        head,rest=body(q)
        out.append(f"-- part {parts[q]}")
        out.append(head)
        out+=rest
        out.append("")
    out.append("notify pgrst, 'reload schema';")
    out.append(f"select 'Storelib file {label} ran. Next file.' as done;")
    open(THREE+name,'w').write("\n".join(out)+"\n")
f4=open(OUT+'4_of_4_storage_policies_and_check.sql').read()
f4=f4.replace('-- STORELIB DATABASE, FILE 4 of 4','-- STORELIB DATABASE, FILE 3 of 3',1).replace('Run the four files','Run the three files')
open(THREE+'3_of_3_storage_policies_and_check.sql','w').write(f4)
for f in sorted(os.listdir(THREE)):
    if f.endswith('.sql'): print('three:', f, os.path.getsize(THREE+f))


# THE RANGE IN EACH README FOLLOWS THE PARTS. Every folder's README named the
# range by hand ("01 to 38", "01 to 45", "01 to 50") and none was rewritten
# when a part was added, so all four disagreed with each other and with
# run-now/. The numbers come from the parts themselves now.
import re as _re
_numbered=sorted(p for p in parts if p.isdigit() and '01'<=p<'90')
_span=f"{_numbered[0]} to {_numbered[-1]}"
for _folder in ('run-four','all-last-three-days','all-last-14-days','all-in-three'):
    _path=ROOT+'supabase/sql/'+_folder+'/README.md'
    if not os.path.exists(_path): continue
    _text=open(_path).read()
    _fixed=_re.sub(r"\(0[0-9] to [0-9]{2}([,)])", lambda m: f"({_span}{m.group(1)}", _text)
    if _fixed!=_text:
        open(_path,'w').write(_fixed)
        print('readme:', _folder, _span)
