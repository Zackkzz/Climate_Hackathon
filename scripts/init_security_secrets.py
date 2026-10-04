"""Create local verification secrets and a localhost certificate; never overwrite existing keys.

For public hosting supply a trusted certificate and externally managed keys instead.
"""
import argparse
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from cryptography import x509
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
parser = argparse.ArgumentParser()
parser.add_argument("--directory", type=Path, default=Path(".secrets"))
args = parser.parse_args()
args.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
os.chmod(args.directory, 0o700)
for name, value in [("signing_key", secrets.token_hex(32)), ("encryption_keys", Fernet.generate_key().decode()),
                    ("backup_keys", Fernet.generate_key().decode())]:
    path = args.directory / name
    if not path.exists():
        with path.open("x") as f: f.write(value)
        # Parent is owner-only; mounted containers can read only explicitly granted secrets.
        os.chmod(path, 0o644)
cert_path = args.directory / "tls_certificate"; key_path = args.directory / "tls_key"
if cert_path.exists() != key_path.exists(): raise SystemExit("Supply both TLS key and certificate together")
if not cert_path.exists():
    key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=5))
            .not_valid_after(now+timedelta(days=30))
            .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost")]), critical=False)
            .sign(key, hashes.SHA256()))
    key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                           serialization.NoEncryption()))
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    os.chmod(key_path, 0o644); os.chmod(cert_path, 0o644)
print("Local verification secrets prepared. Replace the localhost certificate for public hosting.")
