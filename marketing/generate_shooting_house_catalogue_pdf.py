from pathlib import Path

OUT = Path('marketing/SHOOTING_HOUSE_MODULAIRE_SYSTEME_BOIS.pdf')

PAGE_W, PAGE_H = 595, 842
MARGIN = 48
FONT_SIZE = 11
LEAD = 16


def esc(text: str) -> str:
    return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def wrap(text: str, width: int = 95):
    words = text.split()
    lines, cur = [], ''
    for w in words:
        nxt = (cur + ' ' + w).strip()
        if len(nxt) <= width:
            cur = nxt
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


pages = []
cur = []
y = PAGE_H - MARGIN


def add_line(text, size=FONT_SIZE):
    global y, cur
    if y < MARGIN + 40:
        pages.append(cur)
        cur = []
        y = PAGE_H - MARGIN
    cur.append((MARGIN, y, size, text))
    y -= LEAD if size <= 12 else (size + 6)


def add_space(px=8):
    global y
    y -= px


def title(t):
    add_line(t, 22)


def section(t):
    add_space(6)
    add_line(t, 16)


def subsection(t):
    add_space(3)
    add_line(t, 13)


def para(text):
    for line in wrap(text):
        add_line(line)


def bullets(items):
    for it in items:
        for i, line in enumerate(wrap(it, 88)):
            prefix = '• ' if i == 0 else '  '
            add_line(prefix + line)


def visual(text):
    add_line('[ ' + text + ' ]')
    add_space(4)


title('SHOOTING HOUSE MODULAIRE')
add_line('Système bois modulaire d’entraînement', 14)
add_space(8)
para('Catalogue produit professionnel destiné à la présentation client, au support commercial et à la documentation technique.')
visual('VISUEL : vue 3D d’un complexe complet')

section('2. CONCEPT GÉNÉRAL')
para('Le système repose sur une architecture modulaire composée de panneaux standardisés, assemblés rapidement pour former des pièces puis des complexes complets.')
bullets(['Système modulaire robuste et évolutif.', 'Assemblage par panneaux.', 'Flexibilité des configurations selon le scénario.'])
visual('VISUEL : modules + assemblage')

section('3. MODULES STANDARD')
for name, pts, vis in [
    ('Mur plein', ['Dimensions : 2500 x 1250 x 153 mm', 'Structure bois + OSB', 'Fonction : cloisonnement'], 'VISUEL : mur plein isolé'),
    ('Mur avec fenêtre', ['Basé sur mur standard', 'Ouverture renforcée'], 'VISUEL : mur avec fenêtre'),
    ('Module porte', ['Sans traverse basse', 'Linteau renforcé', 'Module évolutif'], 'VISUEL : module porte'),
    ('Passage libre', ['Sans panneau', 'Renfort supérieur'], 'VISUEL : passage libre'),
    ('Système de fixation', ['Boulonnage standard', 'Montage rapide'], 'VISUEL : détails fixation'),
]:
    subsection(name)
    bullets(pts)
    visual(vis)

section('4. LOGIQUE D’ASSEMBLAGE')
para('La construction suit la logique : modules → pièces → complexe. Cette progression garantit la lisibilité industrielle du produit et la facilité de reconfiguration.')
visual('VISUEL : progression assemblage')

section('5. BIBLIOTHÈQUE DES PIÈCES TYPES')
for name, pts in [
    ('Cellule simple', ['5 murs + 1 porte']),
    ('Cellule observation', ['4 murs + 1 fenêtre + 1 porte']),
    ('Cellule traversante', ['2 portes']),
    ('Cellule angle (L)', []),
    ('Cellule angle avec fenêtre', []),
    ('Cellule double', []),
    ('Cellule ouverte', []),
    ('Cellule en U', []),
    ('Cellule multi-entrée', []),
    ('Cellule tactique avancée', []),
]:
    subsection(name)
    if pts:
        bullets(pts)
    visual('VISUEL')

section('6. CONFIGURATIONS COMPLEXES')
bullets(['Configuration 40 m²', 'Configuration 60 m²', 'Configuration 80 m²', 'Les couloirs sont créés par les espaces entre les pièces.'])
visual('VISUEL : vue globale')

section('7. MODULARITÉ')
bullets(['Ajout de modules selon les besoins.', 'Modification des configurations existantes.', 'Évolutivité sans refonte complète.'])

section('8. STRUCTURE EXTÉRIEURE (OPTION)')
bullets(['Structure métallique.', 'Passerelle d’observation.', 'Travail au sol uniquement.'])
visual('VISUEL')

section('9. LOGIQUE PRODUIT')
bullets(['Catalogue basé sur modules.', 'Pièces standard.', 'Personnalisation.', 'Devis basé sur quantités.'])

pages.append(cur)

objects = []

# font object
objects.append('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
font_obj = 1

page_objs = []
content_objs = []
for p in pages:
    stream_lines = ['BT']
    for x, yy, size, text in p:
        stream_lines.append(f'/F1 {size} Tf {x} {yy} Td ({esc(text)}) Tj')
    stream_lines.append('ET')
    stream = '\n'.join(stream_lines)
    content = f'<< /Length {len(stream.encode())} >>\nstream\n{stream}\nendstream'
    objects.append(content)
    content_id = len(objects)
    content_objs.append(content_id)

for cid in content_objs:
    page = f'<< /Type /Page /Parent 0 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] /Resources << /Font << /F1 {font_obj} 0 R >> >> /Contents {cid} 0 R >>'
    objects.append(page)
    page_objs.append(len(objects))

kids = ' '.join([f'{pid} 0 R' for pid in page_objs])
pages_obj = f'<< /Type /Pages /Kids [ {kids} ] /Count {len(page_objs)} >>'
objects.append(pages_obj)
pages_id = len(objects)

# patch parent refs
for pid in page_objs:
    objects[pid-1] = objects[pid-1].replace('/Parent 0 0 R', f'/Parent {pages_id} 0 R')

catalog = f'<< /Type /Catalog /Pages {pages_id} 0 R >>'
objects.append(catalog)
catalog_id = len(objects)

pdf = ['%PDF-1.4\n']
offsets = [0]
for i, obj in enumerate(objects, start=1):
    offsets.append(sum(len(x.encode()) for x in pdf))
    pdf.append(f'{i} 0 obj\n{obj}\nendobj\n')

xref_pos = sum(len(x.encode()) for x in pdf)
pdf.append(f'xref\n0 {len(objects)+1}\n')
pdf.append('0000000000 65535 f \n')
for i in range(1, len(objects)+1):
    pdf.append(f'{offsets[i]:010d} 00000 n \n')
pdf.append(f'trailer\n<< /Size {len(objects)+1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n')

OUT.write_bytes(''.join(pdf).encode('latin-1', 'replace'))
print(f'PDF généré: {OUT}')
