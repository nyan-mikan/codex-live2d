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
- Markdown, emoji, citation/reference markers, and lowercase laughter such as `www` are removed before speech. URLs containing `www` are preserved.
- Turning the speaker off stops playback and requests and clears queued audio. Turning it back on reads future text only.
- A lightweight Dock launcher opens the official app with model parameters on the first attempt. Background recovery repairs the companion without automatically quitting Codex.

## Requirements

- macOS, Node.js **22 or later**, and Apple Command Line Tools (`xcode-select --install`) to build the tiny local launcher; npm comes with Node.js.
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

Installation creates `~/Applications/Codex Live2D.app`, using the installed Codex icon. Drag this launcher to Dock and remove the old pinned Codex shortcut. It starts the real, unmodified Codex application with the local connection parameters immediately, with no quit/reopen cycle and no Terminal window. Clicking while Codex is running focuses it without restarting the watcher or interrupting speech. The launcher follows the official application's installed path, so replacing the app during updates does not overwrite it.

Or double-click `Install.command` after importing assets. If Codex is already running without a model connection, installation leaves it running: finish your work, quit it yourself, then use the new launcher next time. `Start.command` / `npm start` use the same no-restart behavior.

Use **Codex Live2D.app** for Dock, Finder or Spotlight launches. Opening the original application directly, or through a link that launches it first, may omit the model connection; recovery waits instead of quitting the app. Keeping the original bundle intact means startup arguments cannot be guaranteed for every external entry point. This mode prioritizes uninterrupted work.

The gear button opens settings; the speaker button toggles speech. Choose **Language → English / 中文** at the top of settings. The first launch follows your system language (Chinese for `zh`, English otherwise); your selection is saved locally and survives reloads. Switching language preserves unsaved form fields and ongoing speech. Assistant text and custom expression labels are kept in their original language.

For a nonstandard application location, set this before starting and installing recovery:

```sh
export CODEX_APP_PATH="/path/to/Codex.app"
npm run install:desktop
```

### 4. Background recovery without app restarts

The recommended install above already enables this service. For an existing installation that was started manually, enable it with:

```sh
npm run install:recovery
```

This registers `~/Library/LaunchAgents/com.codex-live2d.recovery.plist` for your user account and checks every two seconds. The service restores missing or failed models when the local connection is available. If startup parameters are absent, it records `waiting-for-launcher` and waits for your next launch through **Codex Live2D.app**. It never automatically quits or reopens Codex, including after updates, and respects intentional quits. Stopping the companion disables recovery.

Recovery verifies actual model readiness, host attachment, WebGL, frame progress, and visible canvas pixels. A live watcher alone is not considered success. Missing or failed renderers are remounted without restarting Codex, with retries backing off from two seconds to one minute. A stale or unhealthy watcher is replaced. Collapsed models, paused animation, background windows and chat-only hiding are preserved. Health summaries in `state/watcher-health.json` and `state/recovery-status.json` contain renderer metadata only, not answer bodies or API keys. Missing assets, absent startup parameters and incompatible future app changes still need correction; automatic recovery cannot guarantee success in those cases.

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

## Stop, uninstall, or relocate

```sh
npm run stop                  # remove the companion and disable recovery
npm run uninstall:recovery    # unregister the user login service
npm run uninstall:launcher    # remove only the companion launcher
```

`Stop.command` also removes the companion. Normally quit and reopen Codex afterward to close the temporary debugging endpoint. `npm start` re-enables the companion and recovery if the service remains installed.

Before moving the folder, stop the companion and uninstall recovery from the old folder. Run `npm run install:desktop` from the new folder to rebuild the launcher and register recovery with its new paths. Do not run multiple copies of the watcher/service for the same endpoint.

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

- **Model missing after opening the app or an update:** inspect `state/recovery-status.json` and `state/recovery.log`. For `waiting-for-launcher`, finish your work, quit the app yourself, then open Codex Live2D.app; recovery will not quit it for you.
- **Missing assets:** rerun setup with the entire model directory and a compatible runtime; `npm run doctor` reports missing resources.
- **No speech:** check the speaker toggle, API key, voice ID and model. Some audio contexts need a user click to start playback.
- **Model closed:** reopen it from the gear entry; to restore a fully removed companion, run `npm start`.
- **Work/Chat views:** the bridge includes adapters for Codex, ChatGPT Work and ChatGPT Chat data. They depend on internal page metadata; verify your installed build. Automatic compatibility across future updates is not guaranteed.

The original attachment was exercised on desktop builds 26.1002.52244 and 26.1007.21159. This is not an official extension API, and UI updates may require adapter changes. Windows and Linux desktop activation are not implemented. Settings support English and Simplified Chinese.

## License

Project code: [MIT](LICENSE). Browser-library licenses: [third-party notices](THIRD_PARTY_NOTICES.md). Model assets, Live2D runtime, and trademarks remain subject to their own terms.
