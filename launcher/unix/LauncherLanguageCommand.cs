using System.Net;
using System.Text;

namespace FdvBoulderingTimer.Launcher;

internal static class LauncherLanguageCommand
{
    internal static async Task SendAsync(HttpClient client, int port, string token, string language, CancellationToken cancellationToken)
    {
        if (language != "ru" && language != "en") throw new ArgumentException("Invalid language");
        using var request = new HttpRequestMessage(HttpMethod.Post, "http://127.0.0.1:" + port + "/api/launcher/language");
        request.Headers.Add("X-FDV-Launcher-Token", token);
        request.Content = new StringContent("{\"language\":\"" + language + "\"}", Encoding.UTF8, "application/json");
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (response.StatusCode != HttpStatusCode.OK) throw new IOException("Language command was not accepted");
    }
}
