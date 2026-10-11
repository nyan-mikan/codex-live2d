# Ordinary official-app launch recovery

The recommended installation keeps the official Codex bundle, signature and Dock entry unchanged. An independent user login service observes the exact official main process every two seconds. No Codex++ installation or configuration is required.

| State | Action |
| --- | --- |
| App is not running or recovery is disabled | Wait; never open the app |
| User opens app without a declared model connection | Wait ten seconds, normally quit and reopen once with loopback-only connection arguments |
| Restart fails for the same process/version | Record failure; do not loop |
| User later starts a new process | Allow a fresh recovery attempt |
| Connection is declared but renderer is still starting | Wait without quitting |
| Working connection at any declared local port | Reuse the running app |
| Model or watcher fails with a working connection | Repair the companion without restarting the app |

Recovery records the attempt before dispatch. Before requesting a normal quit, the activation helper confirms the observed process still exists and recovery is still enabled. The helper is launched by the login service, so it survives Codex closing. Quit prompts are respected; there is no forced termination. A successful relaunch records its resulting process ID to prevent the restart itself from granting another attempt if initialization fails.

The optional independent launcher passes connection arguments on the first opening. A live launch lock suppresses competing recovery. The normal recommended installer only validates assets and registers the service; it does not create a replacement Dock icon.

The initial source comparison used [BigPizzaV3/CodexPlusPlus](https://github.com/BigPizzaV3/CodexPlusPlus). The installed [v1.2.38 launch code](https://github.com/BigPizzaV3/CodexPlusPlus/blob/v1.2.38/crates/codex-plus-core/src/launcher.rs#L713) uses an external entry on macOS, and its [watcher installation](https://github.com/BigPizzaV3/CodexPlusPlus/blob/v1.2.38/crates/codex-plus-core/src/watcher.rs#L170) is Windows-only. The later [macOS selector](https://github.com/BigPizzaV3/CodexPlusPlus/blob/28d4d7756131f94c90fe69b58403ce3c3744d6d8/crates/codex-plus-core/src/launcher.rs#L1098) reuses a debug-ready app and restarts an unprepared app. This project's startup and recovery implementation is independently written; no upstream source or provider management is included.

Signature-changing direct-bootstrap prototypes were rejected and are not shipped. Application assets, credentials and character-specific settings stay local. Internal UI compatibility, blocked normal quit requests or missing resources can still prevent recovery; health reports must confirm the actual renderer rather than merely a live helper process.
