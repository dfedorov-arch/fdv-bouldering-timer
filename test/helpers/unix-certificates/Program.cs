using FdvBoulderingTimer.Launcher;

try
{
    if (args[0] == "names") Console.WriteLine(string.Join('|', HttpsCertificate.NormalizeNames(args[1])));
    else if (args[0] == "defaults") Console.WriteLine(string.Join('|', HttpsCertificate.DefaultNames()));
    else if (args[0] == "directory") Console.WriteLine(HttpsCertificate.PreferredDirectory(args[1], args[2]));
    else if (args[0] == "generate" || args[0] == "storage-error")
    {
        var fallback = args[4];
        Action<string>? prepare = args[0] == "storage-error" ? directory =>
        {
            if (directory != fallback || args[5] == "both") throw new UnauthorizedAccessException("Simulated read-only directory");
            Directory.CreateDirectory(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        } : null;
        Console.WriteLine(HttpsCertificate.Generate(args[1], HttpsCertificate.NormalizeNames(args[2]), args[3] == "replace", fallback, prepare));
    }
    else throw new ArgumentException("Unknown test mode");
    return 0;
}
catch (Exception error) { Console.Error.WriteLine(error); return 1; }
