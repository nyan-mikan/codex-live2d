# Startup and connection reuse

The startup design was reviewed against [BigPizzaV3/CodexPlusPlus, `launcher.rs` at commit 28d4d775](https://github.com/BigPizzaV3/CodexPlusPlus/blob/28d4d7756131f94c90fe69b58403ce3c3744d6d8/crates/codex-plus-core/src/launcher.rs#L1098) and [its single-instance launcher](https://github.com/BigPizzaV3/CodexPlusPlus/blob/28d4d7756131f94c90fe69b58403ce3c3744d6d8/apps/codex-plus-launcher/src/main.rs#L726).

Codex++ uses an external launch entry and CDP injection. Its macOS selector starts a new app when none is running, reuses an existing app when CDP is available, and requests a quit/relaunch when an existing app has no CDP connection. It does not make an ordinary unprepared launch injectable without a restart. Codex Live2D instead waits in that last case to respect uninterrupted work.

| Official application | Model connection | Codex Live2D behavior |
| --- | --- | --- |
| Not running | None | A user launcher click starts it once with connection arguments |
| Running | Available at any declared local port | Reuse the app and attach the companion |
| Running | Missing | Keep the app running and wait for a prepared user launch |
| Running | Model missing or stalled | Remount or replace the companion watcher; leave the app running |
| Quit by the user | Any | Wait; do not reopen the app |

The project remains independently installed and maintained. It can attach to a Codex instance opened by Codex++, another launcher, or a terminal when that process declares a CDP port. Its background service reads the exact official main process IDs and those processes' debug-port arguments, then validates local Codex page targets. It does not scan ports, edit other tools' settings, change providers, or read their credentials. Chromium uses the last repeated debug-port switch; discovery follows that rule.

The launch entry is serialized by a local lock. Repeated clicks focus an existing prepared app and retain its watcher. Application launch uses `open -a`, allowing LaunchServices to reuse an instance if another launch races with ours. Recovery tracks the selected port and replaces only watchers belonging to this project when the app moves to another port.

This is an independently written implementation of the connection-reuse approach. No Codex++ source code is included in the project.
