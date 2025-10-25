import locale
import os
import stat
import io
import platform
import psutil
import shutil
import urllib.request
import subprocess
import mimetypes
import chardet
import zipfile, tarfile, gzip, lzma
import py7zr
import zstandard as zstd
from urllib.parse import quote, unquote, unquote_plus
from bottle import Bottle, request, response, template, static_file, redirect, abort

script_dir = os.path.dirname(os.path.abspath(__file__))

def is_hidden(name, path):
    return name.startswith('.') or has_hidden_attribute(path)

def has_hidden_attribute(filepath): # Windows-specific hidden file check
    if platform.system() != 'Windows':
        return False
    try:
        attrs = os.stat(filepath).st_file_attributes
        # 检查文件是否包含隐藏属性
        return attrs & stat.FILE_ATTRIBUTE_HIDDEN != 0
    except FileNotFoundError:
        return False

app = Bottle()

@app.route('/')
def index():
    return static_file('index.html', root=script_dir, mimetype='text/html')

def get_disk_partitions(only_physical_devices=True):
    """
    跨平台获取所有磁盘分区信息
    返回列表，每个元素为字典，包含：
    {
        'device': 设备名 (Windows: C:\\, Linux: /dev/sda1),
        'mountpoint': 挂载点 (Windows: C:\\, Linux: /),
        'fstype': 文件系统类型 (NTFS/ext4 等),
        'opts': 挂载选项
    }
    :param only_physical_devices: 是否只包含物理设备
    :return: list[dict]
    """
    system = platform.system()
    partitions = psutil.disk_partitions(all=not only_physical_devices)
    disks = []

    for p in partitions:
        # 跳过不可访问或不是目录的挂载点（例如空光驱）
        if not os.path.exists(p.mountpoint) or not os.path.isdir(p.mountpoint):
            continue

        # 在 Linux 下可选过滤掉非物理设备
        if system == "Linux" and not p.device.startswith("/dev/"):
                continue

        disks.append({
            "device": p.device,
            "mountpoint": p.mountpoint,
            "fstype": p.fstype,
            "opts": p.opts,
        })
    return disks

# 获取磁盘分区列表
@app.get("/disks")
def list_disks():
    """返回系统磁盘分区列表（JSON）"""
    response.content_type = "application/json; charset=utf-8"
    data = get_disk_partitions(only_physical_devices=False)
    return {"disks": data}
    

# 获取文件列表
@app.get("/files")
def get_file_list():
    # --- 基础参数 ---
    directory = request.query.directory or "/"
    directory_path = os.path.abspath(directory)
    show_hidden = request.query.show_hidden in ["1", "true", "True", "on", "yes"]
    
    print("directory:", directory)

    # --- 分页参数 ---
    page = int(request.query.page or 1)
    per_page = int(request.query.per_page or 20)
    offset = (page - 1) * per_page

    # --- 排序参数 ---
    sort_by = request.query.sort_by or "name"  # 可选: name, size, created_at, modified_at
    order = request.query.order or "asc"       # asc 或 desc

    # --- 过滤参数 ---
    file_type = request.query.type  # 可选: file / dir
    keyword = request.query.keyword or ""

    # --- 获取文件列表 ---
    file_list = []
    for name in os.listdir(directory_path):
        file_path = os.path.join(directory_path, name)
        if not show_hidden and is_hidden(name, file_path):
            continue
        if keyword and keyword.lower() not in name.lower():
            continue

        is_dir = os.path.isdir(file_path)
        if file_type == "file" and is_dir:
            continue
        if file_type == "dir" and not is_dir:
            continue
        try:
            stat = os.stat(file_path)
        except FileNotFoundError: # 解决访问不了//wsl.localhost/Ubuntu
            continue
        file_info = {
            "name": name,
            "path": file_path,
            "size": stat.st_size,
            "is_directory": is_dir,
            "created_at": int(stat.st_ctime),
            "modified_at": int(stat.st_mtime)
        }
        file_list.append(file_info)

    # --- 排序 ---
    reverse = (order == "desc")
    if sort_by in ["name", "size", "created_at", "modified_at"]:
        file_list.sort(key=lambda f: f[sort_by], reverse=reverse)

    # --- 分页 ---
    total = len(file_list)
    paged_files = file_list[offset: offset + per_page]

    # --- 返回结果 ---
    return {
        "directory": directory_path,
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": (total + per_page - 1) // per_page,
        "files": paged_files
    }


