"""Deploy codexyprospect to VPS via SFTP + SSH."""
import paramiko
import os
import sys
from datetime import datetime

HOST = "177.7.38.137"
USER = "root"
PASS = "Picole@2222@"

LOCAL_DIST   = r"C:\Users\DELL\Documents\PROJETOS\codexyprospect\dist"
LOCAL_SERVER = r"C:\Users\DELL\Documents\PROJETOS\codexyprospect\server"
LOCAL_PKG    = r"C:\Users\DELL\Documents\PROJETOS\codexyprospect\package.json"

RELEASES_DIR = "/opt/codexyprospect/releases"
CURRENT_LINK = "/opt/codexyprospect/current"

timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
RELEASE_DIR = f"{RELEASES_DIR}/{timestamp}"


def sftp_mkdir_p(sftp, remote_path):
    parts = remote_path.split("/")
    path = ""
    for part in parts:
        if not part:
            path = "/"
            continue
        path = path.rstrip("/") + "/" + part
        try:
            sftp.mkdir(path)
        except:
            pass


SKIP_DIRS = {"data"}  # don't overwrite production data

def upload_dir(sftp, local_path, remote_path):
    sftp_mkdir_p(sftp, remote_path)
    for item in os.listdir(local_path):
        if item in SKIP_DIRS:
            continue
        local_item = os.path.join(local_path, item)
        remote_item = remote_path + "/" + item
        if os.path.isdir(local_item):
            upload_dir(sftp, local_item, remote_item)
        else:
            print(f"  {remote_item}")
            sftp.put(local_item, remote_item)


client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

print("Connecting to VPS...")
client.connect(HOST, username=USER, password=PASS)
print("Connected!")

sftp = client.open_sftp()

print(f"\nUploading dist/ -> {RELEASE_DIR}/dist")
upload_dir(sftp, LOCAL_DIST, f"{RELEASE_DIR}/dist")

print(f"\nUploading server/ -> {RELEASE_DIR}/server")
upload_dir(sftp, LOCAL_SERVER, f"{RELEASE_DIR}/server")

print(f"\nUploading package.json")
sftp.put(LOCAL_PKG, f"{RELEASE_DIR}/package.json")

sftp.close()

print("\nUpdating symlink and restarting PM2...")

def ssh_run(cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)

# Swap symlink atomically
ssh_run(f"ln -sfn {RELEASE_DIR} {CURRENT_LINK}")

# Link shared .env into the release
ssh_run(f"ln -sf /opt/codexyprospect/shared/.env {RELEASE_DIR}/.env")

# Install/update deps (production only, skip devDeps)
ssh_run(f"cd {CURRENT_LINK} && npm install --omit=dev 2>&1 | tail -3")

# Restart PM2 with env update
ssh_run("pm2 restart codexy-prospect --update-env && pm2 list")

client.close()
print("\nDone! Release:", timestamp)
