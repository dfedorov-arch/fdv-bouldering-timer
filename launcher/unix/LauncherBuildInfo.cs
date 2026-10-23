using System.Globalization;
using System.Text.Json;

namespace FdvBoulderingTimer.Launcher;

internal static class LauncherBuildInfo
{
    internal static string Read(string body)
    {
        try
        {
            using var state = JsonDocument.Parse(body);
            if (state.RootElement.ValueKind == JsonValueKind.Object &&
                state.RootElement.TryGetProperty("config", out var config) && config.ValueKind == JsonValueKind.Object &&
                config.TryGetProperty("buildNumber", out var number) && number.ValueKind == JsonValueKind.Number &&
                number.TryGetInt32(out var build) && build > 0)
                return build.ToString(CultureInfo.InvariantCulture);
        }
        catch (JsonException) { }
        return "";
    }
}
