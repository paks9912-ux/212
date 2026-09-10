# Сборка презентации: подставляет снимки из shots/ в presentation.src.html
import base64, os
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')

def data_uri(name):
    with open(os.path.join(SHOTS, name), 'rb') as f:
        return 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode()

IMAGES = {
    'old_hero': 'p-old-hero.jpg', 'new_hero': 'p-new-hero.jpg',
    'old_serv': 'p-old-serv.jpg', 'new_serv': 'p-new-serv.jpg',
    'old_mob':  'p-old-mob.jpg',  'new_mob':  'p-new-mob.jpg',
    'mob_serv': 'p-mob-serv.jpg', 'new_proj': 'p-new-proj.jpg',
    'new_page': 'p-new-page.jpg', 'new_cta':  'p-new-cta.jpg',
    'lightbox': 'p-lightbox.jpg', 'case':     'p-case.jpg',
    'about':    'p-about.jpg',
}

def fonts_css():
    src = os.path.join(HERE, '..', 'assets', 'fonts')
    css = open(os.path.join(src, 'fonts.css'), encoding='utf-8').read()
    for name in sorted(os.listdir(src)):
        if not name.endswith('.woff2'):
            continue
        with open(os.path.join(src, name), 'rb') as f:
            uri = 'data:font/woff2;base64,' + base64.b64encode(f.read()).decode()
        for prefix in ('url(fonts/', 'url(../fonts/', 'url('):
            css = css.replace(prefix + name + ')', 'url(' + uri + ')')
    return css

html = open(os.path.join(HERE, 'presentation.src.html'), encoding='utf-8').read()
html = html.replace('{{fonts}}', fonts_css())
for key, name in IMAGES.items():
    html = html.replace('{{' + key + '}}', data_uri(name))

out = os.path.join(HERE, 'presentation.html')
open(out, 'w', encoding='utf-8').write(html)
print('готово:', round(os.path.getsize(out) / 1048576, 2), 'МБ')