# 创建文本文件
@app.post("/files")
def create_text_file():
    filename = request.json.get("filename")  # 文件名
    content = request.json.get("content", "")  # 初始内容，默认为空
    file_path = os.path.abspath(filename)

    if os.path.exists(file_path):
        response.status = 400
        return {"error": "File already exists."}

    # 创建父级目录（如果不存在）
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    # 写入文件
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    return {"message": "File created successfully."}

# 创建目录
@app.post("/directories")
def create_directory():
    directory = request.json.get("directory")
    directory_path = os.path.abspath(directory)

    if not os.path.exists(directory_path):
        os.makedirs(directory_path)
        return {"message": "Directory created successfully."}
    else:
        response.status = 400
        return {"error": "Directory already exists."}


# 删除文件或目录
@app.delete("/files/<filename:path>")
def delete_file(filename):
    file_path = os.path.abspath(unquote(filename))
    if os.path.isfile(file_path):
        os.remove(file_path)
        return {"message": "File deleted successfully."}
    elif os.path.isdir(file_path):
        shutil.rmtree(file_path)
        return {"message": "Directory deleted successfully."}
    else:
        response.status = 404
        return {"error": "File or directory not found."}

# 批量删除文件或目录
@app.post("/files/delete")
def delete_files():
    files = request.json.get("files")

    for filename in files:
        file_path = os.path.abspath(filename)

        if os.path.isfile(file_path):
            os.remove(file_path)
        elif os.path.isdir(file_path):
            shutil.rmtree(file_path)

    return {"message": "Files deleted successfully."}


# 复制、移动、重命名文件或目录
@app.post("/files/<filename:path>/actions")
def file_action(filename):
    action = request.json.get("action")
    destination = request.json.get("destination")

    source_path = os.path.abspath(filename)
    destination_path = os.path.abspath(destination)

    if os.path.exists(source_path):
        if action == "copy":
            if os.path.isfile(source_path):
                shutil.copy2(source_path, destination_path)
            elif os.path.isdir(source_path):
                shutil.copytree(source_path, destination_path)
            return {"message": "File or directory copied successfully."}
        elif action == "move":
            shutil.move(source_path, destination_path)
            return {"message": "File or directory moved successfully."}
        elif action == "rename":
            new_name = os.path.basename(destination_path)
            new_path = os.path.join(os.path.dirname(source_path), new_name)
            os.rename(source_path, new_path)
            return {"message": "File or directory renamed successfully."}

    response.status = 404
    return {"error": "File or directory not found."}


# 批量复制文件或目录
@app.post("/files/copy")
def copy_files():
    files = request.json.get("files")
    destination = request.json.get("destination")

    destination_path = os.path.abspath(destination)

    for filename in files:
        source_path = os.path.abspath(filename)

        if os.path.exists(source_path):
            if os.path.isfile(source_path):
                shutil.copy2(source_path, destination_path)
            elif os.path.isdir(source_path):
                shutil.copytree(source_path, os.path.join(destination_path, os.path.basename(source_path)))

    return {"message": "Files copied successfully."}


# 批量移动文件或目录
@app.post("/files/move")
def move_files():
    files = request.json.get("files")
    destination = request.json.get("destination")

    destination_path = os.path.abspath(destination)

    for filename in files:
        source_path = os.path.abspath(filename)

        if os.path.exists(source_path):
            shutil.move(source_path, destination_path)

    return {"message": "Files moved successfully."}


    # command_args = ["zip", "-r", "-q", zip_filename] + files_to_pack  # 构造命令行参数
    # print(command_args)
    # stdout = subprocess.run(command_args, capture_output=True, text=True, encoding='utf-8', errors='ignore').stdout
    # return {"message": stdout}
    
# 打包文件或目录
@app.post("/files/pack")
def pack_files():
    files_to_pack = request.json.get("files")  # 获取要打包的文件列表
    archive_filename = request.json.get("archive_filename")  # 获取目标文件名

    ext = archive_filename.lower()

    if ext.endswith(".zip"):
        return pack_zip(files_to_pack, archive_filename)
    elif ext.endswith((".tar.gz", ".tgz")):
        return pack_tar(files_to_pack, archive_filename, "gz")
    elif ext.endswith((".tar.xz", ".txz")):
        return pack_tar(files_to_pack, archive_filename, "xz")
    elif ext.endswith(".tar.bz2"):
        return pack_tar(files_to_pack, archive_filename, "bz2")
    elif ext.endswith(".7z"):
        return pack_7z(files_to_pack, archive_filename)
    elif ext.endswith(".gz"):
        return pack_gz(files_to_pack, archive_filename)
    elif ext.endswith(".xz"):
        return pack_xz(files_to_pack, archive_filename)
    elif ext.endswith(".zst"):
        return pack_zst(files_to_pack, archive_filename)
    else:
        abort(400, f"Unsupported archive format: {archive_filename}")



