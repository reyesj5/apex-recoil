# Apex Legends Weapons Reference & Live Wiki Ground Loot Stats

Source: [The Apex Legends Wiki (wiki.gg)](https://apexlegends.wiki.gg/wiki/Weapon)

This document compiles live patch stats, magazine tier progressions (Base through **Tier 4 / Corrupted**), fire rates (RPM), tactical & full reload times, damage profiles, and weapon classes across all 29 weapon subpages currently in Apex Legends. It also compares live ground loot values against [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json).

---

## 📦 Ground Loot vs. Care Package Rotations

> [!IMPORTANT]
> In Apex Legends, seasonal Care Package / Supply Drop shifts are rotational. Weapons that enter the Care Package (e.g. R-99, Devotion, Wingman, Alternator, EVA-8) retain their foundational ground loot balance, attachment slots, and magazine progressions across standard Battle Royale and Mixtape rotations. When scraping weapon statistics, querying each weapon's dedicated page surfaces the ground loot base stats alongside extended magazine tiers.

---

## 🔴 Tier 4 / Corrupted (Mythic Red) Extended Magazines

Corrupted / Tier 4 extended magazines (`L4`) represent the highest tier magazine capacity available in Apex Legends. Individual weapon pages document the following Tier 4 capacities:

| Weapon | Category | Base | Level 1 (White) | Level 2 (Blue) | Level 3 (Purple/Gold) | Level 4 / Corrupted (Red) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| [HAVOC Rifle](https://apexlegends.wiki.gg/wiki/HAVOC_Rifle) | AR | 18 | 21 | 25 | 29 | **35** |
| [VK-47 Flatline](https://apexlegends.wiki.gg/wiki/VK-47_Flatline) | AR | 19 | 23 | 27 | 29 | **35** |
| [R-301 Carbine](https://apexlegends.wiki.gg/wiki/R-301_Carbine) | AR | 21 | 23 | 28 | 31 | **37** |
| [Nemesis Burst AR](https://apexlegends.wiki.gg/wiki/Nemesis_Burst_AR) | AR | 20 | 24 | 28 | 32 | **36** |
| [Alternator SMG](https://apexlegends.wiki.gg/wiki/Alternator_SMG) | SMG | 18 | 20 | 22 | 26 | **32** |
| [R-99 SMG](https://apexlegends.wiki.gg/wiki/R-99_SMG) | SMG | 18 | 21 | 24 | 27 | **33** |
| [Volt SMG](https://apexlegends.wiki.gg/wiki/Volt_SMG) | SMG | 20 | 22 | 24 | 27 | **32** |
| [C.A.R. SMG](https://apexlegends.wiki.gg/wiki/C.A.R._SMG) | SMG | 20 | 23 | 26 | 30 | **36** |
| [P2020](https://apexlegends.wiki.gg/wiki/P2020) | Pistol | 9 | 10 | 11 | 12 | **15** |
| [Wingman](https://apexlegends.wiki.gg/wiki/Wingman) | Pistol | 5 | 6 | 7 | 8 | **10** |

*(Note: For Akimbo P2020, magazine capacities double: 18 / 20 / 22 / 24 / **30**).*

---

## 📊 Comprehensive Ground Loot Weapon Stats Table

| Weapon | Class | Ammo | Fire Mode | RPM | DPS | Body Dmg | Mag Progression (Base / L1 / L2 / L3 / L4) | Proj Speed | Trainer Status |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: | :--- | :---: | :---: |
| [HAVOC Rifle](https://apexlegends.wiki.gg/wiki/HAVOC_Rifle) | AR | Energy Ammo | Auto | 672 | 224 | 18 | 18/21/25/29/35 | 30500 | `havoc_tc` ✅ |
| [VK-47 Flatline](https://apexlegends.wiki.gg/wiki/VK-47_Flatline) | AR | Heavy Rounds | Auto, Single | 600 | 200 | 18 | 19/23/27/29/35 | 24000 | `flatline` ✅ |
| [Hemlok Burst AR](https://apexlegends.wiki.gg/wiki/Hemlok_Burst_AR) | AR | Heavy Rounds | 3-round burst, Single, Burst, Burst | 365 [ 1 ] 384 | 122 128 | 19 | 21/24/27/30 | 27500 | `hemlok` ✅ |
| [R-301 Carbine](https://apexlegends.wiki.gg/wiki/R-301_Carbine) | AR | Light Rounds | Auto, Single | 810 | 203 | 13 | 21/23/28/31/37 | 29000 | `r301` ✅ |
| [Nemesis Burst AR](https://apexlegends.wiki.gg/wiki/Nemesis_Burst_AR) | AR | Energy Ammo | 4-round burst | 451~582 | 128~165 | 16 | 20/24/28/32/36 | 31000 | `nemesis` ✅ |
| [Alternator SMG](https://apexlegends.wiki.gg/wiki/Alternator_SMG) | SMG | Light Rounds | Auto | 600 | 180 | 16 | 18/20/22/26/32 | 19000 | `alternator` ✅ |
| [Prowler Burst PDW](https://apexlegends.wiki.gg/wiki/Prowler_Burst_PDW) | SMG | Heavy Rounds | 5-round burst | 579 795 | 154 225 | 15 | 20/25/30/35 | 18000 | `prowler` ✅ |
| [R-99 SMG](https://apexlegends.wiki.gg/wiki/R-99_SMG) | SMG | Light Rounds | Auto | 1080 | 216 | 14 max | 18/21/24/27/33 | 19000 | `r99` ✅ |
| [Volt SMG](https://apexlegends.wiki.gg/wiki/Volt_SMG) | SMG | Energy Ammo | Auto | 720 | 192 | 15 | 20/22/24/27/32 | 20000 | `volt` ✅ |
| [C.A.R. SMG](https://apexlegends.wiki.gg/wiki/C.A.R._SMG) | SMG | Heavy / Light Rounds | Auto | 930 | 217 | 12 | 20/23/26/30/36 | 18000 | `car` ✅ |
| [Devotion LMG](https://apexlegends.wiki.gg/wiki/Devotion_LMG) | LMG | Energy Ammo | Auto | 300–900 | 80–240 | 16 | 36/40/44/48 | 33500 | `devotion_tc` ✅ |
| [L-STAR EMG](https://apexlegends.wiki.gg/wiki/L-STAR_EMG) | LMG | Energy Ammo | Auto | 600 | 190 | 17 | 24/26/28/30 | 24000 | `lstar` ✅ |
| [M600 Spitfire](https://apexlegends.wiki.gg/wiki/M600_Spitfire) | LMG | Light Rounds | Auto | 540 | 189 | 18 | 35/40/45/50 | 27500 | `spitfire` ✅ |
| [Rampage LMG](https://apexlegends.wiki.gg/wiki/Rampage_LMG) | LMG | Heavy Rounds | Auto | 300 390 | 145 189 | 26 | 28/32/36/40 | 26500 | `rampage` ✅ |
| [G7 Scout](https://apexlegends.wiki.gg/wiki/G7_Scout) | Marksman | Light Rounds | Single | 246 | 135 | 33 | 10/12/14/26 | 30000 | ❌ Not Added |
| [Triple Take](https://apexlegends.wiki.gg/wiki/Triple_Take) | Marksman | Energy Ammo | Single | 108 (hipfire) 78 (ADS) | 121 | 63 | 12 | 32000 | ❌ Not Added |
| [30-30 Repeater](https://apexlegends.wiki.gg/wiki/30-30_Repeater) | Marksman | Heavy Rounds | Single | 139 | 100 | 39 min | 6/7/8/10 | 29000 | ❌ Not Added |
| [Bocek Compound Bow](https://apexlegends.wiki.gg/wiki/Bocek_Compound_Bow) | Marksman | Arrows | Single | ??? | ??? | 35 min | 40 | 10000 min | ❌ Not Added |
| [Charge Rifle](https://apexlegends.wiki.gg/wiki/Charge_Rifle) | Sniper | Sniper Ammo | Single | 26 84 | 33~48 78~116 | 75 min | 6/7/8/9 | 33501 | ❌ Not Added |
| [Longbow DMR](https://apexlegends.wiki.gg/wiki/Longbow_DMR) | Sniper | Sniper Ammo | Single | 78 | 78 | 55 | 6/8/10/12 | 30500 | ❌ Not Added |
| [Kraber .50-Cal Sniper](https://apexlegends.wiki.gg/wiki/Kraber_.50-Cal_Sniper) | Sniper | Mythic Sniper Ammo | Single | 25 | 63 | 140 | 4 | 29500 | ❌ Not Added |
| [Sentinel](https://apexlegends.wiki.gg/wiki/Sentinel) | Sniper | Sniper Ammo | Single | 37 45 | 44 66 | 70 | 4/5/6/7 | 31000 | ❌ Not Added |
| [EVA-8 Auto](https://apexlegends.wiki.gg/wiki/EVA-8_Auto) | Shotgun | Shotgun Shells | Auto | 168 / 181 / 193 / 202 | 156 / 168 / 179 / 187 | 56 | 8 | 16000 | ❌ Not Added |
| [Mastiff Shotgun](https://apexlegends.wiki.gg/wiki/Mastiff_Shotgun) | Shotgun | Shotgun Shells | Single | 66 / 73 / 76 / 79 | 105 / 115 / 120 / 124 | 90 | 5 | 16000 | ❌ Not Added |
| [Mozambique Shotgun](https://apexlegends.wiki.gg/wiki/Mozambique_Shotgun) | Shotgun | Shotgun Shells | Auto | 160 / 176 / 184 / 192 175 / 193 / 201 / 210 | 132.6 / 145.8 / 156.06 / 163.2 148.4 / 163.7 / 170.8 / 178.5 | 45 | 5 | 10000 | ❌ Not Added |
| [Peacekeeper](https://apexlegends.wiki.gg/wiki/Peacekeeper) | Shotgun | Shotgun Shells | Single | 44 / 47 / 50 / 51 | 72 / 77 / 82 / 84 | 99 | 5 | 16000 | ❌ Not Added |
| [RE-45 Auto](https://apexlegends.wiki.gg/wiki/RE-45_Auto) | Pistol | Light Rounds | Auto | 780 | 182 | 12 | 20/21/23/26 | 19500 | `re45` ✅ |
| [P2020](https://apexlegends.wiki.gg/wiki/P2020) | Pistol | Light Rounds | Single | 420 480 | 168 192 | 21 | 9/10/11/12/15 | 18500 | ❌ Not Added |
| [Wingman](https://apexlegends.wiki.gg/wiki/Wingman) | Pistol | Sniper Ammo | Single | 168 | 140 | 45 | 5/6/7/8/10 | 18000 | ❌ Not Added |

---

## 🔍 Live Ground Loot Discrepancies vs `client/specs.json`

Comparing our active recoil specifications in `client/specs.json` against live wiki ground loot data reveals key discrepancies where previous versions configured weapons with crate-locked capacities or outdated magazine sizes:

---

## ⏱️ Technical Reload & Handling Times

| Weapon | Tactical Reload (Base / L1 / L2 / L3 / L4) | Full Reload (Base / L1 / L2 / L3 / L4) |
| :--- | :--- | :--- |
| [HAVOC Rifle](https://apexlegends.wiki.gg/wiki/HAVOC_Rifle) | - | - |
| [VK-47 Flatline](https://apexlegends.wiki.gg/wiki/VK-47_Flatline) | 2.4 / 2.32 / 2.24 / 2.16 / ??? | 3.1 / 3 / 2.89 / 2.79 / 4.2 2.8 |
| [Hemlok Burst AR](https://apexlegends.wiki.gg/wiki/Hemlok_Burst_AR) | 2.4 / 2.32 / 2.24 / 2.16 | 2.85 / 2.76 / 2.66 / 2.57 |
| [R-301 Carbine](https://apexlegends.wiki.gg/wiki/R-301_Carbine) | 2.4 / 2.32 / 2.24 / 2.16 | 3.2 / 3.09 / 2.99 / 2.88 / 4.3 2.9 |
| [Nemesis Burst AR](https://apexlegends.wiki.gg/wiki/Nemesis_Burst_AR) | 2.7 / 2.61 / 2.52 / 2.43 | 3 / 2.9 / 2.8 / 2.7 / 4.1 2.7 |
| [Alternator SMG](https://apexlegends.wiki.gg/wiki/Alternator_SMG) | 1.9 / 1.84 / 1.77 / 1.71 | 2.2 / 2.1 / 2.08 / 2.01 / 3.2 2.0 |
| [Prowler Burst PDW](https://apexlegends.wiki.gg/wiki/Prowler_Burst_PDW) | 2 / 1.93 / 1.87 / 1.8 | 2.6 / 2.51 / 2.43 / 2.34 |
| [R-99 SMG](https://apexlegends.wiki.gg/wiki/R-99_SMG) | 1.8 / 1.74 / 1.68 / 1.62 | 2.5 / 2.4 / 2.3 / 2.2 / 3.6 2.2 |
| [Volt SMG](https://apexlegends.wiki.gg/wiki/Volt_SMG) | 1.44 / 1.39 / 1.34 / 1.3 | 2.5 / 2.4 / 2.3 / 2.2 / 3.6 2.2 |
| [C.A.R. SMG](https://apexlegends.wiki.gg/wiki/C.A.R._SMG) | 1.7 / 1.64 / 1.59 / 1.53 | 2.1 / 2.1 / 2.0 / 1.9 / 3.1 1.9 |
| [Devotion LMG](https://apexlegends.wiki.gg/wiki/Devotion_LMG) | 2.8 / 2.71 / 2.52 / ??? | 3.63 / 3.51 / 3.27 / ??? |
| [L-STAR EMG](https://apexlegends.wiki.gg/wiki/L-STAR_EMG) | - | - |
| [M600 Spitfire](https://apexlegends.wiki.gg/wiki/M600_Spitfire) | 3.4 / 3.29 / 3.17 / 3.06 | 4.2 / 4.06 / 3.92 / 3.78 |
| [Rampage LMG](https://apexlegends.wiki.gg/wiki/Rampage_LMG) | 3.1 / 3 / 2.89 / 2.79 | 4 / 3.87 / 3.73 / 3.6 |
| [G7 Scout](https://apexlegends.wiki.gg/wiki/G7_Scout) | 2.4 / 2.32 / 2.24 / 2.16 | 3 / 2.9 / 2.8 / 2.7 |
| [Triple Take](https://apexlegends.wiki.gg/wiki/Triple_Take) | 2.6 | 3.4 |
| [30-30 Repeater](https://apexlegends.wiki.gg/wiki/30-30_Repeater) | Segmented [ 1 ] | Segmented [ 1 ] |
| [Bocek Compound Bow](https://apexlegends.wiki.gg/wiki/Bocek_Compound_Bow) | - | - |
| [Charge Rifle](https://apexlegends.wiki.gg/wiki/Charge_Rifle) | 3.5 / 3.38 / 3.27 / 3.15 | 4.6 / 4.45 / 4.29 / 4.14 |
| [Longbow DMR](https://apexlegends.wiki.gg/wiki/Longbow_DMR) | 2.66 / 2.57 / 2.48 / 2.39 | 3.66 / 3.54 / 3.41 / 3.29 |
| [Kraber .50-Cal Sniper](https://apexlegends.wiki.gg/wiki/Kraber_.50-Cal_Sniper) | 3.2 | 4.3 |
| [Sentinel](https://apexlegends.wiki.gg/wiki/Sentinel) | 3 / 2.9 / 2.8 / 2.7 | 4 / 3.87 / 3.73 / 3.6 |
| [EVA-8 Auto](https://apexlegends.wiki.gg/wiki/EVA-8_Auto) | 2.75 / 2.65 / 2.56 / 2.48 | 3 / 2.9 / 2.79 / 2.7 |
| [Mastiff Shotgun](https://apexlegends.wiki.gg/wiki/Mastiff_Shotgun) | Segmented [ 1 ] | Segmented [ 1 ] |
| [Mozambique Shotgun](https://apexlegends.wiki.gg/wiki/Mozambique_Shotgun) | 2.1 2.5 | 2.6 3 |
| [Peacekeeper](https://apexlegends.wiki.gg/wiki/Peacekeeper) | 2.5 / 2.42 / 2.33 / 2.25 | 3.5 / 3.38 / 3.27 / 3.15 |
| [RE-45 Auto](https://apexlegends.wiki.gg/wiki/RE-45_Auto) | 1.5 | 1.95 |
| [P2020](https://apexlegends.wiki.gg/wiki/P2020) | ??? | 1.2 / 1.8 2.6 / 3.6 |
| [Wingman](https://apexlegends.wiki.gg/wiki/Wingman) | - | - |

---

## 🎯 Damage Modifiers Reference

| Weapon | Headshot | Body | Legs / Fortified |
| :--- | :---: | :---: | :---: |
| [HAVOC Rifle](https://apexlegends.wiki.gg/wiki/HAVOC_Rifle) | 32 | 18 | 82 |
| [VK-47 Flatline](https://apexlegends.wiki.gg/wiki/VK-47_Flatline) | 32 | 18 | 18 |
| [Hemlok Burst AR](https://apexlegends.wiki.gg/wiki/Hemlok_Burst_AR) | 33 | 19 | 54 |
| [R-301 Carbine](https://apexlegends.wiki.gg/wiki/R-301_Carbine) | 23 | 13 | 13 |
| [Nemesis Burst AR](https://apexlegends.wiki.gg/wiki/Nemesis_Burst_AR) | 28 | 16 | 60 |
| [Alternator SMG](https://apexlegends.wiki.gg/wiki/Alternator_SMG) | 20 | 16 | 18 |
| [Prowler Burst PDW](https://apexlegends.wiki.gg/wiki/Prowler_Burst_PDW) | 23 | 15 | 75 |
| [R-99 SMG](https://apexlegends.wiki.gg/wiki/R-99_SMG) | 18 max | 14 max | 12 |
| [Volt SMG](https://apexlegends.wiki.gg/wiki/Volt_SMG) | 19 | 15 | 15 |
| [C.A.R. SMG](https://apexlegends.wiki.gg/wiki/C.A.R._SMG) | 15 | 12 | 13 |
| [Devotion LMG](https://apexlegends.wiki.gg/wiki/Devotion_LMG) | 24 | 16 | 16 |
| [L-STAR EMG](https://apexlegends.wiki.gg/wiki/L-STAR_EMG) | 26 | 17 | 19 |
| [M600 Spitfire](https://apexlegends.wiki.gg/wiki/M600_Spitfire) | 27 | 18 | 21 |
| [Rampage LMG](https://apexlegends.wiki.gg/wiki/Rampage_LMG) | 39 | 26 | 29 |
| [G7 Scout](https://apexlegends.wiki.gg/wiki/G7_Scout) | 58 | 33 | 31 |
| [Triple Take](https://apexlegends.wiki.gg/wiki/Triple_Take) | 111 | 63 | 69 |
| [30-30 Repeater](https://apexlegends.wiki.gg/wiki/30-30_Repeater) | 68 min | 39 min | 53 |
| [Bocek Compound Bow](https://apexlegends.wiki.gg/wiki/Bocek_Compound_Bow) | 42 min | 35 min | 28 min |
| [Charge Rifle](https://apexlegends.wiki.gg/wiki/Charge_Rifle) | 150 min | 75 min | 90 |
| [Longbow DMR](https://apexlegends.wiki.gg/wiki/Longbow_DMR) | 124 | 55 | 56 |
| [Kraber .50-Cal Sniper](https://apexlegends.wiki.gg/wiki/Kraber_.50-Cal_Sniper) | 280 | 140 | 141 |
| [Sentinel](https://apexlegends.wiki.gg/wiki/Sentinel) | 140 | 70 | 93 |
| [EVA-8 Auto](https://apexlegends.wiki.gg/wiki/EVA-8_Auto) | 72 | 56 | 64 |
| [Mastiff Shotgun](https://apexlegends.wiki.gg/wiki/Mastiff_Shotgun) | 114 | 90 | 110 |
| [Mozambique Shotgun](https://apexlegends.wiki.gg/wiki/Mozambique_Shotgun) | 57 | 45 | 57 |
| [Peacekeeper](https://apexlegends.wiki.gg/wiki/Peacekeeper) | 126 | 99 | 126 |
| [RE-45 Auto](https://apexlegends.wiki.gg/wiki/RE-45_Auto) | 18 | 12 | 15 |
| [P2020](https://apexlegends.wiki.gg/wiki/P2020) | 32 | 21 | 25 |
| [Wingman](https://apexlegends.wiki.gg/wiki/Wingman) | 97 | 45 | 53 |

---

## 🛠️ Recoil Discovery & Spec Architecture Notes

1. **Coordinate Extension for Tier 4 Magazines:**
   - Recoil patterns in `client/specs.json` store coordinate arrays `x`, `y`, and `time_points` indexed by shot count.
   - When expanding magazine sizes to include Corrupted L4 (e.g. R-99 to 33, R-301 to 37, Flatline to 35), coordinate vectors must be populated for those additional shots (e.g. shots 31..33 for R-99) using `recoil_discovery` capture or pattern stabilization to satisfy schema verification (`len_x >= max_mag`).
2. **Care Package vs Ground Loot Dual-Specs:**
   - If both crate and ground loot variations are needed, weapons can offer a mode toggle or separate spec IDs (e.g. `r99_crate` vs `r99`).
3. **Akimbo Weapon Recoil:**
   - P2020 Akimbo and Mozambique Akimbo double fire capacity and alter fire rates. They should be modeled as separate weapon entries with distinct timing intervals.
