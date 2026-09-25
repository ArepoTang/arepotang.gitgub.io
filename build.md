# Phi 打包指南

本文面向希望自行将 Phi 的源码构建为 Android 安装包的读者。构建工具为
**buildozer + python-for-android (p4a)**，文中命令可直接使用。

界面参数与使用方式见 [app_1.md](app_1.md)。

- 适用环境：Ubuntu 或 WSL2（推荐），Android 上的 Termux 亦可用（见 2.2）
- 耗时：首次构建通常 40 分钟以上，其中大部分时间用于下载 Android SDK 与 NDK（约 2 GB）；
  此后命中缓存的构建约 5 分钟
- 磁盘占用：约 5–6 GB（SDK 约 0.8 GB、NDK 约 1.8 GB，其余为构建缓存）
- 输出：`bin/io-0.1-arm64-v8a-debug.apk`（调试包）或 `bin/io-0.1-arm64-v8a-release.apk`（正式包），
  适用于 arm64 设备

## 1. 获取源码

```bash
git clone https://gitee.com/a231216/phi.git
cd phi
```

仓库内容为 App 本体：`app.py`（Flask 服务）、`poster.py` / `halftone.py`（图像处理）、
`templates/index.html`（界面）、`test_app.py` / `test_ui.js`（自检脚本）、`icon.png`。

如需先在电脑上运行确认效果：

```bash
pip install -r requirements.txt
python3 app.py        # 浏览器访问 http://127.0.0.1:8080
```

## 2. 准备构建环境

### 2.1 Ubuntu / WSL2

```bash
sudo apt update
sudo apt install -y git zip unzip openjdk-17-jdk python3-pip \
    build-essential ccache autoconf automake libtool libltdl-dev \
    pkg-config cmake zlib1g-dev libffi-dev libssl-dev

pip install --upgrade buildozer cython setuptools wheel
```

JDK 需为 **17**。`libltdl-dev` 为必需项：缺少它时编译 libffi 会在 `autoreconf` 阶段报
`possibly undefined macro: LT_SYS_SYMBOL_USCORE`。

### 2.2 Termux

```bash
pkg install python git openjdk-17 zip unzip
pip install --upgrade buildozer cython setuptools wheel
```

Termux 环境下还需两项额外配置：

- 在 `buildozer.spec` 中指定系统安装的 SDK/NDK 路径：
  `android.sdk_path = /data/data/com.termux/files/usr/opt/android-sdk`、
  `android.ndk_path = /data/data/com.termux/files/usr/opt/android-ndk`
- 编译时提高 host 侧的 target API：
  `export CFLAGS="-target aarch64-linux-android31"`（`CXXFLAGS` 同理）。
  Termux 的 clang 默认 target 为 `android24`，而 bionic 中的 `pthread_getname_np@26`、
  `sem_clockwait@30` 等函数需更高 API 才声明，否则需逐项处理编译检查

## 3. 补齐构建配置

App 源码中不含构建配置，需在仓库根目录准备以下 4 项：

| 文件 | 作用 |
|---|---|
| `buildozer.spec` | 构建配置：应用名、包名、依赖、架构、签名产物类型 |
| `main.py` | p4a 的启动入口：设置 `PORT` 与 `TMPDIR`，随后 `import app` 启动服务 |
| `p4a-recipes/` | `opencv-python` 与 `pyyaml` 的自定义 p4a 配方（使用 Flet 的移动端预编译 wheel，避免从源码编译 OpenCV） |
| `ci/` | p4a 的补丁文件与打补丁脚本（第 6 步使用） |

`main.py` 内容如下：

```python
#!/usr/bin/env python3
"""p4a 的入口。webview bootstrap 会 ping localhost:5000, 通了才打开界面。"""
import os

os.environ.setdefault("PORT", "5000")
os.environ.setdefault("TMPDIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".work"))

import app

if __name__ == "__main__":
    app.main()
```

`buildozer.spec` 可先由 `buildozer init` 生成，再按下表修改（未列出的字段保持默认值）：

| 字段 | 值 | 说明 |
|---|---|---|
| `title` | `Phi` | 应用名 |
| `package.domain` / `package.name` | `com.phi` / `io` | 包名为 `com.phi.io` |
| `version` | `0.1` | 版本号 |
| `source.include_exts` | `py,html,css,js,png,jpg` | 需要打包的文件类型 |
| `requirements` | `python3,flask,numpy,pillow,pyyaml,opencv-python` | 包内依赖以本字段为准（不是 `requirements.txt`）；名称须小写 |
| `p4a.bootstrap` | `webview` | 以 webview 外壳承载 Flask 界面 |
| `p4a.port` | `5000` | 必须与 `main.py` 中的 `PORT` 一致 |
| `p4a.local_recipes` | `./p4a-recipes` | 使用本节所列的两个配方 |
| `p4a.source_dir` | 已打补丁的 p4a 目录 | 见第 6 步；**必须写在 `[app]` 段中** |
| `p4a.extra_args` | `--extra-index-url https://pypi.flet.dev --use-prebuilt-version-for numpy --use-prebuilt-version-for pillow --use-prebuilt-version-for pyyaml --use-prebuilt-version-for opencv-python` | 优先使用预编译 wheel |
| `android.api` | `35` | 目标 API 级别 |
| `android.archs` | `arm64-v8a` | 仅构建 64 位包 |
| `android.accept_sdk_license` | `True` | 自动接受 SDK 许可 |
| `icon.filename` | `icon.png` | 应用图标 |
| `orientation` | `portrait` | 竖屏 |
| `android.release_artifact` | `apk` | 仅构建正式包时需要（默认值为 `aab`） |

