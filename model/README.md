# Local model assets

Import your own Cubism 2.1 model with `npm run setup -- --model-dir /path/to/model --model-entry custom.model.json --runtime /path/to/live2d.min.js`.

The importer copies referenced resources and normalizes the entry to `model.model.json`. Optional parameter and expression configuration can be imported with `--profile /path/to/profile.json`. No character assets or character-specific presets are included. Cubism 3/4 models require a different renderer.

All files here except this README are excluded from Git and source archives. Keep your model's attribution and licensing information separately.
