from pathlib import Path
lines=Path('src/components/subject-learning-interface.tsx').read_text().splitlines()
start=[i for i,line in enumerate(lines) if '{moduleIsExpanded && (' in line][0]
end=[i for i,line in enumerate(lines) if '                      )}' in line and i>start][0]
print('start', start+1, 'end', end+1)
new_lines=lines[:start]+['              {moduleIsExpanded && <div className= p-2>placeholder</div>}']+lines[end+1:]
Path('src/components/subject-learning-interface.tsx').write_text('\n'.join(new_lines)+'\n')
