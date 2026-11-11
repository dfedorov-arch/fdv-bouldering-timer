# Hotkeys after switching audio output

Reproduced in Chromium with the real page and an isolated native-audio-stub server: after checking the browser radio, it retained focus and Z could not start the timer. The document keydown guard rejected every input.

The guard now allows only input[type=radio][data-server-audio-route] outside editable/modal contexts. It does not blur the selection or alter audio commands, handoff, offsets, clocks, permissions or native keyboard navigation. Text inputs, textarea/select/contenteditable, composition/already-handled events and open dialogs remain guarded. Published standalone HTML and generated Android HTML refreshed; server build number unchanged.

The regression fails on the previous guard and passes after the fix. It checks Z, Ctrl+Q and P from each route radio without a background click, plus text/contenteditable/modal exclusion. Three focused Chromium scenarios pass: this regression, the existing route/offset/reload/arrow-navigation scenario and the existing Secondary address/input/modal hotkey regression. Release-input verification and whitespace checks pass. No live server restart, installed-package change, commit or push.
