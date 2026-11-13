using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace FdvBoulderingTimerLauncher
{
    // Shared with the CLR2 launcher. Keep standard Button input/accessibility;
    // only painting is replaced so the Windows theme cannot add a 3D border.
    internal class LauncherButton : Button
    {
        internal static readonly Color DisabledText = Color.FromArgb(170, 181, 196);
        private bool _hovered;
        private bool _pressed;

        internal LauncherButton()
        {
            FlatStyle = FlatStyle.Flat;
            UseVisualStyleBackColor = false;
            BackColor = Color.FromArgb(31, 42, 58);
            ForeColor = Color.FromArgb(244, 247, 251);
            FlatAppearance.BorderSize = 1;
            FlatAppearance.BorderColor = Color.FromArgb(70, 85, 108);
            Padding = new Padding(12, 6, 12, 6);
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);
        }

        protected override void OnMouseEnter(EventArgs args) { _hovered = true; base.OnMouseEnter(args); Invalidate(); }
        protected override void OnMouseLeave(EventArgs args) { _hovered = false; base.OnMouseLeave(args); Invalidate(); }
        protected override void OnMouseDown(MouseEventArgs args) { if (args.Button == MouseButtons.Left) _pressed = true; base.OnMouseDown(args); Invalidate(); }
        protected override void OnMouseUp(MouseEventArgs args) { _pressed = false; base.OnMouseUp(args); Invalidate(); }
        protected override void OnKeyDown(KeyEventArgs args) { if (args.KeyCode == Keys.Space) _pressed = true; base.OnKeyDown(args); Invalidate(); }
        protected override void OnKeyUp(KeyEventArgs args) { _pressed = false; base.OnKeyUp(args); Invalidate(); }
        protected override void OnGotFocus(EventArgs args) { base.OnGotFocus(args); Invalidate(); }
        protected override void OnLostFocus(EventArgs args) { _pressed = false; base.OnLostFocus(args); Invalidate(); }
        protected override void OnEnabledChanged(EventArgs args) { _pressed = false; _hovered = false; base.OnEnabledChanged(args); Invalidate(); }

        protected override void OnPaint(PaintEventArgs args)
        {
            float scale = args.Graphics.DpiX / 96F;
            float stroke = Math.Max(1F, scale);
            float inset = stroke / 2F;
            float diameter = Math.Min(6F * scale, Math.Min(Width - stroke, Height - stroke));
            if (diameter <= 0) return;
            var bounds = new RectangleF(inset, inset, Width - stroke, Height - stroke);
            args.Graphics.Clear(Parent == null ? Color.FromArgb(17, 23, 34) : Parent.BackColor);
            args.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var outline = new GraphicsPath())
            {
                outline.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
                outline.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
                outline.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
                outline.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
                outline.CloseFigure();
                Color background = !Enabled ? Color.FromArgb(25, 33, 45)
                    : _pressed && (_hovered || Focused) ? Color.FromArgb(38, 53, 72)
                    : _hovered ? Color.FromArgb(45, 61, 81) : BackColor;
                Color border = !Enabled ? Color.FromArgb(49, 62, 80)
                    : Focused && ShowFocusCues ? Color.FromArgb(73, 198, 229) : FlatAppearance.BorderColor;
                using (var fill = new SolidBrush(background)) args.Graphics.FillPath(fill, outline);
                using (var pen = new Pen(border, stroke)) args.Graphics.DrawPath(pen, outline);
            }
            TextFormatFlags flags = TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter
                | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis;
            if (!ShowKeyboardCues) flags |= TextFormatFlags.HidePrefix;
            Rectangle text = Rectangle.Inflate(ClientRectangle, -(int)Math.Ceiling(8F * scale), 0);
            TextRenderer.DrawText(args.Graphics, Text, Font, text, Enabled ? ForeColor : DisabledText, flags);
        }
    }

    internal static class LauncherTheme
    {
        internal static void Apply(Form form)
        {
            form.AutoScaleDimensions = new SizeF(96F, 96F);
            form.AutoScaleMode = AutoScaleMode.Dpi;
            form.Font = new Font("Arial", 10.5F, FontStyle.Regular, GraphicsUnit.Point);
            form.BackColor = Color.FromArgb(17, 23, 34);
            form.ForeColor = Color.FromArgb(244, 247, 251);
        }
    }
}
