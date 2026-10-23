# Native server audio for macOS and Linux

The self-contained .NET 8 helper uses the shared `lib/server-audio-player.cs`
PCM mixer and JSON pipe protocol. No installed .NET runtime is required.
macOS uses AudioQueue (Core Audio); Linux uses ALSA's `default` PCM route
(`libasound.so.2`), normally mixed by the desktop audio service. It does not
open an exclusive `hw:` device. The server and helper must run in the desktop
user's audio session, rather than as an unrelated system service.

MP3 decoding: NLayer 3.0.0, pinned in the project and NuGet lock file.
Source: https://github.com/naudio/NLayer/tree/046c7ce422970f8f0f0bc205d6c6341bcb7debf1
License: NLAYER-LICENSE.txt. WAV PCM/float decoding and conversion to stereo
44100Hz happen once when loading a profile, outside the output callback.

Festival announcements without recorded files use macOS `say` (Samantha for
English, Milena for Russian; the voice must be installed) or Linux
`espeak-ng` / `espeak` with the selected language. If speech or the device
cannot be prepared, the complete route falls back to the browser. Recorded
profiles do not require a speech synthesizer.

Build on the corresponding OS with .NET SDK 8 or later:

    bash native-audio/unix/build-player.sh linux-x64 /path/to/launcher-artifact/native-audio

Supported runtime IDs: linux-x64, linux-arm64, osx-x64, osx-arm64.
Place this output beside the Unix launcher artifact in `native-audio/`.
The portable builder copies it to `lib/native-audio/{linux|darwin}-{x64|arm64}/`
and restores executable permissions after artifact transfer. macOS outputs are
ad-hoc signed; this does not constitute Apple notarization.

The device-free check is deliberately separate from a real output test:

    dotnet run --project native-audio/unix/FdvNativeAudio.csproj -p:AudioSelfTest=true -p:SelfContained=false -p:PublishSingleFile=false -- --render-self-test

It checks sample-exact mixing, duplicate suppression, quiet-tone priority and
packaged asset decoding without opening an audio device. Before a competition,
also test playback, Stop/permission revocation, hidden tabs and device changes
on the target OS and output device. OS sleep or a disconnected Bluetooth
speaker cannot be bypassed by the server.
