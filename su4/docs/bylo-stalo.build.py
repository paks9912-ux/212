# Сборка страницы «Было и стало»: подставляет снимки из shots/ в bylo-stalo.src.html
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
    'new_proj': 'p-new-proj.jpg', 'new_page': 'p-new-page.jpg',
    'new_cta':  'p-new-cta.jpg',
}

html = open(os.path.join(HERE, 'bylo-stalo.src.html'), encoding='utf-8').read()
for key, name in IMAGES.items():
    html = html.replace('{{' + key + '}}', data_uri(name))

out = os.path.join(HERE, 'bylo-stalo.html')
open(out, 'w', encoding='utf-8').write(html)
print('готово:', round(os.path.getsize(out) / 1048576, 2), 'МБ')
