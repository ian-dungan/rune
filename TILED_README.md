# Tiled Workflow (Static Overworld)

Recommended: use **Tiled** (https://www.mapeditor.org/) to author the overworld.

## Tileset
Use `assets/tileset_32.png` as a tileset image.
Tile size: 32x32
Columns: 45
Rows: 30

## Exporting
Export your map as JSON, then run a converter (we can add this next).
For now, the runtime loads chunk JSON files from:
`assets/world/overworld/chunks/c_<cx>_<cy>.json`

Chunk JSON format:
```json
{ "w": 128, "h": 128, "rle": [[count, tileId], ...] }
```

Where `tileId` is the atlas index: `tileId = row*45 + col`.
