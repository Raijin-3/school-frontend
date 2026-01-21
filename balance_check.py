from pathlib import Path
text=Path('src/components/subject-learning-interface.tsx').read_text().splitlines()
paren=0
brace=0
for idx,line in enumerate(text,1):
    in_single=False
    in_double=False
    in_template=False
    i=0
    while i<len(line):
        ch=line[i]
        if ch=='\\':
            i+=1
            continue
        if ch==  and not in_double and not in_template:
            in_single=not in_single
            i+=1
            continue
        if ch== \' and not in_single and not in_template:
 in_double=not in_double
 i+=1
 continue
 if ch=='' and not in_single and not in_double:
 in_template=not in_template
 i+=1
 continue
 if not (in_single or in_double or in_template):
 if ch=='(':
 paren+=1
 elif ch==')':
 paren-=1
 elif ch=='{':
 brace+=1
 elif ch=='}':
 brace-=1
 i+=1
 if 14820<=idx<=14835:
 print(idx, 'paren', paren, 'brace', brace)
