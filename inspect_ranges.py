from pathlib import Path
text = Path('src/app/teacher/class-insight/page.tsx').read_text()
start = text.index('range: "0')
print(repr(text[start:start+40]))
print('---')
start2 = text.index('range: "3')
print(repr(text[start2:start2+40]))
