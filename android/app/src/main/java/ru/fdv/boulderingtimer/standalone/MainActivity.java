package ru.fdv.boulderingtimer.standalone;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Native mode selection; it never changes the competition state on a server. */
public final class MainActivity extends Activity {
  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    LinearLayout choices = new LinearLayout(this);
    choices.setOrientation(LinearLayout.VERTICAL);
    int padding = Math.round(24 * getResources().getDisplayMetrics().density);
    choices.setPadding(padding, padding, padding, padding);
    TextView title = new TextView(this);
    title.setText(R.string.app_name);
    title.setTextSize(24);
    choices.addView(title);
    TextView instructions = new TextView(this);
    instructions.setText(R.string.connection_instructions);
    choices.addView(instructions);
    EditText address = new EditText(this);
    address.setHint(R.string.server_address);
    address.setContentDescription(getString(R.string.server_address));
    address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
    address.setSingleLine(true);
    address.setText(getPreferences(MODE_PRIVATE).getString("serverAddress", ""));
    choices.addView(address);
    Button connect = new Button(this);
    connect.setText(R.string.connect_server);
    connect.setOnClickListener(view -> {
      try {
        String server = ServerAddress.normalize(address.getText().toString());
        getPreferences(MODE_PRIVATE).edit().putString("serverAddress", server).apply();
        startActivity(new Intent(this, TimerActivity.class).putExtra("serverAddress", server));
      } catch (IllegalArgumentException error) {
        address.setError(getString(R.string.invalid_server_address));
      }
    });
    choices.addView(connect);
    Button standalone = new Button(this);
    standalone.setText(R.string.standalone);
    standalone.setOnClickListener(view -> startActivity(new Intent(this, TimerActivity.class)));
    choices.addView(standalone);
    TextView warning = new TextView(this);
    warning.setText(R.string.foreground_warning);
    choices.addView(warning);
    ScrollView scroll = new ScrollView(this);
    scroll.addView(choices);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
      scroll.setOnApplyWindowInsetsListener((view, insets) -> {
        Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        if (view.getPaddingLeft() != bars.left || view.getPaddingTop() != bars.top
            || view.getPaddingRight() != bars.right || view.getPaddingBottom() != bars.bottom) {
          view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
        }
        return insets.inset(bars.left, bars.top, bars.right, bars.bottom);
      });
    }
    setContentView(scroll);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) scroll.requestApplyInsets();
  }
}
