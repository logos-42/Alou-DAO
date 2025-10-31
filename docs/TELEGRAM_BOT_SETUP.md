# Telegram Bot 告警设置指南

## 为什么使用 Telegram？

- ✅ 即时通知（比邮件快）
- ✅ 手机推送
- ✅ 免费
- ✅ 可以创建命令交互
- ✅ 支持群组通知

## 快速设置（10分钟）

### 步骤 1: 创建 Telegram Bot

1. **打开 Telegram，搜索 @BotFather**

2. **发送命令创建 Bot**
   ```
   /newbot
   ```

3. **按提示操作**
   ```
   BotFather: Alright, a new bot. How are we going to call it?
   你: DIAP Monitor Bot
   
   BotFather: Good. Now let's choose a username for your bot.
   你: diap_monitor_bot
   
   BotFather: Done! Congratulations on your new bot.
   Here is your token: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

4. **保存 Bot Token**
   ```bash
   # 在 .env 文件中添加
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

### 步骤 2: 获取 Chat ID

#### 方法 A: 个人聊天（推荐）

1. **给你的 Bot 发送一条消息**
   ```
   /start
   ```

2. **访问以下 URL**
   ```
   https://api.telegram.org/bot<你的BOT_TOKEN>/getUpdates
   ```

3. **找到 Chat ID**
   ```json
   {
     "ok": true,
     "result": [{
       "message": {
         "chat": {
           "id": 123456789,  // 这就是你的 Chat ID
           "first_name": "Your Name",
           "type": "private"
         }
       }
     }]
   }
   ```

4. **保存 Chat ID**
   ```bash
   # 在 .env 文件中添加
   TELEGRAM_CHAT_ID=123456789
   ```

#### 方法 B: 群组聊天（团队使用）

1. **创建一个 Telegram 群组**

2. **把 Bot 添加到群组**
   - 点击群组名称
   - 点击 "Add Members"
   - 搜索你的 Bot
   - 添加

3. **给 Bot 管理员权限**（可选）

4. **在群组中发送消息**
   ```
   /start
   ```

5. **获取群组 Chat ID**
   ```
   访问: https://api.telegram.org/bot<你的BOT_TOKEN>/getUpdates
   
   群组 Chat ID 通常是负数，如: -1001234567890
   ```

### 步骤 3: 测试 Bot

```bash
# 运行测试脚本
node scripts/monitoring/telegram_alert.js

# 或使用 curl 测试
curl -X POST "https://api.telegram.org/bot<你的BOT_TOKEN>/sendMessage" \
  -d "chat_id=<你的CHAT_ID>" \
  -d "text=测试消息：DIAP 监控系统已启动 ✅"
```

如果收到消息，说明配置成功！

## 创建交互式 Bot

### 添加命令

```javascript
// scripts/telegram/bot_commands.js
const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('hardhat');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// 命令：/start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
🤖 DIAP 监控 Bot 已启动

可用命令：
/status - 查看系统状态
/balance - 查看合约余额
/staking - 查看质押信息
/alerts - 查看最近告警
/help - 帮助信息
    `);
});

// 命令：/status
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        // 获取合约状态
        const token = await ethers.getContractAt(
            "DIAPToken",
            process.env.DIAP_TOKEN_ADDRESS
        );
        
        const isPaused = await token.paused();
        const totalSupply = await token.totalSupply();
        const totalStaked = await token.totalStaked();
        
        const message = `
📊 *系统状态*

状态: ${isPaused ? '⏸️ 已暂停' : '✅ 正常运行'}
总供应: ${ethers.formatEther(totalSupply)} DIAP
总质押: ${ethers.formatEther(totalStaked)} DIAP
质押率: ${(Number(totalStaked) / Number(totalSupply) * 100).toFixed(2)}%

_更新时间: ${new Date().toLocaleString()}_
        `;
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, `❌ 获取状态失败: ${error.message}`);
    }
});

// 命令：/balance
bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const token = await ethers.getContractAt(
            "DIAPToken",
            process.env.DIAP_TOKEN_ADDRESS
        );
        
        const contractBalance = await token.balanceOf(process.env.DIAP_TOKEN_ADDRESS);
        const networkBalance = await token.balanceOf(process.env.DIAP_NETWORK_ADDRESS);
        
        const message = `
💰 *合约余额*

Token 合约: ${ethers.formatEther(contractBalance)} DIAP
Network 合约: ${ethers.formatEther(networkBalance)} DIAP

_更新时间: ${new Date().toLocaleString()}_
        `;
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, `❌ 获取余额失败: ${error.message}`);
    }
});

// 命令：/staking
bot.onText(/\/staking/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        const token = await ethers.getContractAt(
            "DIAPToken",
            process.env.DIAP_TOKEN_ADDRESS
        );
        
        const stats = await token.getTokenStats();
        
        const message = `
🔒 *质押信息*

总质押: ${ethers.formatEther(stats.totalStaked_)} DIAP
总奖励: ${ethers.formatEther(stats.totalRewards_)} DIAP
总燃烧: ${ethers.formatEther(stats.totalBurned_)} DIAP

_更新时间: ${new Date().toLocaleString()}_
        `;
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, `❌ 获取质押信息失败: ${error.message}`);
    }
});

// 命令：/help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
📖 *帮助信息*

*可用命令：*
/start - 启动 Bot
/status - 查看系统状态
/balance - 查看合约余额
/staking - 查看质押信息
/alerts - 查看最近告警
/help - 显示此帮助

