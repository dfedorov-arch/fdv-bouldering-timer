using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using System.Text;

namespace FdvBoulderingTimerLauncher
{
    // CLR2 compatible. Native CryptoAPI does the RSA generation and signing;
    // the small DER encoder below only encodes the Subject Alternative Names.
    internal static class HttpsCertificate
    {
        internal const string Password = "bouldering-timer";
        private const string Provider = "Microsoft Enhanced RSA and AES Cryptographic Provider";
        internal delegate void DirectoryPreparer(string directory);

        internal static string UserDirectory()
        {
            return Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FDV Bouldering Timer"), "https");
        }

        internal static string PreferredDirectory(string root)
        { return PreferredDirectory(root, UserDirectory()); }

        private static string PreferredDirectory(string root, string userDirectory)
        {
            return File.Exists(Path.Combine(root, "fdv-installed.marker")) ? userDirectory : Path.Combine(root, "https");
        }

        internal static string ActivePfx(string root)
        { return ActivePfx(root, UserDirectory()); }

        private static string ActivePfx(string root, string userDirectory)
        {
            string[] candidates = { Path.Combine(PreferredDirectory(root, userDirectory), "timer-cert.pfx"),
                Path.Combine(userDirectory, "timer-cert.pfx") };
            foreach (string candidate in candidates) if (File.Exists(candidate)) return candidate;
            return null;
        }

        internal static bool Exists(string root)
        { return Exists(root, UserDirectory()); }

        private static bool Exists(string root, string userDirectory)
        {
            return ActivePfx(root, userDirectory) != null || File.Exists(Path.Combine(root, "timer-cert.pfx"))
                || (File.Exists(Path.Combine(root, "timer-key.pem")) && File.Exists(Path.Combine(root, "timer-cert.pem")));
        }

        internal static string[] DefaultNames()
        {
            var names = new List<string>();
            names.Add("localhost"); names.Add("127.0.0.1"); names.Add("::1");
            try { names.AddRange(NormalizeNames(Environment.MachineName)); } catch (ArgumentException) { }
            foreach (NetworkInterface adapter in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (adapter.OperationalStatus != OperationalStatus.Up) continue;
                foreach (UnicastIPAddressInformation item in adapter.GetIPProperties().UnicastAddresses)
                {
                    IPAddress address = item.Address;
                    if (IPAddress.IsLoopback(address) || address.IsIPv6LinkLocal || address.IsIPv6Multicast) continue;
                    if (address.AddressFamily == AddressFamily.InterNetwork && address.ToString().StartsWith("169.254.")) continue;
                    if (address.AddressFamily == AddressFamily.InterNetwork || address.AddressFamily == AddressFamily.InterNetworkV6)
                        names.Add(address.ToString());
                }
            }
            return NormalizeNames(String.Join("\n", names.ToArray()));
        }

