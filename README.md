<p align="center">
 <img width="150" height="150" alt="icon" src="https://github.com/user-attachments/assets/bdae1498-b9a5-472a-b6d2-097634ab303b" />

</p>

<h1 align="center">🦀 OneClaw</h1>

<p align="center">
  <strong>One Minute Install, One OpenClaw.</strong><br/>
  一分钟装好，即刻开聊。零配置、零依赖的 <a href="https://github.com/anthropics/claude-code">OpenClaw</a> 桌面客户端。
</p>

<p align="center">
  <a href="https://github.com/oneclaw/oneclaw/releases/latest"><img src="https://img.shields.io/github/v/release/oneclaw/oneclaw?style=flat-square&color=c0392b" alt="Latest Release" /></a>
  <a href="https://github.com/oneclaw/oneclaw/releases"><img src="https://img.shields.io/github/downloads/oneclaw/oneclaw/total?style=flat-square&color=c0392b" alt="Downloads" /></a>
  <a href="https://github.com/oneclaw/oneclaw/blob/main/LICENSE"><img src="https://img.shields.io/github/license/oneclaw/oneclaw?style=flat-square" alt="License" /></a>
</p>

---
## 本地开发环境搭建
1. git clone https://github.com/kxSchool/oneclaw.git
2. node 22.12.0 (最好用nvm安装，因为内置的最新版openclaw需要22.16.0以上)
3. npm install 加载项目依赖库
4. 切换到node 22.16.0版本，在项目内安装openclaw (例：npm install --save-dev openclaw@2026.3.13)
5. 启动dev开发环境,并配置模型，这里建议本地ollama，有内置免费的大模型限额可用(npm run dev)
6. 在vscode中新开一个命令行，执行openclaw gateway
7. 再次启动dev开发环境，oneclaw会提示已安装openclaw，选退出。
8. 这时电脑右下角的oneclaw已经可以正常连接openclaw了,可以开始本地开发环境创作新插件
9. 如果想在DEV开发环境中完整使用OneClaw,先用打包好的安装程序设置好微信和QQ之类的功能，再启动DEV进行程序开发。
10. <img width="1920" height="1043" alt="1464659e2454a5b8395b151f26476f17" src="https://github.com/user-attachments/assets/8edaab24-aa57-430c-a125-b9a73205a735" />


---

## 📄 License

GNU Affero General Public License v3.0 (`AGPL-3.0-only`).

Commercial use is allowed, but if you modify and distribute this software, or provide a modified version over a network, you must provide the corresponding source code under AGPL v3.
