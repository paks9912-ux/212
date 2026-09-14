# Сборка презентации: подставляет снимки из shots/ в presentation.src.html
import base64, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')


# ---------------------------------------------------------------
# Данные автора предложения. Заполните — и пересоберите презентацию.
# Пустая строка в url убирает ссылку и QR-код со слайдов.
AUTHOR = {
    'name':  'Имя Фамилия',                 # как подписываемся
    'role':  'Дизайн и разработка сайтов',  # чем занимаетесь, одна строка
    'url':   'https://example.com',         # ссылка на портфолио
    'phone': '+996 700 000 000',
    'email': 'hello@example.com',
}
# ---------------------------------------------------------------

def qr_uri(url):
    """QR-код ссылки на портфолио — чтобы заказчик открыл его прямо с экрана."""
    import io
    import qrcode
    q = qrcode.QRCode(box_size=8, border=1,
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    q.add_data(url)
    q.make(fit=True)
    buf = io.BytesIO()
    q.make_image(fill_color='#0B0D10', back_color='white').save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

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
    'about':    'p-about.jpg',    'tablet':   'p-tablet.jpg',
    'figure':   'p-figure.jpg',   'trust':    'p-trust.jpg',
    'prod':     'p-prod.jpg',     'old_proj': 'p-old-proj.jpg',
    'tourposter': 'tour-poster.jpg', 'disp': 'p-disp.jpg',
    'disp_phone': 'p-disp-phone.jpg',
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

def video_uri(name, mime='video/mp4'):
    with open(os.path.join(SHOTS, name), 'rb') as f:
        return 'data:' + mime + ';base64,' + base64.b64encode(f.read()).decode()

html = open(os.path.join(HERE, 'presentation.src.html'), encoding='utf-8').read()
html = html.replace('{{tourwebm}}', video_uri('tour.webm', 'video/webm'))
html = html.replace('{{tour}}', video_uri('tour.mp4'))
html = html.replace('{{fonts}}', fonts_css())
for key, name in IMAGES.items():
    html = html.replace('{{' + key + '}}', data_uri(name))

label = AUTHOR['url'].replace('https://', '').replace('http://', '').rstrip('/')
html = html.replace('{{author_name}}', AUTHOR['name'])
html = html.replace('{{author_role}}', AUTHOR['role'])
html = html.replace('{{author_url_label}}', label)
html = html.replace('{{author_url}}', AUTHOR['url'])
html = html.replace('{{author_phone_href}}', AUTHOR['phone'].replace(' ', ''))
html = html.replace('{{author_phone}}', AUTHOR['phone'])
html = html.replace('{{author_email}}', AUTHOR['email'])
html = html.replace('{{author_qr}}', qr_uri(AUTHOR['url']) if AUTHOR['url'] else '')

out = os.path.join(HERE, 'presentation.html')
open(out, 'w', encoding='utf-8').write(html)

# Артефакт получает голый фрагмент: обвязку <head> дорисовывает площадка.
# Для файла на диске и для хостинга нужен полноценный документ, иначе телефон
# отрисует страницу шириной 980px, а кириллица может приехать без charset.
SHELL = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0B0D10">
<meta name="robots" content="noindex">
<title>{title}</title>
</head>
<body>
{body}
</body>
</html>
"""
m = re.match(r'\s*<title>(.*?)</title>\s*', html, re.S)
title, body = (m.group(1), html[m.end():]) if m else ('СУ №4', html)
standalone = os.path.join(HERE, 'presentation-standalone.html')
open(standalone, 'w', encoding='utf-8').write(
    SHELL.format(title=title, body=body))

print('готово:', round(os.path.getsize(out) / 1048576, 2), 'МБ',
      '| отдельный файл:', round(os.path.getsize(standalone) / 1048576, 2), 'МБ')