def pack_zip(files_to_pack, zip_filename):
    with zipfile.ZipFile(zip_filename, "w", zipfile.ZIP_DEFLATED) as zip_file:  # 创建 ZIP 文件对象
        for file_path in files_to_pack:
            file_name = os.path.basename(file_path)  # 获取文件名
            if os.path.isfile(file_path):  # 如果是文件
                zip_file.write(file_path, arcname=file_name)  # 将文件写入 ZIP，使用文件名作为目标路径
            elif os.path.isdir(file_path):  # 如果是目录
                base_dir = os.path.basename(file_path)  # 获取目录的基本名称
                for root, dirs, files in os.walk(file_path):  # 遍历目录中的文件和子目录
                    if not files and not dirs: # 添加空目录
                        rel_path = os.path.relpath(root, os.path.join(file_path, '..'))
                        zip_file.writestr(rel_path + '/', '')  # 注意加斜杠表示目录
                    for file in files:
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path,  os.path.join(file_path, '..'))
                        zip_file.write(full_path, rel_path)

    return {"message": "Files packed successfully."}  # 返回成功消息




def pack_tar1(files_to_pack, tar_filename, compression_type): # 文件名乱码
    """
    支持多文件、目录递归、保留相对路径、空目录打包的 tar 打包函数
    """
    mode = "w:" + compression_type if compression_type else "w"

    # 找到所有文件路径的公共父目录（保证相对路径结构）
    common_base = os.path.commonpath(files_to_pack)

    with tarfile.open(tar_filename, mode) as tar_file:
        for path in files_to_pack:
            if not os.path.exists(path):
                continue

            rel_base = os.path.relpath(path, common_base)

            if os.path.isfile(path):
                tar_file.add(path, arcname=rel_base)
            elif os.path.isdir(path):
                # 遍历目录树
                for root, dirs, files in os.walk(path):
                    rel_root = os.path.relpath(root, common_base)

                    # ✅ 空目录打包
                    if not dirs and not files:
                        info = tarfile.TarInfo(rel_root)
                        info.type = tarfile.DIRTYPE
                        info.mtime = int(os.path.getmtime(root))
                        tar_file.addfile(info)
                        continue

                    # ✅ 文件打包
                    for f in files:
                        full_path = os.path.join(root, f)
                        rel_path = os.path.relpath(full_path, common_base)
                        tar_file.add(full_path, arcname=rel_path)

    return {"message": f"Files packed successfully into {compression_type.upper()} tar."}

def pack_tar(files_to_pack, tar_filename, compression_type):
    compression_flags = {
        "gz": "z",
        "bz2": "j",
        "xz": "J",
        "": "",
    }
    compress_flag = compression_flags.get(compression_type, "")

    # 找到公共父目录
    common_base = os.path.commonpath(files_to_pack)

    # 确保输出目录存在
    output_dir = os.path.dirname(tar_filename)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # 切换到公共父目录再打包（保证相对路径）
    command = ["tar", f"cv{compress_flag}f", tar_filename]
    # 使用相对路径
    rel_paths = [os.path.relpath(path, common_base) for path in files_to_pack]
    command.extend(rel_paths)

    try:
        subprocess.run(command, cwd=common_base, check=True)
        return {"message": f"Files packed successfully into {compression_type.upper()} tar."}
    except subprocess.CalledProcessError as e:
        abort(500, f"Failed to pack files: {str(e)}")

def pack_7z(files_to_pack, archive_filename):
    with py7zr.SevenZipFile(archive_filename, mode='w') as archive:
        for file_path in files_to_pack:
            if os.path.isfile(file_path):  # 如果是文件
                archive.write(file_path, arcname=os.path.basename(file_path))  # 将文件写入 7z
            elif os.path.isdir(file_path):  # 如果是目录
                base_dir = os.path.basename(file_path)  # 获取目录的基本名称
                for root, dirs, files in os.walk(file_path):  # 遍历目录中的文件和子目录
                    # 处理空目录，py7zr 不会自动添加空目录
                    if not files and not dirs:
                        rel_path = os.path.relpath(root, os.path.join(file_path, '..'))
                        archive.write(root, arcname=rel_path + '/')  # 注意加斜杠表示目录
                    # 添加文件
                    for file in files:
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path, os.path.join(file_path, '..'))
                        archive.write(full_path, arcname=rel_path)
    return {"message": "Files packed successfully into 7z."}


