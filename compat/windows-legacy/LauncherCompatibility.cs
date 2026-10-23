using System;
using System.Collections.Generic;

namespace FdvBoulderingTimerLauncher
{
    // The launcher needs only Add/Contains, not the .NET 3.5 HashSet API.
    // Compile this file only for the CLR2-targeted Windows Legacy launcher.
    internal sealed class HashSet<T>
    {
        private readonly Dictionary<T, bool> _items;
        public HashSet(IEqualityComparer<T> comparer) { _items = new Dictionary<T, bool>(comparer); }
        public bool Add(T value)
        {
            if (_items.ContainsKey(value)) return false;
            _items.Add(value, true);
            return true;
        }
        public bool Contains(T value) { return _items.ContainsKey(value); }
    }
}
