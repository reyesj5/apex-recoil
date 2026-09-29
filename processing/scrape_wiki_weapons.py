import json
import os
import re
from bs4 import BeautifulSoup

def clean_val(v):
    return re.sub(r'\[.*?\]', '', v).strip()

def parse_weapons():
    html_path = r'C:\Users\micro.VADER\.gemini\antigravity-ide\brain\f0790f3b-c131-4107-8262-e6dcd9e65ef8\.system_generated\steps\299\content.md'
    with open(html_path, encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    t2 = soup.find_all('table')[2]
    weapons = []

    for tr in t2.find_all('tr'):
        cells = [clean_val(c.get_text(' ', strip=True)) for c in tr.find_all(['th', 'td'])]
        if not cells or len(cells) < 10:
            continue

        a = tr.find('a')
        if not a or not a.get('href', '').startswith('/wiki/'):
            continue
        href = a.get('href')
        if any(h in href for h in ['Ammo', 'Boosted_Loader', 'Hammerpoint', 'Disruptor', 'Selectfire', 'Turbocharger', 'Hop-up', 'Supply_Drop', 'File:']):
            continue

        name = cells[0]
        category = cells[1]

        # Extract ammo type
        ammo_type = "Special"
        for img in tr.find_all('img'):
            alt = img.get('alt', '')
            if 'Ammo' in alt or 'Rounds' in alt or 'Shells' in alt or 'Arrows' in alt:
                ammo_type = alt.replace('.svg', '').replace('.png', '').strip()
                break

        # Extract firing modes
        modes = []
        for img in tr.find_all('img'):
            alt = img.get('alt', '')
            if alt in ['Auto', 'Single', 'Burst', '3-round burst', '4-round burst', '5-round burst']:
                modes.append(alt)
        if not modes:
            if '/' in cells[3]:
                modes = ['Auto', 'Single']
            elif 'Auto' in name:
                modes = ['Auto']
            else:
                modes = ['Single']

        body_dmg = cells[4]
        head_dmg = cells[5]
        legs_dmg = cells[9]
        rpm = cells[10]
        dps = cells[11]

        # Magazine sizes
        mags = {}
        reload_tactical = {}
        reload_full = {}
        proj_speed = None

        if len(cells) == 25:
            mags = {
                'base': cells[12],
                'level_1': cells[13],
                'level_2': cells[14],
                'level_3': cells[15]
            }
            reload_tactical = {
                'base': cells[16],
                'level_1': cells[17],
                'level_2': cells[18],
                'level_3': cells[19]
            }
            reload_full = {
                'base': cells[20],
                'level_1': cells[21],
                'level_2': cells[22],
                'level_3': cells[23]
            }
            proj_speed = cells[24]
        elif len(cells) == 19:
            mags = {
                'base': cells[12],
                'level_1': cells[13],
                'level_2': cells[14],
                'level_3': cells[15]
            }
            reload_tactical = {'base': cells[16]}
            reload_full = {'base': cells[17]}
            proj_speed = cells[18]
        elif len(cells) == 16:
            mags = {'fixed': cells[12]}
            reload_tactical = {'base': cells[13]}
            reload_full = {'base': cells[14]}
            proj_speed = cells[15]
        elif len(cells) == 22:
            mags = {'base': cells[12]}
            reload_tactical = {'base': cells[13]}
            reload_full = {'base': cells[14]}
            proj_speed = cells[-1]
        elif len(cells) == 18:
            mags = {'base': cells[12], 'level_1': cells[13], 'level_2': cells[14], 'level_3': cells[15]}
            proj_speed = cells[-1]
        elif len(cells) == 15:
            mags = {'fixed': cells[12]}
            proj_speed = cells[-1]

        weapons.append({
            'name': name,
            'category': category,
            'ammo': ammo_type,
            'modes': modes,
            'damage': {
                'body': body_dmg,
                'head': head_dmg,
                'legs': legs_dmg
            },
            'rpm': rpm,
            'dps': dps,
            'magazines': mags,
            'reload_tactical': reload_tactical,
            'reload_full': reload_full,
            'projectile_speed': proj_speed,
            'wiki_url': 'https://apexlegends.wiki.gg' + href
        })

    os.makedirs('data', exist_ok=True)
    with open('data/wiki_weapons.json', 'w', encoding='utf-8') as f:
        json.dump(weapons, f, indent=4, ensure_ascii=False)
    print(f"Saved {len(weapons)} weapons to processing/data/wiki_weapons.json")
    return weapons

if __name__ == '__main__':
    parse_weapons()
