from pathlib import Path
text = Path('src/components/subject-learning-interface.tsx').read_text()
paren = brace = bracket = 0
line = 1
state = None
escape = False
for ch in text:
    if ch == '\n':
        line += 1
        escape = False
        continue
    if escape:
        escape = False
        continue
    if ch == '\\':
        escape = True
        continue
    if state is None:
        if ch ==  :
            state =  single
 continue
 if ch == ':
 state = 'double'
 continue
 if ch == '':
 state = 'template'
 continue
 else:
 if ch ==  and state == single:
            state = None
        elif ch == ' and state == 'double':
            state = None
        elif ch == '' and state == 'template':
            state = None
        continue
    if ch == '(':
        paren += 1
    elif ch == ')':
        paren -= 1
    elif ch == '{':
        brace += 1
    elif ch == '}':
        brace -= 1
    elif ch == '[':
        bracket += 1
    elif ch == ']':
        bracket -= 1
    if 14780 <= line <= 14840:
        print('line', line, 'paren', paren, 'brace', brace, 'bracket', bracket)