def pack_gz(files_to_pack, gz_filename):
    with gzip.open(gz_filename, "wb") as gz_file:
        for file_path in files_to_pack:
            with open(file_path, "rb") as f:
                gz_file.write(f.read())
    return {"message": "Files packed successfully into GZ."}


def pack_xz(files_to_pack, xz_filename):
    with lzma.open(xz_filename, "wb") as xz_file:
        for file_path in files_to_pack:
            with open(file_path, "rb") as f:
                xz_file.write(f.read())
    return {"message": "Files packed successfully into XZ."}


def pack_zst(files_to_pack, zst_filename):
    with open(zst_filename, 'wb') as zst_file:
        with zstd.ZstdCompressor().stream_writer(zst_file) as compressor:
            for file_path in files_to_pack:
                with open(file_path, 'rb') as f:
                    compressor.write(f.read())
    return {"message": "Files packed successfully into ZST."}


# 解压文件
@app.post("/files/unpack")
def unpack_files():
    archive_filename = request.json.get("archive_filename")
    extract_directory = request.json.get("extract_directory")
    extract_directory_path = os.path.abspath(extract_directory)
    os.makedirs(extract_directory_path, exist_ok=True)

    # 获取扩展名（统一小写）
    basename = os.path.basename(archive_filename).lower()
    ext = None
    for candidate in [".tar.gz", ".tgz", ".tar.xz", ".txz", ".tar.bz2", ".zip", ".7z", ".gz", ".xz", ".zst"]:
        if basename.endswith(candidate):
            ext = candidate
            break

    if not ext:
        return {"error": "Unsupported or unknown file format"}

    try:
        if ext == ".zip":
            with zipfile.ZipFile(archive_filename, "r") as zip_file:
                zip_file.extractall(extract_directory_path)

        elif ext in [".tar.gz", ".tgz"]:
            with tarfile.open(archive_filename, "r:gz") as tar:
                tar.extractall(path=extract_directory_path)

        elif ext in [".tar.xz", ".txz"]:
            with tarfile.open(archive_filename, "r:xz") as tar:
                tar.extractall(path=extract_directory_path)

        elif ext == ".tar.bz2":
            with tarfile.open(archive_filename, "r:bz2") as tar:
                tar.extractall(path=extract_directory_path)

        elif ext == ".7z":
            with py7zr.SevenZipFile(archive_filename, mode="r") as archive:
                archive.extractall(path=extract_directory_path)

        elif ext == ".gz":
            out_path = os.path.join(extract_directory_path, os.path.splitext(os.path.basename(archive_filename))[0])
            with gzip.open(archive_filename, "rb") as f_in, open(out_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)

        elif ext == ".xz":
            out_path = os.path.join(extract_directory_path, os.path.splitext(os.path.basename(archive_filename))[0])
            with lzma.open(archive_filename, "rb") as f_in, open(out_path, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)

        elif ext == ".zst":
            out_path = os.path.join(extract_directory_path, os.path.splitext(os.path.basename(archive_filename))[0])
            with open(archive_filename, "rb") as f_in, open(out_path, "wb") as f_out:
                dctx = zstd.ZstdDecompressor()
                dctx.copy_stream(f_in, f_out)

        else:
            return {"error": f"Unsupported format: {ext}"}

    except Exception as e:
        return {"error": str(e)}

    return {"message": f"Files unpacked to {extract_directory_path}"}

# 上传多个文件
@app.post("/files/upload")
def upload_files():
    directory = request.forms.get("directory", "/")
    upload_path = os.path.abspath(directory)

    files = request.files.getall("files")  # 获取多个文件
    if not files:
        return {"error": "No files uploaded."}

    for file in files:
        filename = file.raw_filename # 使用 raw_filename 来获取原始的文件名
        file_path = os.path.join(upload_path, filename)
        file.save(file_path)

    return {"message": f"{len(files)} file(s) uploaded successfully."}


# 从远程URL上传文件
@app.post("/files/upload/remote")
def upload_remote_file():
    directory = request.json.get("directory", "/")
    upload_path = os.path.abspath(directory)

    url = request.json.get("url")
    print(url)
    filename = os.path.basename(url)
    file_path = os.path.join(upload_path, filename)

    urllib.request.urlretrieve(url, file_path)
    return {"message": "File uploaded successfully."}


