from pathlib import Path
lines = Path('src/app/teacher/class-insight/class-insight-shell.tsx').read_text().splitlines()
for i,line in enumerate(lines):
    if line.strip() == ")":
        print(i+1)
