using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace FdvBoulderingTimerLauncher
{
    internal sealed class ParametersDialog : Form
    {
        internal bool RestartRequested;
        private static string L(string en, string ru) { return LauncherParameters.Local(en, ru); }
        internal ParametersDialog(string directory)
        {
            LauncherTheme.Apply(this);
            Text = L("Settings", "Настройки"); ClientSize = new Size(800, 650); MinimumSize = SizeFromClientSize(new Size(620, 400));
            StartPosition = FormStartPosition.CenterParent; ShowInTaskbar = false; MinimizeBox = false;
            var model = LauncherParameters.Load(directory);
            var root = new TableLayoutPanel(); root.Dock = DockStyle.Fill; root.Padding = new Padding(16); root.ColumnCount = 1; root.RowCount = 4;
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize)); root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize)); root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            var note = new Label(); note.Text = L("Startup settings · params.txt · applied after server restart", "Настройки запуска · params.txt · применяются после перезапуска сервера"); note.AutoSize = true; note.Dock = DockStyle.Fill; note.Padding = new Padding(0, 0, 0, 12); root.Controls.Add(note, 0, 0);
            var scroll = new Panel(); scroll.Dock = DockStyle.Fill; scroll.AutoScroll = true;
            var fields = new TableLayoutPanel(); fields.Dock = DockStyle.Top; fields.AutoSize = true; fields.ColumnCount = 2;
            fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60)); fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
            var readers = new List<MethodInvoker>(); int index = 0;
            foreach (LauncherParameters.Entry entry in model.Entries)
            {
                var item = entry;
                fields.RowCount = index + 1; fields.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                var label = new Label(); label.Text = item.Label; label.AutoSize = true; label.Dock = DockStyle.Fill; label.Padding = new Padding(0, 6, 8, 6);
                fields.Controls.Add(label, 0, index);
                Control input;
                if (item.Choices.Length > 0)
                {
                    var select = new ComboBox(); select.DropDownStyle = ComboBoxStyle.DropDownList; select.Items.AddRange(item.Choices); select.SelectedItem = item.Value;
                    readers.Add(delegate { item.Value = select.SelectedItem as string ?? item.Value; }); input = select;
                }
                else
                {
                    var text = new TextBox(); text.Text = item.Value;
                    readers.Add(delegate { item.Value = text.Text; }); input = text;
                }
                input.Name = "param_" + item.Key; input.AccessibleName = item.Label; input.Dock = DockStyle.Fill; input.Margin = new Padding(3, 4, 8, 8);
                input.BackColor = Color.FromArgb(25, 33, 45); input.ForeColor = ForeColor;
                fields.Controls.Add(input, 1, index++);
            }
            scroll.Controls.Add(fields); root.Controls.Add(scroll, 0, 1);
            var status = new Label(); status.AutoSize = true; status.Dock = DockStyle.Fill; status.ForeColor = Color.Orange; root.Controls.Add(status, 0, 2);
            var buttons = new FlowLayoutPanel(); buttons.AutoSize = true; buttons.Dock = DockStyle.Fill; buttons.FlowDirection = FlowDirection.RightToLeft;
            var save = new LauncherButton(); save.Name = "saveParameters"; save.Text = L("Save", "Сохранить"); save.AutoSize = true;
            var cancel = new LauncherButton(); cancel.Text = L("Cancel", "Отмена"); cancel.AutoSize = true; cancel.DialogResult = DialogResult.Cancel;
            CancelButton = cancel;
            save.Click += delegate
            {
                try
                {
                    foreach (MethodInvoker read in readers) read();
                    model.Save();
                    RestartRequested = MessageBox.Show(this, LauncherParameters.SavedMessage, Text, MessageBoxButtons.YesNo, MessageBoxIcon.Information, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
                    DialogResult = DialogResult.OK; Close();
                }
                catch (Exception error) { status.Text = L("Could not save settings: ", "Не удалось сохранить настройки: ") + error.Message; }
            };
            buttons.Controls.Add(cancel); buttons.Controls.Add(save); root.Controls.Add(buttons, 0, 3); Controls.Add(root);
        }
    }
}
