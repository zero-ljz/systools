import sys, os
import subprocess
from pathlib import Path

for cmd in [
    [sys.executable, Path.home() / 'Documents/Github/scripts/python/' / '1.py']
]:
    print(cmd)
    process = subprocess.Popen(cmd, cwd=os.getcwd(), shell=True)
    stdout, stderr = process.communicate()

    if process.returncode != 0:
        print(stderr)
        exit(1)

print('ok')