import json
import os
import re
from bs4 import BeautifulSoup

weapon_files = {
    'HAVOC Rifle': {'id': 'havoc_tc', 'step': 399, 'category': 'AR', 'ammo': 'Energy Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/HAVOC_Rifle'},
    'VK-47 Flatline': {'id': 'flatline', 'step': 393, 'category': 'AR', 'ammo': 'Heavy Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/VK-47_Flatline'},
    'Hemlok Burst AR': {'id': 'hemlok', 'step': 413, 'category': 'AR', 'ammo': 'Heavy Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/Hemlok_Burst_AR'},
    'R-301 Carbine': {'id': 'r301', 'step': 391, 'category': 'AR', 'ammo': 'Light Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/R-301_Carbine'},
    'Nemesis Burst AR': {'id': 'nemesis', 'step': 317, 'category': 'AR', 'ammo': 'Energy Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/Nemesis_Burst_AR'},
    'Alternator SMG': {'id': 'alternator', 'step': 397, 'category': 'SMG', 'ammo': 'Light Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/Alternator_SMG'},
    'Prowler Burst PDW': {'id': 'prowler', 'step': 401, 'category': 'SMG', 'ammo': 'Heavy Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/Prowler_Burst_PDW'},
    'R-99 SMG': {'id': 'r99', 'step': 381, 'category': 'SMG', 'ammo': 'Light Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/R-99_SMG'},
    'Volt SMG': {'id': 'volt', 'step': 395, 'category': 'SMG', 'ammo': 'Energy Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/Volt_SMG'},
    'C.A.R. SMG': {'id': 'car', 'step': 411, 'category': 'SMG', 'ammo': 'Heavy / Light Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/C.A.R._SMG'},
    'Devotion LMG': {'id': 'devotion_tc', 'step': 387, 'category': 'LMG', 'ammo': 'Energy Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/Devotion_LMG'},
    'L-STAR EMG': {'id': 'lstar', 'step': 407, 'category': 'LMG', 'ammo': 'Energy Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/L-STAR_EMG'},
    'M600 Spitfire': {'id': 'spitfire', 'step': 405, 'category': 'LMG', 'ammo': 'Light Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/M600_Spitfire'},
    'Rampage LMG': {'id': 'rampage', 'step': 409, 'category': 'LMG', 'ammo': 'Heavy Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/Rampage_LMG'},
    'G7 Scout': {'id': 'g7_scout', 'step': 478, 'category': 'Marksman', 'ammo': 'Light Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/G7_Scout'},
    'Triple Take': {'id': 'triple_take', 'step': 480, 'category': 'Marksman', 'ammo': 'Energy Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/Triple_Take'},
    '30-30 Repeater': {'id': '3030_repeater', 'step': 482, 'category': 'Marksman', 'ammo': 'Heavy Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/30-30_Repeater'},
    'Bocek Compound Bow': {'id': 'bocek', 'step': 494, 'category': 'Marksman', 'ammo': 'Arrows', 'url': 'https://apexlegends.wiki.gg/wiki/Bocek_Compound_Bow'},
    'Charge Rifle': {'id': 'charge_rifle', 'step': 486, 'category': 'Sniper', 'ammo': 'Sniper Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/Charge_Rifle'},
    'Longbow DMR': {'id': 'longbow', 'step': 484, 'category': 'Sniper', 'ammo': 'Sniper Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/Longbow_DMR'},
    'Kraber .50-Cal Sniper': {'id': 'kraber', 'step': 492, 'category': 'Sniper', 'ammo': 'Mythic Sniper Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/Kraber_.50-Cal_Sniper'},
    'Sentinel': {'id': 'sentinel', 'step': 488, 'category': 'Sniper', 'ammo': 'Sniper Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/Sentinel'},
    'EVA-8 Auto': {'id': 'eva8', 'step': 423, 'category': 'Shotgun', 'ammo': 'Shotgun Shells', 'url': 'https://apexlegends.wiki.gg/wiki/EVA-8_Auto'},
    'Mastiff Shotgun': {'id': 'mastiff', 'step': 490, 'category': 'Shotgun', 'ammo': 'Shotgun Shells', 'url': 'https://apexlegends.wiki.gg/wiki/Mastiff_Shotgun'},
    'Mozambique Shotgun': {'id': 'mozambique', 'step': 421, 'category': 'Shotgun', 'ammo': 'Shotgun Shells', 'url': 'https://apexlegends.wiki.gg/wiki/Mozambique_Shotgun'},
    'Peacekeeper': {'id': 'peacekeeper', 'step': 417, 'category': 'Shotgun', 'ammo': 'Shotgun Shells', 'url': 'https://apexlegends.wiki.gg/wiki/Peacekeeper'},
    'RE-45 Auto': {'id': 're45', 'step': 403, 'category': 'Pistol', 'ammo': 'Light Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/RE-45_Auto'},
    'P2020': {'id': 'p2020', 'step': 419, 'category': 'Pistol', 'ammo': 'Light Rounds', 'url': 'https://apexlegends.wiki.gg/wiki/P2020'},
    'Wingman': {'id': 'wingman', 'step': 415, 'category': 'Pistol', 'ammo': 'Sniper Ammo', 'url': 'https://apexlegends.wiki.gg/wiki/Wingman'},
}

