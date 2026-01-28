from pathlib import Path
lines = Path('src/app/teacher/class-insight/class-insight-shell.tsx').read_text().splitlines()
for i in range(310, 330):
    print(i+1, repr(lines[i]))
