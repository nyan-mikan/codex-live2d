# Codex Live2D

**English** | [中文](README.zh-CN.md)

An interactive Live2D companion in the bottom-right corner of Codex desktop, with optional streamed speech through Fish Audio.

This is an independent macOS add-on. It attaches to the running desktop interface through a local debugging connection, without editing the application bundle. The renderer supports user-supplied Cubism 2.1 models without a built-in character or character assets.

## Features

- Mouse-following eyes and head, click interactions, optional user-configured expressions, and adjustable size and vertical position.
- Optional **Enable only in chat** setting: hide while a right workspace panel, a temporary sidebar, app settings, a dialog, or a non-chat page is open, and restore on return. Hidden companions stop speech and synthesis requests.
- English and Chinese settings, with instant switching and a remembered language preference.
- Circular settings and speaker buttons; collapsing the model keeps an entry to open it again.
- New assistant body text is captured incrementally. Thinking, tool output, and commentary are excluded; completed history is skipped.
- Optional Fish Audio speech, one sentence per request, with the next three sentences prefetched and decoded during playback.
- A neutral face while speaking, with audio-driven mouth movement.
- Markdown, emoji, citation/reference markers, lowercase laughter such as `www`, and decorative sentence tails such as `——`, `～` and `……` are removed before speech. Normal sentence stops, punctuation inside phrases and URL contents are preserved.
- Turning the speaker off stops playback and requests and clears queued audio. Turning it back on reads future text only.
- Automatically reuse the running official application’s declared local connection, regardless of port. No other enhancement tool is required.
- Open the original Codex from Dock, Finder, Spotlight or links. If its model connection is missing, recovery normally restarts it once after startup.

## Requirements

- macOS and Node.js **22 or later**; npm comes with Node.js. Apple Command Line Tools are needed only for the optional launcher.
- The Codex desktop application. `/Applications/ChatGPT.app` and `/Applications/Codex.app` are detected automatically.
- A **Cubism 2.1** model (`.model.json` and `.moc`) and its textures/resources.
- A compatible Cubism 2.1 `live2d.min.js` runtime that you supply separately.
- A Fish Audio API key and voice `reference_id` only if you want speech.

The GitHub repository and source ZIP include the program and permissively licensed browser libraries. **Character assets and the proprietary Live2D runtime are not included.** No npm dependencies need to be installed; the browser libraries are already pinned and bundled. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Install

### 1. Get the project

```sh
git clone https://github.com/nyan-mikan/codex-live2d.git
cd codex-live2d
node --version
```

Keep this folder in a permanent location; the recommended installation registers a background recovery service that uses it.

### 2. Import your model and runtime

For a model whose entry is `model.model.json`:

```sh
npm run setup -- --model-dir "/path/to/model" --runtime "/path/to/model.min.js"
```

For a different Cubism 2.1 entry name:

```sh
npm run setup -- --model-dir "/path/to/model" --model-entry "custom.model.json" --runtime "/path/to/model.min.js"
```

The importer validates the referenced files, copies them into `model/`, and stores the entry as `model.model.json`. It does not copy unrelated files. Models using `.model3.json`/`.moc3` need a different renderer and are not supported here. The runtime must be the Cubism **2.1** library, not `live2dcubismcore.min.js`.