## 4. 构建调试包

```bash
buildozer -v android debug
```

- 首次构建需下载 SDK/NDK 并编译 Python 及各项依赖，通常 40 分钟以上；产物位于
  `bin/io-0.1-arm64-v8a-debug.apk`
- 此后仅修改界面等资源文件时属增量构建，耗时明显缩短
- 将产物传输到手机后直接安装（首次需允许「安装未知来源应用」）

## 5. 构建正式包（可选，需签名）

调试包使用自动生成的调试密钥。若要发布，需自行生成 keystore：

```bash
keytool -genkey -v -keystore key.p12 -storetype PKCS12 \
    -alias mykey -keyalg RSA -keysize 2048 -validity 10000

export P4A_RELEASE_KEYSTORE=$PWD/key.p12
export P4A_RELEASE_KEYALIAS=mykey
export P4A_RELEASE_KEYSTORE_PASSWD='你的密码'
export P4A_RELEASE_KEYALIAS_PASSWD='你的密码'
buildozer -v android release
```

注意事项：

- 上述**四个环境变量必须全部提供**，缺少任意一个时产物为 `*-release-unsigned.apk`，无法安装
- keystore 不应提交到仓库，也不应放在项目目录内：p4a 会将项目目录整体打包进 APK
- 调试包与正式包签名不同：设备上已安装调试包的，安装正式包前需先卸载
- 如需确认签名主体：
  `$ANDROID_SDK/build-tools/*/apksigner verify --print-certs bin/*.apk`

## 6. 为 p4a 打补丁（必需）

p4a 的 webview bootstrap 缺少下列能力，必须在编译前补齐，否则对应功能不可用：

| 缺失项 | 现象 |
|---|---|
| `WebChromeClient.onShowFileChooser` | 点击「选择文件」无响应，无法选择图片 |
| `WebView.setDownloadListener` | 导出 YAML、「保存图片」无响应 |
| 启动动画（Lottie） | 启动阶段仅显示 p4a 自带的静态图或默认加载界面 |

做法是将 p4a 源码克隆到项目之外，打补丁后由 `buildozer.spec` 指向该目录：

```bash
git clone --depth 1 https://github.com/kivy/python-for-android.git ~/p4a
sh ci/apply-p4a-overrides.sh ~/p4a        # 拷贝补丁文件，并向 PythonActivity.java 插入代码
```

脚本依据 `PythonActivity.java` 中的固定锚点插入代码，锚点不存在时会直接报错退出
（p4a 版本变更后可能需重新确认锚点位置）。打补丁完成后：

```ini
p4a.source_dir = /home/你的用户名/p4a      # 必须位于 [app] 段中
```

此处最常见的错误是**字段位置**：buildozer 只从 `[app]` 段读取 `p4a.source_dir`，
写在文件末尾会落入 `[buildozer]` 段并被忽略，buildozer 将自行下载上游 p4a，
导致补丁完全未生效——安装包可以正常产出，但选文件与下载功能不可用。

## 7. 安装与使用

直接安装 APK 文件。打开后依次操作：选择图片 → 选择方案 → 生成 → 通过「保存图片」另存到目标位置。

生成的图片位于应用私有目录（文件管理器中不可见），且每次启动 App 会清除上一轮的产物，
因此如需保留结果，须使用「保存图片」并经由系统的另存为流程。

## 8. 常见问题

| 现象 | 原因与处理 |
|---|---|
| 长时间停留在下载 SDK/NDK | 首次构建需下载约 2 GB；中断后重新执行会复用已有缓存 |
| `possibly undefined macro: LT_SYS_SYMBOL_USCORE` | 缺少 `libltdl-dev`（见 2.1） |
| 编译 OpenCV 耗时数小时 | `p4a-recipes/` 未正确放置，或 `p4a.extra_args` 缺少 `--extra-index-url https://pypi.flet.dev`，退化为源码编译 |
| 选文件、下载无响应 | p4a 补丁未生效：`p4a.source_dir` 未指向已打补丁的 p4a，或未写在 `[app]` 段中 |
| 安装时提示「应用未安装」 | 设备上已安装其他签名的版本（如调试包），需先卸载 |
| 产物文件名含 `-release-unsigned` | 第 5 步的四个环境变量未全部提供 |
| 报 Java 版本相关错误 | 需要 JDK 17 |
| 修改 `p4a.source_dir` 后无效果 | 该字段必须位于 `[app]` 段中；修改 spec 会使缓存失效，重建耗时更长 |
