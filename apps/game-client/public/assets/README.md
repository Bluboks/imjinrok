Drop your production game assets here.

- `audio/`: music, ambience, voice, SFX. A first gameplay cue subset is generated from original `YAV` files with `pnpm imjinrok:convert-audio`.
- `graphics/`: units, buildings, terrain, UI spritesheets
- `tilesets/`: isometric tileset atlases
- `portraits/`: civilization, hero, campaign portraits
- `themes/default/ui/mission-portraits/`: statically mapped `SPEECH` portraits exported from `yfnt/hero.spr`
- `themes/default/ui/portraits/`: retained provisional `fnt/portrait.spr` exports; not used by `SPEECH`
- `themes/default/ui/main-menu/`: hash-bound original title, menu, nation, and stage-selection sprites converted with `pal/initmenu.pal`; frame indices remain source indices until a separately evidenced UI binding consumes them.
