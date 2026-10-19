from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageChops
import json, shutil, html

root = Path('artifacts/real-account')
out = root / 'comparisons'
out.mkdir(exist_ok=True)
refs = sorted(Path('C:/Users/User/Desktop/NOVIQ DESIGN').glob('*.jpg'))
assert len(refs) == 8
names = ['dashboard', 'planner', 'flashcards', 'focus', 'notes', 'tutor', 'analytics', 'pricing']
differences = [
 'Flat usable canvas replaces photographed perspective. NOVIQ navigation remains. Recorded task progress replaces unsupported work/life balance; actual study evidence replaces sample totals. Tool tabs follow the overview. The lower timer opens the real Focus page.',
 'NOVIQ navigation replaces the people rail. Existing plan controls and save status remain above the calendar. Only saved tasks are displayed; no fictional events, collaboration, sharing or Spotify integration.',
 'The global NOVIQ sidebar remains alongside the study modes. Existing deck library, details and study launch controls remain available. Card terms use saved content. No third-party creator identity or unsupported games are added.',
 'An existing original fern SVG supplies botanical atmosphere instead of the photographic fern. Existing work/break modes, daily goal, sounds and reflection are retained. This remains a material visual difference from the immersive photographic reference.',
 'Existing note/source navigation and Sources/AI occupy the three panes. The reference graph and object-property table are not reproduced as unsupported relationships or metadata. Saved notes remain plain text; this remains a material functional/visual adaptation.',
 'The actual NOVIQ sidebar remains outside chat history. Real Tutor controls stay above the canvas. A short welcome prompt, orb and wide composer preserve the main hierarchy. Existing attachment controls remain; image/video generation controls are omitted.',
 'The global navigation stays at the left rather than the reference middle column. A 35-day personal study matrix replaces institutional rows. Recorded study time, streak and card coverage replace GPA/attendance. Calendar uses saved Planner tasks; no fictional people or events.',
 'Two real Free/PRO plans replace four fictional hosting tiers. Configured UZS pricing and payment availability remain authoritative. Decorative orbit artwork is omitted. Membership administration follows pricing. The original Free upgrade page is deliberately unchanged.'
]
panels=[]
for i,(name,ref) in enumerate(zip(names,refs)):
 theme='light' if name in ('planner','tutor','pricing') else 'dark'
 final=root/'pro'/f'{name}-{theme}-1600.png'
 assert final.exists()
 shutil.copyfile(ref,out/f'reference-{i+1:02}.jpg')
 a=Image.open(ref).convert('RGB'); b=Image.open(final).convert('RGB')
 pair=Image.new('RGB',(1600,720),'#e9edf3'); d=ImageDraw.Draw(pair)
 pair.paste(ImageOps.contain(a,(780,660)),(10,45)); pair.paste(ImageOps.contain(b,(780,660)),(810,45))
 d.text((15,15),f'{i+1:02} {name} / Reference {a.width} x {a.height}',fill='black')
 d.text((815,15),f'Actual implementation / {b.width} x {b.height} / {theme}',fill='black')
 pair.save(out/f'{name}-comparison.jpg')
 # Difference from the captured starting implementation, not a misleading pixel-fidelity score.
 before=root/'pro-before'/f'{name}-light-1600.png'
 if before.exists():
  delta=ImageChops.difference(Image.open(before).convert('RGB'),Image.open(root/'pro'/f'{name}-light-1600.png').convert('RGB'))
  ImageOps.autocontrast(delta).save(out/f'{name}-before-after-difference.png')
 panels.append(f'<section><h2>{i+1:02} · {name.title()}</h2><img src="{name}-comparison.jpg" alt="Reference and actual {name} screenshot"><p>{html.escape(differences[i])}</p><p><a href="../pro/{name}-light-1600.png">Final light</a> · <a href="../pro/{name}-dark-1600.png">Final dark</a></p></section>')
free=[]
for before in sorted((root/'free-before').glob('*.png')):
 after=root/'free-after'/before.name
 diff=ImageChops.difference(Image.open(before).convert('RGB'),Image.open(after).convert('RGB'))
 changed=sum(pixel != (0,0,0) for pixel in diff.getdata())
 free.append({'file':before.name,'changed_pixels':changed})
assert len(free)==16
(root/'free-comparison.json').write_text(json.dumps(free,indent=2))
(out/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>NOVIQ reference review</title><style>body{margin:0;background:#f3f5f8;color:#14213d;font:16px/1.6 Arial,sans-serif}main{max-width:1600px;margin:auto;padding:32px}section{background:white;padding:24px;margin:24px 0;border-radius:16px}img{width:100%;height:auto}h1,h2{line-height:1.2}a{color:#2e5eaa}p{max-width:100ch}</style><main><h1>NOVIQ PRO — reference and implementation review</h1><p>All eight original reference files were opened successfully. These are real Playwright captures of the application using isolated test records. They certify local rendering, not production service availability or exact reference reproduction. Original reference dimensions are shown; application captures use a consistent 1600 × 1100 viewport. Responsive captures at 820, 390 and 320 pixels are in pro.</p><p>Free before/after: '+str(len(free))+' captures, '+str(sum(x['changed_pixels'] for x in free))+' changed pixels.</p>'+''.join(panels)+'</main></html>',encoding='utf8')
print('Created eight reference comparisons, eight before/after difference images, and Free pixel comparison:',sum(x['changed_pixels'] for x in free))
