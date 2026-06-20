Timer fonts
===========

Place local timer fonts in this folder and select one in params.txt:

  timer_font_file=Roboto-Variable.ttf
  timer_font=Arial, sans-serif

Supported formats: WOFF2, WOFF, TTF and OTF. The file name must not include a
path. timer_font is the fallback CSS font list used when the local file is
missing, unsupported or cannot be loaded by the browser.

All bundled fonts have a plain, empty zero:

  Roboto-Variable.ttf          round colon; tabular digits
  OpenSans-Variable.ttf        round colon; tabular digits
  BarlowCondensed-Bold.ttf     round colon; compact tabular digits
  CourierPrime-Bold.ttf        monospaced; rectangular colon dots
  SyneMono-Regular.ttf         monospaced; round colon; angular digits

The bundled fonts are distributed under the SIL Open Font License 1.1. The
corresponding licence files are stored in this folder.
