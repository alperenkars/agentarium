# Character artwork

Seven free avatar choices are integrated: two Huberthart characters and five
Styloo characters. Their distribution terms differ; see each section below.

## Huberthart: Monk and Hood

Monk and Hood are by **Huberthart / HUBERT.H ART 2D**, from
[2D Character - Cute & Chibi: Free Pack](https://huberthart.itch.io/2d-character-cute-chibi-free-pack).

Downloaded the creator's `Free.zip` on 2026-09-23. Both original character
sprite sheets are used without repainting or AI processing. The renderer
uses the first four 288px cells for walking (6 frames per second), and the
first cell for idle, following the supplied Unity animation metadata.
The complete sheets include additional actions, which are not activated by
this avatar-only integration. No Unity scripts or audio are executed.

The creator confirms commercial use on the pack page. Neither the page nor
the included readme establishes permission to redistribute the raw artwork
under Agentarium's future open-source license. **Do not commit the images or
archive to a public repository, or treat them as open-source artwork.** Obtain
explicit permission before redistributing them. No permission request has been
sent. A production/public distribution review is still required.

The images in `public/assets/huberthart/` and the original archive in
`.local-assets/` are deliberately Git-ignored. The local build includes images
when present, so do not publish that build until the distribution review.

### Local setup for another checkout

1. Download the free pack directly from the creator's page and extract it.
2. Run `node scripts/import-huberthart.mjs "/path/to/extracted/Free"`.
3. Start the app. Without the images, avatar controls still work, but show
   an explicit "Artwork unavailable" placeholder.

The free pack contains exactly two main characters, not the creator's paid
full collection. Users can choose either character for any agent; duplicate
avatars are expected. No purchase is required for this integration.

## Styloo: Ninja, Knight, Merchant, Archer, Student

Original models and animations by **Styloo**, from
[Chibi Characters](https://styloo.itch.io/chibi). The creator lists the pack
under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) and states
that no generative AI was used. Downloaded the free `ChibiCharactersV1.2.zip`
on 2026-09-23. No paid Blender/Krita source files were purchased or used.

`public/assets/styloo/` contains transparent PNG renders of the five original
`glb emission` models, using their supplied idle and walking animations.
These derived CC0 sprites may be included in the repository. Attribution is
retained for provenance, although CC0 does not require it. The source archive
and extracted GLBs remain in the ignored `.local-assets/` directory.

The models are rendered, not repainted or AI-generated. The bake uses Blender
5.1.2, original emission materials (as recommended by the artist), an
orthographic camera, transparent backgrounds and Standard color management.
Each character has a 288 × 356 idle image and eight walking frames played
at 10 fps. The browser uses the resulting sprites, not a live 3D engine.

To regenerate after downloading and extracting the free archive:

```sh
blender --background --python-exit-code 1 --python scripts/render-styloo.py -- "/path/to/ChibiCharacters" public/assets/styloo
```

Append a character folder name (for example `archer`) to regenerate just one.
Blender is only needed for baking; running Agentarium uses the included PNGs.
