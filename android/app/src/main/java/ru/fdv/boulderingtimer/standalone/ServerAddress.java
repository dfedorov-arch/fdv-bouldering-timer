package ru.fdv.boulderingtimer.standalone;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Only server origins, never file URLs, credentials or arbitrary page paths. */
public final class ServerAddress {
  private ServerAddress() {}

  public static String normalize(String input) {
    String value = input == null ? "" : input.trim();
    if (value.isEmpty()) throw new IllegalArgumentException("Empty server address");
    if (!value.contains("://")) value = "http://" + value;
    try {
      URI uri = new URI(value);
      String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
      String path = uri.getRawPath();
      if ((!scheme.equals("http") && !scheme.equals("https")) || uri.getHost() == null
          || uri.getRawUserInfo() != null || uri.getPort() == 0 || uri.getPort() > 65535
          || uri.getRawQuery() != null || uri.getRawFragment() != null
          || !(path == null || path.isEmpty() || path.equals("/") || path.equals("/index.html"))) {
        throw new IllegalArgumentException("Invalid server address");
      }
      return new URI(scheme, null, uri.getHost(), uri.getPort(), "/", null, null).toASCIIString();
    } catch (URISyntaxException error) {
      throw new IllegalArgumentException("Invalid server address", error);
    }
  }

  public static boolean isWebUrl(String value) {
    try {
      URI uri = new URI(value);
      return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
          && uri.getHost() != null && uri.getRawUserInfo() == null;
    } catch (URISyntaxException | NullPointerException error) {
      return false;
    }
  }
}