        internal static string[] NormalizeNames(string text)
        {
            var result = new List<string>();
            var seen = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            foreach (string token in text.Split(new char[] { ' ', '\t', '\r', '\n', ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                string name = token.Trim();
                if (name.IndexOf("://", StringComparison.Ordinal) >= 0)
                {
                    Uri url;
                    if (!Uri.TryCreate(name, UriKind.Absolute, out url) || (url.Scheme != "http" && url.Scheme != "https")
                        || url.UserInfo.Length != 0 || url.AbsolutePath != "/" || url.Query.Length != 0 || url.Fragment.Length != 0)
                        throw new ArgumentException(LauncherLanguage.Text("Invalid server address: ") + token);
                    name = url.Host;
                }
                name = name.Trim('[', ']');
                IPAddress ip;
                if (IPAddress.TryParse(name, out ip))
                {
                    if (ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) || ip.IsIPv6LinkLocal || ip.IsIPv6Multicast
                        || name.IndexOf('%') >= 0)
                        throw new ArgumentException(LauncherLanguage.Text("Use a reachable IP: ") + token);
                    name = ip.ToString();
                }
                else
                {
                    name = new IdnMapping().GetAscii(name.TrimEnd('.')).ToLowerInvariant();
                    if (name.Length == 0 || name.Length > 253) throw new ArgumentException(LauncherLanguage.Text("Invalid DNS name: ") + token);
                    foreach (string label in name.Split('.'))
                    {
                        if (label.Length == 0 || label.Length > 63 || label[0] == '-' || label[label.Length - 1] == '-')
                            throw new ArgumentException(LauncherLanguage.Text("Invalid DNS name: ") + token);
                        foreach (char value in label)
                            if (!((value >= 'a' && value <= 'z') || (value >= '0' && value <= '9') || value == '-'))
                                throw new ArgumentException(LauncherLanguage.Text("Invalid DNS name: ") + token);
                    }
                }
                if (!seen.ContainsKey(name)) { seen.Add(name, true); result.Add(name); }
                if (result.Count > 64) throw new ArgumentException(LauncherLanguage.Text("Maximum 64 names."));
            }
            if (result.Count == 0) throw new ArgumentException(LauncherLanguage.Text("Enter an IP or DNS name."));
            return result.ToArray();
        }

        internal static string Generate(string root, string[] names, bool replace)
        {
            return Generate(root, names, replace, UserDirectory());
        }

        internal static string Generate(string root, string[] names, bool replace, string fallbackDirectory)
        {
            return Generate(root, names, replace, fallbackDirectory, PrepareDirectory);
        }

        // Injectable only for the native test harness: reproduce older .NET
        // filesystem errors without a mounted FAT volume or real user state.
        internal static string Generate(string root, string[] names, bool replace, string fallbackDirectory, DirectoryPreparer prepareDirectory)
        {
            names = NormalizeNames(String.Join("\n", names));
            if (!replace && Exists(root, fallbackDirectory)) throw new IOException(LauncherLanguage.Text("A certificate already exists."));
            string destination = PreferredDirectory(root, fallbackDirectory);
            string active = ActivePfx(root, fallbackDirectory);
            if (active != null) destination = Path.GetDirectoryName(active);
            try { prepareDirectory(destination); }
            catch (Exception error)
            {
                // .NET Framework maps unsupported ACL operations (including
                // ERROR_INVALID_FUNCTION=1 on older filesystems) to
                // InvalidOperationException, not IOException. Scope this
                // fallback to directory preparation, never cryptography.
                if (!IsDirectoryPreparationFailure(error)) throw;
                // Never claim to replace a read-only active portable PFX while
                // actually writing a lower-priority fallback the server ignores.
                if (active != null && String.Equals(active, Path.Combine(Path.Combine(root, "https"), "timer-cert.pfx"), StringComparison.OrdinalIgnoreCase)) throw;
                destination = fallbackDirectory;
                try { prepareDirectory(destination); }
                catch (Exception fallbackError)
                {
                    if (!IsDirectoryPreparationFailure(fallbackError)) throw;
                    throw new IOException(LauncherLanguage.Text("Cannot secure certificate directory: ")
                        + destination + ". " + fallbackError.Message, fallbackError);
                }
            }
            byte[] publicCertificate;
            byte[] pfx = Create(names, out publicCertificate);
            try
            {
                string path = Path.Combine(destination, "timer-cert.pfx");
                // The single PFX is the authoritative server input. A failure to
                // publish the public copy must not leave the old PFX half-written.
                string publicPath = Path.Combine(destination, "timer-public.cer");
                byte[] previousPublic = File.Exists(publicPath) ? File.ReadAllBytes(publicPath) : null;
                AtomicWrite(publicPath, publicCertificate, replace);
                try { AtomicWrite(path, pfx, replace); }
                catch
                {
                    if (previousPublic != null) AtomicWrite(publicPath, previousPublic, true);
                    else File.Delete(publicPath); // Only the new public copy, never an existing/private key.
                    throw;
                }
                return destination;
            }
            finally { Array.Clear(pfx, 0, pfx.Length); }
        }

        private static bool IsDirectoryPreparationFailure(Exception error)
        {
            return error is UnauthorizedAccessException || error is IOException
                || error is NotSupportedException || error is InvalidOperationException;
        }

        internal static void PrepareDirectory(string directory)
        {
            Directory.CreateDirectory(directory);
            var security = new DirectorySecurity();
            security.SetAccessRuleProtection(true, false);
            SecurityIdentifier owner = WindowsIdentity.GetCurrent().User;
            InheritanceFlags inheritance = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
            security.AddAccessRule(new FileSystemAccessRule(owner, FileSystemRights.FullControl, inheritance,
                PropagationFlags.None, AccessControlType.Allow));
            security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                FileSystemRights.FullControl, inheritance, PropagationFlags.None, AccessControlType.Allow));
            // Fail closed on filesystems without ACLs; never publish a private
            // key into a directory whose access cannot be restricted.
            Directory.SetAccessControl(directory, security);
        }

