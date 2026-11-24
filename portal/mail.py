import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage


def send():
    data = json.load(sys.stdin)
    mode = os.environ.get("FDV_SMTP_MODE", "starttls")
    if mode not in {"tls", "starttls"}:
        raise ValueError("SMTP requires TLS")
    host = os.environ["FDV_SMTP_HOST"]
    port = int(os.environ.get("FDV_SMTP_PORT", "465" if mode == "tls" else "587"))
    message = EmailMessage()
    message["From"] = os.environ["FDV_SMTP_FROM"]
    message["To"] = data["email"]
    message["Subject"] = data.get("subject", "FDV Bouldering Timer — подтверждение почты")
    if "text" in data:
        message.set_content(data["text"])
    else:
        message.set_content(
            "Чтобы подтвердить почту и задать пароль, откройте эту ссылку:\n\n"
            + data["link"] + "\n\nСсылка действует один час. Если вы не запрашивали регистрацию, пропустите письмо."
        )
    context = ssl.create_default_context()
    client = smtplib.SMTP_SSL(host, port, context=context, timeout=10) if mode == "tls" else smtplib.SMTP(host, port, timeout=10)
    with client:
        if mode == "starttls":
            client.starttls(context=context)
        if os.environ.get("FDV_SMTP_USER"):
            client.login(os.environ["FDV_SMTP_USER"], os.environ["FDV_SMTP_PASSWORD"])
        client.send_message(message)


if __name__ == "__main__":
    try:
        send()
    except Exception as failure:
        print(type(failure).__name__, file=sys.stderr)
        sys.exit(1)