# 下载文件
@app.get('/files/download/<filename:path>')
def download_file(filename):
    file_path = os.path.abspath(unquote(filename))
    filename = os.path.basename(file_path)

    # 检查文件是否存在
    if not os.path.isfile(file_path):
        response.status = 404
        return {'error': 'File not found'}

    # 识别 MIME 类型
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = 'application/octet-stream'

    # 设置下载响应头
    response.content_type = mime_type
    response.set_header('Content-Disposition', f'attachment; filename="{quote(filename)}"')
    response.set_header('Content-Length', os.path.getsize(file_path))

    # 以流的方式读取文件内容（避免大文件一次性加载内存）
    def file_iterator(path, chunk_size=8192):
        with open(path, 'rb') as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    return file_iterator(file_path)

# 预览文件
@app.get('/files/preview/<filename:path>')
def preview_file(filename):
    file_path = os.path.abspath(unquote(filename))
    filename = os.path.basename(file_path)

    # 检查文件是否存在
    if not os.path.isfile(file_path):
        response.status = 404
        return {'error': 'File not found'}

    # 识别 MIME 类型
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = 'application/octet-stream'

    # 若是文本文件类型，尝试检测编码
    encoding = None
    if mime_type.startswith('text/'):
        try:
            # 仅读取前4KB进行检测，避免性能损失
            with open(file_path, 'rb') as f:
                raw_head = f.read(4096)
                result = chardet.detect(raw_head)
                encoding = result.get('encoding') or 'utf-8'
                confidence = result.get('confidence', 0)

                # 若置信度低，则默认UTF-8
                if confidence < 0.5:
                    encoding = 'utf-8'
        except Exception:
            encoding = 'utf-8'

        mime_type += f'; charset={encoding.lower()}'

    # 设置响应头
    response.content_type = mime_type
    response.set_header('Content-Disposition', f'inline; filename="{quote(filename)}"')

    # 返回文件内容
    with open(file_path, 'rb') as f:
        return f.read()



# 获取文件内容
@app.get("/files/content/<filename:path>")
def get_file_content(filename):
    file_path = os.path.abspath(unquote(filename))

    # 检查文件是否存在
    if not os.path.isfile(file_path):
        abort(404, "File not found.")

    # 检查文件大小，避免读取巨型文件
    max_size = 5 * 1024 * 1024  # 5MB
    file_size = os.path.getsize(file_path)
    if file_size > max_size:
        abort(400, f"File too large to preview ({file_size // 1024} KB).")

    # 读取前 4KB 判断文件类型
    with open(file_path, "rb") as f:
        raw_head = f.read(4096)

    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "application/octet-stream"

    # 若 MIME 不是 text/*，则进一步检测
    if not mime_type.startswith("text/"):
        if len(raw_head) == 0:
            # ✅ 空文件直接认为是文本文件
            mime_type = "text/plain"
        else:
            text_char_ratio = sum(32 <= b <= 126 or b in (9, 10, 13) for b in raw_head) / len(raw_head)
            if text_char_ratio < 0.85:  # 阈值可调
                abort(400, "Binary file cannot be previewed as text.")
            mime_type = "text/plain"

    # 检测文本编码
    if len(raw_head) > 0:
        result = chardet.detect(raw_head)
        encoding = result.get('encoding') or 'utf-8'
        confidence = result.get('confidence', 0)
        if confidence < 0.5:
            encoding = 'utf-8'
    else:
        # ✅ 空文件默认UTF-8
        encoding = 'utf-8'

    # 读取完整内容
    try:
        with open(file_path, "r", encoding=encoding, errors="replace") as f:
            content = f.read()
    except Exception:
        abort(400, f"Failed to read file with detected encoding: {encoding}")

    return {
        "content": content,
        "encoding": encoding,
        "mime_type": mime_type
    }

# 编辑文本文件
@app.post("/files/edit")
def edit_text_file():
    file_path = request.forms.get("file_path")
    content = request.forms.get("content")

    # 检查文件是否存在
    if not os.path.isfile(file_path):
        abort(404, "File not found.")

    # 使用 mimetypes 模块获取文件的 MIME 类型
    mime_type, encoding = mimetypes.guess_type(file_path)

    # 判断文件是否为文本文件
    # if not mime_type or not mime_type.startswith("text/"):
    #     abort(400, "Only text files can be accessed.")

    # 写入新的文件内容
    with open(file_path, "w") as file:
        file.write(content)

    return {"message": "File edited successfully."}



if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description='Run the development server.')
    parser.add_argument('--host', '-H', default='0.0.0.0', help='Host to listen on (default: 0.0.0.0)')
    parser.add_argument('--port', '-p', type=int, default=8000, help='Port to listen on (default: 8000)')
    args = parser.parse_args()

    app.run(host=args.host, port=args.port, debug=True, reloader=False, server='cheroot')
