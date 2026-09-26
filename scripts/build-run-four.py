"""Builds supabase/sql/run-four/ from supabase/sql/run-now/, part by part, text unchanged, and copies the same four files to supabase/sql/all-last-three-days/ (the owner asked for a folder named for when the work landed: every part in run-now/ was written on 2026-09-24 to 26, so the two folders hold the same SQL). Run: python3 scripts/build-run-four.py"""
import re
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
RN=ROOT+'supabase/sql/run-now/'
OUT=ROOT+'supabase/sql/run-four/'
GROUPS=[
 ('1_of_4_core.sql','1 of 4','Rate limits, newsletter, agent connections and GitHub, refunds recorded once, event and email types, order source, site speed, website addresses, coupons and the admin console, email automations.',['01','02','03','04','05','06','07','08','09','10']),
 ('2_of_4_library_checkout_uploads.sql','2 of 4','Agent MCP, library limit and privacy, checkout contacts, product bundles, upload safety, storage buckets, private digital files, storage cleanup, variant policies.',['11','12','13','14','15','16','17','18','19']),
 ('3_of_4_latest.sql','3 of 4','Saved cards, bounces and exec_sql closed, email sending, domains for a website or creator page, browser notifications and time zone, Ask Storelib conversations and pictures, Analytics speed, business accounts, creator badges, Ask Storelib reports, notification rules, website accounts and contact forms, discount code holds, orders kept with their creator, customer accounts on websites, product variant columns, company details on orders, a creator\'s own AI keys, up to three businesses on one login.',None),
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
def body(p):
    lines=open(RN+parts[p]).read().rstrip('\n').split('\n')
    head=lines[0]; rest=[l for l in lines[1:] if l.strip() and l.strip()!="notify pgrst, 'reload schema';"]
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
     "-- The storage.objects policies (seven consolidated ones), then one row of true or false, one column per part.",
     HOW, "", "set local statement_timeout = 0;", "",
     "-- part 90_storage_policies_needs_owner.sql, with a first step that skips it (a notice, not an error) when this role does not own storage.objects",
     p90[0], do, "",
     "-- part 99_check_after.sql: every column should read true. p90_storage_policies reads false if the step above was skipped; see README.",
     chk_stmt[0]]
open(OUT+'4_of_4_storage_policies_and_check.sql','w').write("\n".join(out)+"\n")
# The same four files under the name the owner asked for. Copied, never edited
# by hand, so the two folders cannot drift apart.
import shutil
DAYS=ROOT+'supabase/sql/all-last-three-days/'
os.makedirs(DAYS,exist_ok=True)
for f in sorted(os.listdir(OUT)):
    if f.endswith('.sql'): shutil.copyfile(OUT+f,DAYS+f)
for f in sorted(os.listdir(OUT)):
    if f.endswith('.sql'): print(f, os.path.getsize(OUT+f), sum(1 for l in open(OUT+f) if l.strip() and not l.startswith('--')))
