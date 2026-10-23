using System.Text.Json;

namespace FDVNativeAudio.Unix;

// Preserve the Windows protocol's dictionary/array/primitive types, so the
// exact same queue/mixer/watchdog implementation compiles on both platforms.
public sealed class ProtocolJson
{
    public T Deserialize<T>(string value)
    {
        using var document = JsonDocument.Parse(value, new JsonDocumentOptions { MaxDepth = 32 });
        return (T)Read(document.RootElement);
    }
    private static object Read(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => value.EnumerateObject().ToDictionary(p => p.Name, p => Read(p.Value)),
        JsonValueKind.Array => value.EnumerateArray().Select(Read).ToArray(),
        JsonValueKind.String => value.GetString(),
        JsonValueKind.Number => value.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => null,
        _ => throw new InvalidDataException("Invalid audio protocol value")
    };
    public string Serialize(object value) => JsonSerializer.Serialize(value);
}