*告警说明：*
🚨 严重告警 - 需要立即处理
⚠️ 警告 - 需要关注
ℹ️ 信息 - 仅供参考

*联系方式：*
GitHub: https://github.com/你的用户名
Discord: https://discord.gg/你的服务器
    `, { parse_mode: 'Markdown' });
});

console.log('Telegram Bot 已启动...');
```

### 运行 Bot

```bash
# 安装依赖
npm install node-telegram-bot-api

# 运行 Bot（保持运行）
node scripts/telegram/bot_commands.js

# 或使用 PM2（推荐）
npm install -g pm2
pm2 start scripts/telegram/bot_commands.js --name diap-bot
pm2 save
pm2 startup
```

## 集成到监控系统

### 修改健康检查脚本

```javascript
// scripts/monitoring/health_check.js
// 在文件末尾添加

const TelegramAlert = require('./telegram_alert');

async function main() {
    // ... 现有的健康检查代码 ...
    
    // 发送报告到 Telegram
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        const alert = new TelegramAlert();
        await alert.sendHealthReport(report);
    }
}
```

### 自动化告警

```javascript
// scripts/monitoring/auto_alert.js
const { ethers } = require('hardhat');
const TelegramAlert = require('./telegram_alert');

const alert = new TelegramAlert();

// 监听大额转账
async function monitorLargeTransfers() {
    const token = await ethers.getContractAt(
        "DIAPToken",
        process.env.DIAP_TOKEN_ADDRESS
    );
    
    token.on("Transfer", async (from, to, amount) => {
        const amountInDIAP = ethers.formatEther(amount);
        
        if (Number(amountInDIAP) > 100000) {
            await alert.sendAlert(
                "大额转账检测",
                `
从: ${from}
到: ${to}
金额: ${amountInDIAP} DIAP
                `,
                "warning"
            );
        }
    });
}

// 监听合约暂停
async function monitorPause() {
    const token = await ethers.getContractAt(
        "DIAPToken",
        process.env.DIAP_TOKEN_ADDRESS
    );
    
    token.on("Paused", async (account) => {
        await alert.sendAlert(
            "合约已暂停",
            `
操作者: ${account}
时间: ${new Date().toLocaleString()}

⚠️ 请立即检查系统！
                `,
                "critical"
            );
        });
}

// 启动监控
async function main() {
    console.log("启动自动告警系统...");
    
    await monitorLargeTransfers();
    await monitorPause();
    
    console.log("✅ 监控已启动");
}

main();
```

## 高级功能

### 1. 按钮交互

```javascript
// 添加内联按钮
bot.sendMessage(chatId, "检测到异常，需要暂停合约吗？", {
    reply_markup: {
        inline_keyboard: [[
            { text: "✅ 是", callback_data: "pause_yes" },
            { text: "❌ 否", callback_data: "pause_no" }
        ]]
    }
});

// 处理按钮点击
bot.on('callback_query', async (query) => {
    if (query.data === 'pause_yes') {
        // 执行暂停操作
        await pauseContracts();
        bot.answerCallbackQuery(query.id, { text: "合约已暂停" });
    }
});
```

### 2. 定时报告

```javascript
// 每天早上 9 点发送日报
const cron = require('node-cron');

cron.schedule('0 9 * * *', async () => {
    const report = await generateDailyReport();
    await alert.sendMessage(report);
});
```

### 3. 多用户支持

```javascript
// 允许多个用户接收告警
const ADMIN_CHAT_IDS = [
    123456789,  // 你的 Chat ID
    987654321,  // 团队成员 1
    456789123   // 团队成员 2
];

async function sendToAllAdmins(message) {
    for (const chatId of ADMIN_CHAT_IDS) {
        await bot.sendMessage(chatId, message);
    }
}
```

## 安全建议

### ✅ 应该做的

1. **保护 Bot Token**
   - 不要提交到 Git
   - 使用环境变量
   - 定期更换

2. **限制访问**
   - 只允许特定用户使用命令
   - 验证 Chat ID

3. **日志记录**
   - 记录所有命令
   - 记录告警历史

### ❌ 不应该做的

1. **不要**公开 Bot Token
2. **不要**让 Bot 执行危险操作（如转账）
3. **不要**在公开群组使用
4. **不要**忽略告警

## 故障排查

### 问题：Bot 不响应

```bash
# 检查 Bot Token
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe

# 检查 Bot 是否在运行
ps aux | grep bot_commands

# 查看日志
pm2 logs diap-bot
```

### 问题：收不到消息

```bash
# 检查 Chat ID
echo $TELEGRAM_CHAT_ID

# 测试发送
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/sendMessage" \
  -d "chat_id=<YOUR_CHAT_ID>" \
  -d "text=测试"
```

### 问题：命令不工作

```bash
# 检查 Bot 权限
# 在 BotFather 中：
/mybots
选择你的 Bot
Bot Settings
Group Privacy
关闭（Disable）
```

## 成本

- ✅ 完全免费
- ✅ 无限消息
- ✅ 无限用户
- ✅ 无限 Bot

## 资源链接

- Telegram Bot API: https://core.telegram.org/bots/api
- node-telegram-bot-api: https://github.com/yagop/node-telegram-bot-api
- BotFather: https://t.me/BotFather

---

**下一步**: 设置完 Telegram Bot 后，配置自动化监控脚本。

🎯 目标：随时随地掌握系统状态！
