"""Đóng gói bộ cài: dist/thaiput_v<VERSION>.zip = 3 XLSX + 12 .gs + appsscript.json + hướng dẫn triển khai.

Chạy: python3 tools/build_release.py   (hoặc npm run build)
Chạy test trước: npm test. Script này chỉ đóng gói, không kiểm tra.
"""
import os, re, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
version = re.search(r"VERSION:\s*'([^']+)'", open(os.path.join(ROOT, 'src', 'Config.gs'), encoding='utf-8').read()).group(1)
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
out = os.path.join(ROOT, 'dist', f'thaiput_v{version}.zip')
base = f'thaiput_v{version}'

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(os.path.join(ROOT, 'templates'))):
        if f.endswith('.xlsx'): z.write(os.path.join(ROOT, 'templates', f), f'{base}/1_SPREADSHEETS/{f}')
    src = sorted(f for f in os.listdir(os.path.join(ROOT, 'src')) if f.endswith('.gs') or f == 'appsscript.json')
    assert len([f for f in src if f.endswith('.gs')]) == 12, 'Phải đủ 12 file .gs'
    for f in src: z.write(os.path.join(ROOT, 'src', f), f'{base}/2_APPS_SCRIPT/{f}')
    z.write(os.path.join(ROOT, 'docs', 'DEPLOY.md'), f'{base}/HUONG_DAN_TRIEN_KHAI.md')
    z.write(os.path.join(ROOT, 'docs', 'TAI_LIEU_TONG_HOP.md'), f'{base}/TAI_LIEU_TONG_HOP.md')
    z.write(os.path.join(ROOT, 'CHANGELOG.md'), f'{base}/CHANGELOG.md')
print('Created', out)
for i in zipfile.ZipFile(out).infolist(): print(f'  {i.file_size:>8}  {i.filename}')
