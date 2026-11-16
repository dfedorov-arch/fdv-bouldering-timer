using System;
using System.Collections.Generic;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using FdvBoulderingTimerLauncher;

namespace FdvBoulderingTimer.Launcher;

internal sealed class ParametersDialog : Window
{
    internal bool RestartRequested { get; private set; }
    private static string L(string en, string ru) => LauncherParameters.Local(en, ru);
    internal ParametersDialog(string directory)
    {
        Background = new SolidColorBrush(Color.FromRgb(17, 23, 34));
        Foreground = new SolidColorBrush(Color.FromRgb(244, 247, 251));
        FontFamily = new FontFamily("Arial"); FontSize = 14;
        Title = L("Settings", "Настройки"); Width = 830; Height = 680; MinWidth = 620; MinHeight = 400;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var model = LauncherParameters.Load(directory);
        var root = new Grid { Margin = new Thickness(20), RowDefinitions = new RowDefinitions("Auto,*,Auto,Auto"), RowSpacing = 12 };
        root.Children.Add(new TextBlock { Text = L("Startup settings · params.txt · applied after server restart", "Настройки запуска · params.txt · применяются после перезапуска сервера"), TextWrapping = TextWrapping.Wrap });
        var fields = new StackPanel { Spacing = 12, Margin = new Thickness(0, 0, 12, 0) };
        var readers = new List<Action>();
        foreach (var entry in model.Entries)
        {
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("3*,2*"), ColumnSpacing = 16 };
            row.Children.Add(new TextBlock { Text = entry.Label, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center });
            Control input;
            if (entry.Choices.Length > 0)
            {
                var select = new ComboBox { ItemsSource = entry.Choices, SelectedItem = entry.Value, HorizontalAlignment = HorizontalAlignment.Stretch };
                readers.Add(() => entry.Value = select.SelectedItem as string ?? entry.Value); input = select;
            }
            else
            {
                var text = new TextBox { Text = entry.Value, Background = new SolidColorBrush(Color.FromRgb(16, 20, 27)) };
                readers.Add(() => entry.Value = text.Text ?? ""); input = text;
            }
            input.Name = "param_" + entry.Key;
            Avalonia.Automation.AutomationProperties.SetName(input, entry.Label);
            Grid.SetColumn(input, 1); row.Children.Add(input); fields.Children.Add(row);
        }
        var scroll = new ScrollViewer { Content = fields, HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled };
        Grid.SetRow(scroll, 1); root.Children.Add(scroll);
        var status = new TextBlock { TextWrapping = TextWrapping.Wrap, Foreground = Brushes.Orange };
        Grid.SetRow(status, 2); root.Children.Add(status);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Spacing = 12 };
        var save = new Button { Name = "saveParameters", Content = L("Save", "Сохранить") };
        var cancel = new Button { Content = L("Cancel", "Отмена") };
        cancel.Click += (_, _) => Close();
        save.Click += (_, _) =>
        {
            try
            {
                foreach (var read in readers) read();
                if (!model.Save()) { Close(); return; }
                fields.IsEnabled = false; save.IsVisible = false; cancel.IsVisible = false;
                status.Text = LauncherParameters.SavedMessage;
                var yes = new Button { Name = "restartYes", Content = L("Yes", "Да") };
                var no = new Button { Name = "restartNo", Content = L("No", "Нет") };
                yes.Click += (_, _) => { RestartRequested = true; Close(); };
                no.Click += (_, _) => Close();
                buttons.Children.Add(yes); buttons.Children.Add(no); no.Focus();
            }
            catch (Exception error) { status.Text = L("Could not save settings: ", "Не удалось сохранить настройки: ") + error.Message; }
        };
        save.Background = cancel.Background = new SolidColorBrush(Color.FromRgb(31, 42, 58));
        buttons.Children.Add(save); buttons.Children.Add(cancel); Grid.SetRow(buttons, 3); root.Children.Add(buttons); Content = root;
    }
}