Expression presets are optional and supplied in a local model profile; no character-specific presets or fixed motion indexes are built in. Obtain assets and runtimes under their applicable terms; [upstream runtime guidance](https://github.com/guansss/pixi-live2d-display#cubism-core) explains the distinction.

### 3. Check and install

```sh
npm run doctor
npm run install:desktop
```

Installation registers a user background service. Keep your original Codex Dock icon and open the official application normally from Dock, Finder, Spotlight or a link. After about ten seconds without a model connection, the service requests a normal quit and reopens Codex once with loopback-only connection parameters, then mounts the companion. The official application bundle and signature stay unchanged.

Or double-click `Install.command` after importing assets. No replacement Dock entry is created. The service also handles a currently running unprepared app after its startup grace period, so installation can cause one normal restart. macOS may request permission to control Codex for the normal quit request; quit prompts are respected and processes are not force-killed.

If the running app already declares a working connection, the service reuses it and attaches the model without restarting. A declared connection that is still starting is also left alone. The project remains independent; [startup details](docs/startup-design.md) explain the recovery guard.

The optional `npm run install:launcher` entry can still open Codex with the connection parameters on its first launch. It is not required for the recommended installation. The background service survives official app updates because it lives outside the application bundle.

The gear button opens settings; the speaker button toggles speech. Choose **Language → English / 中文** at the top of settings. The first launch follows your system language (Chinese for `zh`, English otherwise); your selection is saved locally and survives reloads. Switching language preserves unsaved form fields and ongoing speech. Assistant text and custom expression labels are kept in their original language.

For a nonstandard application location, set this before starting and installing recovery:

```sh
export CODEX_APP_PATH="/path/to/Codex.app"
npm run install:desktop
```

### 4. Automatic startup and model recovery

The recommended install above already enables this service. For an existing installation that was started manually, enable it with:

```sh
npm run install:recovery
```

This registers `~/Library/LaunchAgents/com.codex-live2d.recovery.plist` and checks every two seconds. An unprepared launch is normally restarted once after a ten-second grace period, including a new process at the same app version or after an update. A failed restart is not retried against that same process. Intentional quits are not reopened. Stopping the companion disables recovery.

Recovery verifies actual model readiness, host attachment, WebGL, frame progress and visible canvas pixels. Once the app has a connection, failed models and watchers are repaired without an app restart. Collapsed models, paused animation, background windows and chat-only hiding are preserved. Health summaries contain renderer metadata only, not answer bodies or API keys. Quit prompts, missing assets and incompatible future app changes may need manual correction; recovery cannot guarantee success in those cases.

To update an existing checkout, run `git pull --ff-only` and then `npm run install:desktop` (or double-click `Install.command` again). This reactivates the companion and reloads the registered service with the latest recovery code. Locally imported assets and settings are retained.

## Chat-only visibility

Open the gear and turn on **Enable only in chat**. The preference is off by default and saved locally. The docked chat list does not hide the companion. Opening a right workspace panel (browser, file, terminal, or review), a temporary sidebar overlay, app settings, or another non-chat page hides the companion and its controls, stops playback, and cancels queued synthesis. Close the panel or overlay and return to chat to show it again. Completed text seen while hidden is skipped; speech resumes for future answers. A model you manually collapsed stays collapsed. The companion’s own settings remain usable.

Page detection reads visible UI structure and routing metadata; it does not read response bodies. Settings and sidebar detection depend on the desktop UI and may need adaptation after updates.

## Optional model profile

Use `npm run setup -- --profile "/path/to/profile.json"` to configure parameters for your own model. The profile is stored locally as `model/profile.json` and excluded from Git and source archives. Without a profile, the companion offers mouse tracking, motions, speech and a neutral-expression control, with no predefined character expressions. Clicks select available motions rather than fixed indexes.

See [the generic example](docs/model-profile.example.json). `neutral` and `speechNeutral` hold parameter-to-number maps; `expressions` holds named `{label, parameters}` entries. `mouthParameter`, `idleMotionGroup` and `clickMotionGroup` select model-specific identifiers. The default identifiers follow Cubism 2 conventions and can be overridden. Use values appropriate for your own model.

## Fish Audio settings

Open the gear → **Speech settings · Fish Audio** and enter:

| Setting | Meaning |
| --- | --- |
| `FISH_API_KEY` | Your Fish Audio API key; entered in the password field |
| `reference_id` | The voice identifier |
| Model | The Fish speech model name, entered manually |
| Read new responses aloud | Enable speech for new assistant body text |
| Remember API key | Optional plaintext storage on this computer |

The default model name is `s2.1-pro-free`; availability depends on your account. Refer to the [Fish Audio API documentation](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech) for current names. Save your settings, then use **Test voice** to try the voice.

The key stays in the watcher process by default. If you select “remember,” it is saved in `state/fish-config.json` with owner-only file permissions. That directory is ignored by Git and source packaging. Without remembering, enter the key again after restarting the watcher.

When speech is enabled, cleaned assistant body sentences are sent to Fish Audio. The bridge does not persist answer bodies; audio is cached in memory. Turning speech off cancels playback and synthesis, including prefetch. No body-text popup is shown above the companion.

For reference-backed ChatGPT answers, the bridge follows the rendered body as it grows instead of reading the reference placeholder. It follows the visible conversation after chat switches, excludes retained hidden turns, and only reads final assistant bodies without citation pills or interactive controls.

## Stop, uninstall, or relocate

```sh
npm run stop                  # remove the companion and disable recovery
npm run uninstall:recovery    # unregister the user login service
npm run uninstall:launcher    # remove only the companion launcher
```

`Stop.command` also removes the companion. Normally quit and reopen Codex afterward to close the temporary debugging endpoint. `npm start` re-enables the companion and recovery if the service remains installed.

Before moving the folder, stop the companion and uninstall recovery from the old folder. Run `npm run install:desktop` from the new folder to register the service with its new paths. Reinstall the optional launcher separately if you use it. Do not run multiple watcher/service copies for the same app.

## Development

```sh
npm test             # text, speech queue, recovery and model-import tests
npm run preview      # local preview at http://127.0.0.1:19436 (requires assets)
npm run verify       # inspect the current desktop attachment
npm run reload       # reload changed code and restart the watcher
npm run pack:source  # ZIP of committed source under dist/ (requires a Git commit)
```

Tests mock Fish Audio and do not send paid synthesis requests. `npm run pack:source` refuses a Git tree containing local state, model assets or the proprietary runtime.

| File | Responsibility |
| --- | --- |
| `i18n.js` | English/Chinese interface translations and language selection |
| `renderer.js` | Model rendering, expressions, position and controls |
| `view-state.js` / `page-bridge.js` | Chat-page, sidebar and settings visibility detection |
| `answer-bridge.js` | Incremental assistant-body capture |
| `speech-text.js` | Text cleanup and sentence tracking |
| `fish-client.js` / `fish-host.mjs` | Speech queue, prefetch, playback and API transport |
| `inject.mjs` / `cdp.mjs` | Local attachment and watcher |
| `control.mjs` / `recovery*.mjs` | Launch, removal and model recovery without app restarts |
| `setup.mjs` | Import and validate local model/runtime resources |

## Troubleshooting and compatibility

- **Model missing after opening or updating Codex:** Check `state/recovery-status.json` and `state/recovery.log`. `wait-for-startup` precedes the one-time restart; `already-attempted` or `waiting-for-user-quit` indicates a failed attempt that will not loop. Resolve any normal-quit prompt, verify assets, then quit and open Codex yourself to allow a new attempt.
- **Missing assets:** rerun setup with the entire model directory and a compatible runtime; `npm run doctor` reports missing resources.
- **No speech:** check the speaker toggle, API key, voice ID and model. Some audio contexts need a user click to start playback.
- **Model closed:** reopen it from the gear entry; to restore a fully removed companion, run `npm start`.
- **Work/Chat views:** the bridge includes adapters for Codex, ChatGPT Work and ChatGPT Chat data. They depend on internal page metadata; verify your installed build. Automatic compatibility across future updates is not guaranteed.

The original attachment was exercised on desktop builds 26.1002.52244 and 26.1007.21159. This is not an official extension API, and UI updates may require adapter changes. Windows and Linux desktop activation are not implemented. Settings support English and Simplified Chinese.

## License

Project code: [MIT](LICENSE). Browser-library licenses: [third-party notices](THIRD_PARTY_NOTICES.md). Model assets, Live2D runtime, and trademarks remain subject to their own terms.
