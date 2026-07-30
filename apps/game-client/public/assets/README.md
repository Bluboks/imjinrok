Drop your production game assets here.

- `audio/`: music, ambience, voice, SFX. A first gameplay cue subset is generated from original `YAV` files with `pnpm imjinrok:convert-audio`.
- `graphics/`: units, buildings, terrain, UI spritesheets
- `tilesets/`: isometric tileset atlases
- `portraits/`: civilization, hero, campaign portraits
- `themes/default/ui/mission-portraits/`: statically mapped `SPEECH` portraits exported from `yfnt/hero.spr`
- `themes/default/ui/portraits/`: retained provisional `fnt/portrait.spr` exports; not used by `SPEECH`
- `themes/default/ui/main-menu/`: hash-bound original title, menu, nation, and stage-selection sprites; the manifest records each resource's source palette. Unchanged landing/menu exports use `pal/initmenu.pal`; the statically confirmed country/mission screen palette state uses `pal/imjin2.pal`. The `stage-palette-menu-button-catalog` entry is catalog-only, not the project-adapted stage Back control: its nonempty source frames carry mismatched labels (`계속`, `옵션`, `초기메뉴`, `저장`, `로드`, `재시작`, `종료`) and frames 21-23 are empty. This does not independently prove every product resource use-site; frame indices remain source indices until a separately evidenced UI binding consumes them.