base_path = r'C:\Users\micro.VADER\.gemini\antigravity-ide\brain\f0790f3b-c131-4107-8262-e6dcd9e65ef8\.system_generated\steps'
parsed_weapons = {}

for name, meta in weapon_files.items():
    file_path = os.path.join(base_path, str(meta['step']), 'content.md')
    if not os.path.exists(file_path):
        continue

    with open(file_path, encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    technical_stats = {}
    damage_stats = {}

    # Extract technical table rows
    for tr in soup.find_all('tr'):
        tds = tr.find_all(['th', 'td'])
        if len(tds) == 2:
            k = tds[0].get_text(strip=True).lower()
            if k in ['rpm', 'dps', 'magazine', 'tac reload time', 'full reload time', 'fire mode', 'projectile speed']:
                technical_stats[k] = (tds[1].decode_contents(), tds[1].get_text(' ', strip=True))

    # Extract target modifiers / damage
    for t in soup.find_all('table'):
        txt = t.get_text(' ', strip=True)
        if 'Target Modifiers' in txt and 'Damage' in txt:
            for tr in t.find_all('tr'):
                cols = [c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'])]
                if cols and len(cols) >= 2:
                    if 'Head' in cols[0]:
                        damage_stats['head'] = cols[1]
                    elif 'Body' in cols[0]:
                        damage_stats['body'] = cols[1]
                    elif 'Legs' in cols[0] or 'Fortified' in cols[0]:
                        damage_stats['legs'] = cols[1]

    # Process magazine data
    mag_html, mag_raw = technical_stats.get('magazine', ('', ''))
    
    single_mag_list = []
    akimbo_mag_list = []

    if meta['id'] == 'p2020':
        all_nums = [int(x) for x in re.findall(r'\b\d+\b', mag_raw)]
        # P2020 has 5 single tiers and 5 akimbo tiers
        if len(all_nums) >= 10:
            single_mag_list = all_nums[:5]
            akimbo_mag_list = all_nums[5:10]
        else:
            single_mag_list = [9, 10, 11, 12, 15]
            akimbo_mag_list = [18, 20, 22, 24, 30]
    elif meta['id'] == 'mozambique':
        all_nums = [int(x) for x in re.findall(r'\b\d+\b', mag_raw)]
        if len(all_nums) >= 2:
            single_mag_list = [all_nums[0]]
            akimbo_mag_list = [all_nums[1]]
        else:
            single_mag_list = [5]
            akimbo_mag_list = [10]
    elif 'overheated' in mag_raw:
        # L-STAR: 24 / 26 / 28 / 30 before overheated
        single_mag_list = [int(x) for x in re.findall(r'\b\d+\b', mag_raw)]
    else:
        single_mag_list = [int(x) for x in re.findall(r'\b\d+\b', mag_raw)]

    # Check for Corrupted / Tier 4 Extended Magazine
    has_l4 = len(single_mag_list) >= 5 or 'mythic' in mag_html.lower() or 'corrupted' in mag_html.lower()

    # Assign tier labels
    tier_names = ['base', 'level_1', 'level_2', 'level_3', 'level_4_corrupted']
    mag_tiers = {}
    for idx, val in enumerate(single_mag_list):
        if idx < len(tier_names):
            mag_tiers[tier_names[idx]] = val

    akimbo_mag_tiers = {}
    if akimbo_mag_list:
        for idx, val in enumerate(akimbo_mag_list):
            if idx < len(tier_names):
                akimbo_mag_tiers[tier_names[idx]] = val

    parsed_weapons[meta['id']] = {
        'name': name,
        'id': meta['id'],
        'category': meta['category'],
        'ammo': meta['ammo'],
        'url': meta['url'],
        'rpm': technical_stats.get('rpm', ('', ''))[1],
        'dps': technical_stats.get('dps', ('', ''))[1],
        'fire_mode': technical_stats.get('fire mode', ('', ''))[1],
        'projectile_speed': technical_stats.get('projectile speed', ('', ''))[1],
        'mag_raw': mag_raw,
        'mag_tiers': mag_tiers,
        'mag_list': single_mag_list,
        'has_l4': has_l4,
        'akimbo_mag_tiers': akimbo_mag_tiers if akimbo_mag_tiers else None,
        'akimbo_mag_list': akimbo_mag_list if akimbo_mag_list else None,
        'tac_reload': technical_stats.get('tac reload time', ('', ''))[1],
        'full_reload': technical_stats.get('full reload time', ('', ''))[1],
        'damage': damage_stats
    }

# Save output
os.makedirs('data', exist_ok=True)
output_path = os.path.join('data', 'wiki_weapons_detailed.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(parsed_weapons, f, indent=4, ensure_ascii=False)

print(f"Successfully processed {len(parsed_weapons)} weapons into {output_path}")
