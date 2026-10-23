namespace FDVNativeAudio.Unix;

public static class AssetDecoder
{
    private const int Rate = 44100;
    public static float[] Read(string file)
    {
        using var input = File.OpenRead(file);
        using var reader = new BinaryReader(input);
        float[] samples; int channels, rate;
        if (input.Length >= 12 && reader.ReadUInt32() == 0x46464952) // RIFF
        {
            reader.ReadUInt32();
            if (reader.ReadUInt32() != 0x45564157) throw new InvalidDataException("Not WAVE audio");
            ushort format = 0, bits = 0; channels = rate = 0; byte[] data = null;
            while (input.Position + 8 <= input.Length)
            {
                uint kind = reader.ReadUInt32(), length = reader.ReadUInt32();
                long next = checked(input.Position + length + (length & 1));
                if (length > 128 * 1024 * 1024 || input.Position + length > input.Length) throw new InvalidDataException("Invalid WAVE chunk");
                if (kind == 0x20746d66) // fmt
                {
                    if (length < 16) throw new InvalidDataException("Invalid WAVE format");
                    format = reader.ReadUInt16(); channels = reader.ReadUInt16(); rate = reader.ReadInt32();
                    reader.ReadUInt32(); reader.ReadUInt16(); bits = reader.ReadUInt16();
                    if (format == 0xfffe && length >= 40) { reader.ReadUInt16(); reader.ReadUInt16(); reader.ReadUInt32(); format = reader.ReadUInt16(); }
                }
                else if (kind == 0x61746164) data = reader.ReadBytes((int)length); // data
                input.Position = next;
            }
            if (data == null || channels < 1 || channels > 2 || rate < 8000 || rate > 192000 ||
                !((format == 1 && new[] { 8, 16, 24, 32 }.Contains((int)bits)) || (format == 3 && bits == 32)))
                throw new InvalidDataException("Unsupported WAVE format");
            int bytes = bits / 8;
            if (data.Length % (bytes * channels) != 0 || data.Length / (bytes * channels) > rate * 120)
                throw new InvalidDataException("Invalid or oversized WAVE audio");
            samples = new float[data.Length / bytes];
            for (int i = 0; i < samples.Length; i++)
            {
                int p = i * bytes;
                samples[i] = format == 3 ? BitConverter.ToSingle(data, p) : bits switch
                {
                    8 => (data[p] - 128) / 128f,
                    16 => BitConverter.ToInt16(data, p) / 32768f,
                    24 => ((data[p] | data[p + 1] << 8 | data[p + 2] << 16) << 8 >> 8) / 8388608f,
                    _ => BitConverter.ToInt32(data, p) / 2147483648f
                };
            }
        }
        else
        {
            input.Position = 0;
            using var mp3 = new NLayer.MpegFile(input);
            channels = mp3.Channels; rate = mp3.SampleRate;
            if (channels < 1 || channels > 2 || rate < 8000 || rate > 192000) throw new InvalidDataException("Unsupported MP3 format");
            var values = new List<float>(); var block = new float[8192]; int count;
            while ((count = mp3.ReadSamples(block, 0, block.Length)) > 0)
            {
                if (values.Count + count > rate * channels * 120) throw new InvalidDataException("Native cue exceeds120s");
                values.AddRange(block.Take(count));
            }
            samples = values.ToArray();
        }
        if (samples.Any(v => !float.IsFinite(v))) throw new InvalidDataException("Invalid audio samples");
        int frames = samples.Length / channels;
        if (frames == 0) throw new InvalidDataException("Empty native audio");
        if (channels == 2 && rate == Rate) return samples;
        int outputFrames = checked((int)Math.Round(frames * (double)Rate / rate));
        var result = new float[outputFrames * 2];
        for (int i = 0; i < outputFrames; i++)
        {
            double position = i * (double)rate / Rate; int a = Math.Min((int)position, frames - 1), b = Math.Min(a + 1, frames - 1);
            float fraction = (float)(position - a);
            for (int c = 0; c < 2; c++) { int channel = channels == 1 ? 0 : c; result[i * 2 + c] = samples[a * channels + channel] * (1 - fraction) + samples[b * channels + channel] * fraction; }
        }
        return result;
    }
}