        private static void AtomicWrite(string path, byte[] bytes, bool replace)
        {
            string temporary = Path.Combine(Path.GetDirectoryName(path), ".new-" + Guid.NewGuid().ToString("N") + Path.GetExtension(path));
            try
            {
                using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                { stream.Write(bytes, 0, bytes.Length); stream.Flush(); }
                if (File.Exists(path))
                {
                    if (!replace) throw new IOException(LauncherLanguage.Text("A certificate already exists."));
                    var security = new FileSecurity();
                    security.SetAccessRuleProtection(true, false);
                    security.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User, FileSystemRights.FullControl, AccessControlType.Allow));
                    security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, AccessControlType.Allow));
                    File.SetAccessControl(path, security);
                    string backup = path + ".backup-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss") + "-" + Guid.NewGuid().ToString("N") + Path.GetExtension(path);
                    File.Replace(temporary, path, backup);
                }
                else File.Move(temporary, path);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }

        private static byte[] Create(string[] names, out byte[] publicCertificate)
        {
            var parameters = new CspParameters(24, Provider, "FDV-HTTPS-" + Guid.NewGuid().ToString("N"));
            parameters.KeyNumber = 1; // AT_KEYEXCHANGE, user key set, exportable.
            using (var rsa = new RSACryptoServiceProvider(2048, parameters))
            {
                rsa.PersistKeyInCsp = true;
                var memory = new List<IntPtr>();
                IntPtr context = IntPtr.Zero;
                X509Certificate2 certificate = null;
                try
                {
                    // Force key creation before the native provider reopens it.
                    rsa.ExportParameters(false);
                    uint length = 0;
                    if (!CertStrToName(1, "CN=FDV Bouldering Timer", 3, IntPtr.Zero, IntPtr.Zero, ref length, IntPtr.Zero)) ThrowNative();
                    IntPtr subject = Allocate((int)length, memory);
                    if (!CertStrToName(1, "CN=FDV Bouldering Timer", 3, IntPtr.Zero, subject, ref length, IntPtr.Zero)) ThrowNative();
                    var name = new Blob(); name.Length = length; name.Data = subject;
                    var provider = new KeyProviderInfo(); provider.Container = parameters.KeyContainerName;
                    provider.Provider = Provider; provider.Type = 24; provider.KeySpec = 1;
                    var algorithm = new Algorithm(); algorithm.Oid = "1.2.840.113549.1.1.11"; // SHA256-RSA; never native SHA1 default.
                    var start = SystemTime.From(DateTime.UtcNow.AddMinutes(-5));
                    var end = SystemTime.From(DateTime.UtcNow.AddDays(365));
                    var extensions = new Extensions(); extensions.Count = 4;
                    int size = Marshal.SizeOf(typeof(Extension));
                    extensions.Data = Allocate(size * 4, memory);
                    SetExtension(extensions.Data, 0, "2.5.29.17", false, AlternativeNames(names), memory);
                    SetExtension(extensions.Data, 1, "2.5.29.19", true, new byte[] { 0x30, 0x00 }, memory); // CA:false.
                    SetExtension(extensions.Data, 2, "2.5.29.15", true, new byte[] { 0x03, 0x02, 0x05, 0xA0 }, memory);
                    SetExtension(extensions.Data, 3, "2.5.29.37", false,
                        new byte[] { 0x30, 0x0A, 0x06, 0x08, 0x2B, 0x06, 0x01, 0x05, 0x05, 0x07, 0x03, 0x01 }, memory);
                    context = CertCreateSelfSignCertificate(IntPtr.Zero, ref name, 0, ref provider, ref algorithm, ref start, ref end, ref extensions);
                    if (context == IntPtr.Zero) ThrowNative();
                    certificate = new X509Certificate2(context);
                    if (!certificate.HasPrivateKey) throw new CryptographicException(LauncherLanguage.Text("Generated certificate has no private key."));
                    publicCertificate = certificate.Export(X509ContentType.Cert);
                    return certificate.Export(X509ContentType.Pfx, Password);
                }
                finally
                {
                    if (certificate != null) certificate.Reset();
                    if (context != IntPtr.Zero) CertFreeCertificateContext(context);
                    foreach (IntPtr pointer in memory) Marshal.FreeHGlobal(pointer);
                    rsa.PersistKeyInCsp = false; // Delete only this unique temporary user key container.
                    rsa.Clear();
                }
            }
        }

        private static byte[] AlternativeNames(string[] names)
        {
            var body = new List<byte>();
            foreach (string name in names)
            {
                IPAddress address;
                byte[] value = IPAddress.TryParse(name, out address) ? address.GetAddressBytes() : Encoding.ASCII.GetBytes(name);
                body.AddRange(Der(IPAddress.TryParse(name, out address) ? (byte)0x87 : (byte)0x82, value));
            }
            return Der(0x30, body.ToArray());
        }

        private static byte[] Der(byte tag, byte[] value)
        {
            var encoded = new List<byte>(); encoded.Add(tag);
            if (value.Length < 128) encoded.Add((byte)value.Length);
            else if (value.Length < 256) { encoded.Add(0x81); encoded.Add((byte)value.Length); }
            else { encoded.Add(0x82); encoded.Add((byte)(value.Length >> 8)); encoded.Add((byte)value.Length); }
            encoded.AddRange(value); return encoded.ToArray();
        }

        private static IntPtr Allocate(int length, List<IntPtr> memory)
        { IntPtr pointer = Marshal.AllocHGlobal(length); memory.Add(pointer); return pointer; }

        private static void SetExtension(IntPtr array, int index, string oid, bool critical, byte[] value, List<IntPtr> memory)
        {
            var extension = new Extension();
            extension.Oid = Marshal.StringToHGlobalAnsi(oid); memory.Add(extension.Oid);
            extension.Critical = critical ? 1 : 0; extension.Value.Length = (uint)value.Length;
            extension.Value.Data = Allocate(value.Length, memory); Marshal.Copy(value, 0, extension.Value.Data, value.Length);
            Marshal.StructureToPtr(extension, new IntPtr(array.ToInt64() + index * Marshal.SizeOf(typeof(Extension))), false);
        }

        private static void ThrowNative() { throw new Win32Exception(Marshal.GetLastWin32Error()); }

        [StructLayout(LayoutKind.Sequential)] private struct Blob { public uint Length; public IntPtr Data; }
        [StructLayout(LayoutKind.Sequential)] private struct Extension { public IntPtr Oid; public int Critical; public Blob Value; }
        [StructLayout(LayoutKind.Sequential)] private struct Extensions { public uint Count; public IntPtr Data; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct KeyProviderInfo
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string Container;
            [MarshalAs(UnmanagedType.LPWStr)] public string Provider;
            public uint Type, Flags, ParameterCount; public IntPtr Parameters; public uint KeySpec;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        private struct Algorithm { [MarshalAs(UnmanagedType.LPStr)] public string Oid; public Blob Parameters; }
        [StructLayout(LayoutKind.Sequential)] private struct SystemTime
        {
            public ushort Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds;
            public static SystemTime From(DateTime value)
            {
                var result = new SystemTime(); result.Year = (ushort)value.Year; result.Month = (ushort)value.Month;
                result.Day = (ushort)value.Day; result.DayOfWeek = (ushort)value.DayOfWeek; result.Hour = (ushort)value.Hour; result.Minute = (ushort)value.Minute;
                result.Second = (ushort)value.Second; return result;
            }
        }
        [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "CertStrToNameW")]
        private static extern bool CertStrToName(uint encoding, string name, uint type, IntPtr reserved, IntPtr encoded, ref uint size, IntPtr error);
        [DllImport("crypt32.dll", SetLastError = true)]
        private static extern IntPtr CertCreateSelfSignCertificate(IntPtr key, ref Blob subject, uint flags,
            ref KeyProviderInfo provider, ref Algorithm algorithm, ref SystemTime start, ref SystemTime end, ref Extensions extensions);
        [DllImport("crypt32.dll")]
        private static extern bool CertFreeCertificateContext(IntPtr context);
    }
}
