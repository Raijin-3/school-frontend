from pathlib import Path
lines=Path('src/app/teacher/class-insight/class-insight-shell.tsx').read_text(encoding='utf-8').splitlines()
for i in range(360, 460):
    print(f'{i+1:04d}: {lines[i]}')
