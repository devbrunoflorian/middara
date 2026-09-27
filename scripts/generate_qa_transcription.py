import json, os

out = ['# QA Fidelity Transcription - Pages 1 to 10']
out.append('> Este documento contém a transcrição exata extraída do DOM, formatada por bloco e linha. Use-o para auditar a tipografia exata (Bold, Italic, Color) de cada palavra em relação ao PDF.\n')

for i in range(1, 11):
    page_str = f'{i:03d}'
    path = rf'C:\Users\bruno\Middara\Rulebook App\apps\web\public\pages\page_{page_str}\page_{page_str}_dom.json'
    
    if not os.path.exists(path):
        out.append(f'## Page {i}\n- Data not found.\n')
        continue
        
    out.append(f'## Page {i}\n')
    
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    for b_idx, b in enumerate(data.get('blocks', [])):
        out.append(f'### Block {b_idx + 1}')
        for l_idx, l in enumerate(b.get('lines', [])):
            line_str = []
            for s in l.get('spans', []):
                text = s.get('text', '').strip()
                if not text: continue
                font = s.get('font', 'Unknown')
                color = s.get('color', '#000000')
                line_str.append(f'`"{text}"` *({font}, {color})*')
            
            if line_str:
                out.append(f"- {' '.join(line_str)}")
        out.append('')
        
with open(r'C:\Users\bruno\Middara\Rulebook App\docs\QA\QA_TRANSCRIPTION_PAGES_1_10.md', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

print("Transcription generated successfully.")
