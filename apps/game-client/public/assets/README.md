Drop your production game assets here.

- `audio/`: music, ambience, voice, SFX. A first gameplay cue subset is generated from original `YAV` files with `pnpm imjinrok:convert-audio`.
- `graphics/`: units, buildings, terrain, UI spritesheets
- `tilesets/`: isometric tileset atlases
- `portraits/`: civilization, hero, campaign portraits
- `themes/default/ui/mission-portraits/`: statically mapped `SPEECH` portraits exported from `yfnt/hero.spr`
- `themes/default/ui/portraits/`: retained provisional `fnt/portrait.spr` exports; not used by `SPEECH`
- `themes/default/ui/main-menu/`: hash-bound original title, menu, nation, and stage-selection sprites; the manifest records each resource's source palette (`pal/initmenu.pal` for unchanged landing/menu exports and `pal/imjin2.pal` for country/mission selection exports, whose screen palette state is statically confirmed). This does not independently prove every product resource use-site; frame indices remain source indices until a separately evidenced UI binding consumes them.
