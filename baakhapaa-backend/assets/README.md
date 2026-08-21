# Bundled fonts

## NotoSansDevanagari-Regular.ttf

Noto Sans Devanagari, from the Google Fonts repository
(`ofl/notosansdevanagari`), licensed under the **SIL Open Font License 1.1**.

It is bundled — not merely found on the host — because that is the only way the
PDF export renders Nepali dialogue anywhere other than this Windows machine.
`export_service._FONT_CANDIDATES` searches `assets/` first and only then falls
back to system paths; the Windows entry (`Nirmala.ttc`) is a Microsoft font,
usable for local development and **not redistributable**.

`tests/test_font_asset.py` asserts this file exists whenever
`REQUIRE_SHIPPABLE_FONT=true`, which is what should be set in CI and at deploy.

The OFL requires the licence to travel with the font: see
https://openfontlicense.org and the family's `OFL.txt` in the upstream repo.
