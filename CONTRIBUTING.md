# 参与开发

开发与测试使用 Node.js 20 或更新版本。DSH 运行时仍以其自带的 Node.js、React 和服务包为准。

```text
git clone https://github.com/Ether0516/dsh-aquarium.git
cd dsh-aquarium
npm run build
npm test
```

基础构建和行为测试只使用 Node.js 内置模块，不需要先安装 npm 依赖。

## Windows 浮窗

项目已包含 `native/bin/DSHDesktopPet.exe`，普通使用者不需要编译器。修改 `native/DesktopPet.cs` 后，在 Windows 上执行：

```text
npm run build:native
node scripts/qa-native.cjs
```

编译使用 Windows .NET Framework 自带的 C# 编译器。绘制检查会把每个姿势的清晰版和像素版写到 `qa/native/`；不打开界面。需要人工观察时执行 `node scripts/qa-native.cjs --window`，测试窗口会临时出现在任务栏；实际使用的浮窗不显示任务栏入口。

不要在桌宠仍运行时覆盖它的 EXE。先退出 DSH 或关闭测试程序，再重新编译。

## 可选浏览器检查

安装只用于开发的测试依赖：

```text
npm install --no-save --package-lock=false playwright pngjs react@18.3.1 react-dom@18.3.1
node scripts/qa-render.cjs
```

Windows 默认使用已安装的 Edge；其他平台需先运行 `npx playwright install chromium`。可用 `DSH_QA_BROWSER` 指定浏览器程序路径。检查在本机临时 HTTP 页面中渲染插件，使用模拟 DSH 服务，不会发送模型请求。

## 打包

```text
npm run build
npm test
npm run pack:local
```

安装包输出到 `dist/dsh-aquarium-<版本>.tgz`。包中包含运行所需的 `lib/`、PNG、样式配置和 Windows 浮窗，保留维护所需的源码、测试与文档。`dist/`、`qa/` 和个人设置不提交到仓库。

角色维护请阅读 [SKINS.md](SKINS.md)。报告问题时请提供 DSH 版本、操作系统、复现步骤，以及问题发生在设置预览、应用内角色还是 Windows 浮窗中。
