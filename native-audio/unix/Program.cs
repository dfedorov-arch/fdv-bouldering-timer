namespace FDVNativeAudio.Unix;

internal static class Program
{
    public static int Main(string[] args)
    {
#if FDV_AUDIO_SELF_TEST
        if (args.SequenceEqual(new[] { "--render-self-test" })) { NativeRenderChecks.Run(); UnixChecks.Run(); return 0; }
#endif
        // Only the JSON pipe protocol is accepted in production.
        if (args.Length != 0) return 2;
        FDVNativeAudio.Player.Run();
        return 0;
    }
}
