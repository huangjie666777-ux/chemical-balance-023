# 化学方程式配平工作台

Vue3、TypeScript和Vite基础项目，当前仅有页面入口，业务功能待实现。

## 本地运行

使用WSL已安装的Node.js22.19.0，node和npm已能直接调用。

项目依赖已安装，精确版本见package-lock.json。

```bash
npm run dev -- --port 5173
npm run build
npm test
```

页面默认仅监听127.0.0.1，端口被占用时可指定其他端口。尚无业务测试，测试命令使用Vitest。
