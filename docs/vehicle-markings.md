# Vehicle markings

These are representative wartime identification schemes on the game's simplified models, not reproductions of a documented individual vehicle or regiment. Exact markings varied by unit, date and theatre. Numbers 214 and WH 21483 are representative tactical/registration identifiers, not an asserted historical identity. The game's free faction/map combinations are not a historical order of battle.

| Faction | Vehicle models | Treatment |
| --- | --- | --- |
| Germany | Panzer IV, Jagdpanther, Tiger I, Sd.Kfz. 222 | Black straight-bar Balkenkreuz with an off-white border on the turret/casemate sides. The wartime Balkenkreuz is distinct from the modern Bundeswehr cross. |
| Germany | Opel Blitz | Small black-on-white WH registration plate; no blanket tank cross on the cargo canvas. |
| USA | Sherman, M10, Pershing, M8 Greyhound | White side stars and an upper-surface circled star. Open fighting compartments receive no floating roof marking. |
| USA | GMC CCKW | Cab-side stars and a circled star on the metal bonnet. |
| UK | Churchill IV, Achilles, Daimler | Representative outlined squadron square; Allied recognition star on upper metal surfaces. The North Africa visual scheme uses a red/white recognition flash instead of the later Allied star. |
| UK | Bedford QL | Recognition marking on the metal cab/bonnet; no invented aircraft roundels on the doors or canvas. |
| UK | Black Prince | Unmarked prototype. No invented operational squadron or combat recognition scheme. |
| USSR | T-34-85, SU-100, IS-2, BA-64 | White tactical numbers, rather than indiscriminately applying red stars to every Soviet vehicle. |
| USSR | ZiS-5 | Small dark registration-style plate with white digits. |
| Japan | Shinhoto Chi-Ha, Ho-Ni I, Chi-Nu, Chiyoda, Type 94 Isuzu | Small ochre Army star on the hull/bonnet front. No generic red aircraft roundels or naval rising-sun markings. |
| All five factions | Towed artillery and AT guns | Conservative unmarked exterior; no unsupported large national emblems on every shield. |

## Historical reference basis

- [Weald Foundation — Inside Track](https://www.wealdfoundation.org/inside-track/): archival research on German recognition crosses and model-specific positioning.
- [United States military vehicle markings of WWII](https://en.wikipedia.org/wiki/United_States_military_vehicle_markings_of_World_War_II): AR 850-5 and the white national star.
- [Military Police Museum — vehicle markings](https://www.mpmuseum.org/provostvehicle.html): Allied upper-surface recognition stars and British/Commonwealth vehicle marking conventions.
- [British military vehicle markings of WWII](https://en.wikipedia.org/wiki/British_military_vehicle_markings_of_World_War_II): squadron signs and changing recognition signs. A generic aircraft-style roundel on every turret side is not appropriate.
- [US Army Combined Arms Research Library — Soviet tank inventories and hull numbers, 1944–45](https://cgsc.contentdm.oclc.org/digital/api/collection/p15040coll6/id/5523/download): wartime white tactical number practice.
- [German registration reference](https://www.wehrmachtsgespann.de/news/merkbl/GB-Merkbl/58-Kennzeichen-gb.htm): black lettering and WH Army registration prefix.
- [Tank Archives — markings](https://www.tankarchives.com/2016/04/markings.html): contemporary identification orders demonstrate the variety of Soviet marking practice.
- [Tank Museum — Black Prince / Churchill](https://tankmuseum.org/tank-nuts/tank-collection/churchill-iv/?tpage=3): the Black Prince's six prototypes arrived in 1945 and did not enter operational service.
- [Australian War Memorial — Imperial Japanese Army tank crew helmet](https://www.awm.gov.au/collection/C1208783): the yellow five-point Army identification star. This corroborates the Army symbol, not a unique vehicle's paint scheme.

## Rendering and verification

Paint triangles are projected onto the actual model surfaces only during construction, then parented to their hull, turret, cab or bonnet. The opaque vertex-color material is shared by all markings on one vehicle. No bitmap atlases, alpha blending or per-frame projection are required. Rigid hull/turret marks participate in the existing batching; movable and wreck-deformable parts retain their semantic tags.

`node scripts/check-vehicle-markings.mjs` checks all 35 faction/type combinations in Normandy and North Africa, finite geometry and preservation through batching. `node scripts/check-vehicle-batching.mjs` additionally checks weapon origins, pivots and existing model geometry.
